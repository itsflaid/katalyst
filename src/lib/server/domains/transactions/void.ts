import { db } from '$lib/server/db';
import { discount, product, transaction, transactionItem } from '$lib/server/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { receiptTotals } from '$lib/analytics';
import { actorOf } from '$lib/server/domains/activity/log';
import type { Tenant } from '$lib/server/domains/auth/guards';

export interface VoidInput {
  businessId: string;
  userId: string;
  actor: Tenant['user'];
  txIdRaw: unknown;
  net: { ip: string | null; userAgent: string | null };
}

export type VoidResult = { ok: true } | { ok: false; code: number; message: string };

// Void struk: hapus header + items atomik berurutan. OWNER-only, kasir
// yang salah catat lapor ke owner, owner yang melakukan void lalu buat struk
// koreksi baru. Tidak ada edit qty in-place biar histori teraudit.
export async function voidTransaction(input: VoidInput): Promise<VoidResult> {
  const { businessId, userId, actor, net } = input;
  const txId = String(input.txIdRaw ?? '');
  if (!txId) return { ok: false, code: 400, message: 'Id struk wajib diisi.' };

  const [existing] = await db
    .select({ id: transaction.id, createdAt: transaction.createdAt, cashierName: transaction.cashierName })
    .from(transaction)
    .where(and(eq(transaction.id, txId), eq(transaction.businessId, businessId)));
  if (!existing) return { ok: false, code: 404, message: 'Struk tidak ditemukan.' };

  // Total void dihitung engine yang sama dengan struk agar angka log sama dengan yang tampil.
  const voidItems = await db
    .select({
      quantity: transactionItem.quantity,
      priceAtSale: transactionItem.priceAtSale,
      discountAmount: transactionItem.discountAmount
    })
    .from(transactionItem)
    .where(eq(transactionItem.transactionId, txId));
  // total = Σ(qty × harga) − Σ(diskon)   (Rupiah)
  const voidTotal = receiptTotals(voidItems).total;
  const actorName = actorOf(actor).name;
  const metaJson = JSON.stringify({
    total: voidTotal,
    itemCount: voidItems.length,
    cashierName: existing.cashierName,
    txCreatedAt: existing.createdAt.toISOString()
  });

  // Satu statement (CTE) agar atomik dan idempoten: item terhapus jadi sumber pengembalian stok + kuota + ledger.
  // Klik ganda aman (upaya kedua tak menemukan item); isActive tak tersentuh; CHECK quota_used >= 0 jadi jaring pengaman.
  await db.execute(sql`
    with removed as (
      delete from transaction_item ti
      where ti.transaction_id = ${txId}
        and exists (
          select 1 from "transaction" t
          where t.id = ti.transaction_id and t.business_id = ${businessId}
        )
      returning ti.product_id, ti.quantity, ti.discount_id, ti.discounted_qty
    ),
    restored as (
      update product p
      set stock = p.stock + r.qty, updated_at = now()
      from (
        select product_id, sum(quantity)::integer as qty
        from removed
        group by product_id
      ) r
      where p.id = r.product_id and p.business_id = ${businessId}
      returning p.id as product_id, r.qty
    ),
    quota_restored as (
      update discount d
      set quota_used = d.quota_used - r.units
      from (
        select discount_id, sum(discounted_qty)::integer as units
        from removed where discount_id is not null and discounted_qty > 0
        group by discount_id
      ) r
      where d.id = r.discount_id and d.business_id = ${businessId}
      returning d.id
    ),
    ledger as (
      insert into stock_movement (id, business_id, product_id, qty_change, reason, ref_tx_id, created_by)
      select gen_random_uuid()::text, ${businessId}::text, product_id, qty,
             'VOID_RESTORE'::stock_reason, ${txId}::text, ${userId}::text
      from restored
    ),
    logged as (
      insert into activity_log
        (id, business_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, ip, user_agent, meta)
      select gen_random_uuid()::text, ${businessId}::text, ${userId}::text, ${actorName}::text,
             'OWNER'::role, 'TX_VOID', 'transaction', ${txId}::text, ${net.ip}::text, ${net.userAgent}::text, ${metaJson}::jsonb
      where exists (select 1 from removed)
    )
    delete from "transaction" where id = ${txId} and business_id = ${businessId}
  `);
  return { ok: true };
}
