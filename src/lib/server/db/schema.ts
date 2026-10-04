import { pgTable, text, timestamp, boolean, integer, jsonb, pgEnum, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Tabel autentikasi better-auth (user, session, account, verification).

export const roleEnum = pgEnum('role', ['OWNER', 'STAFF']);

export const business = pgTable(
  'business',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    // Zona waktu operasional bisnis untuk bucket waktu dan tampilan; default WITA.
    timezone: text('timezone').notNull().default('Asia/Makassar'),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  (t) => [
    check('business_timezone_valid', sql`${t.timezone} in ('Asia/Jakarta','Asia/Makassar','Asia/Jayapura')`)
  ]
);

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  // Username login staff (unik global). Owner tanpa username boleh NULL.
  username: text('username').unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // Kolom tambahan yang dipetakan via user.additionalFields di auth.ts.
  role: roleEnum('role').notNull().default('OWNER'),
  businessId: text('business_id').references(() => business.id),
  // Dipakai plugin admin better-auth agar schema cocok di runtime.
  banned: boolean('banned').notNull().default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  // Dipakai plugin admin better-auth agar schema cocok di runtime.
  impersonatedBy: text('impersonated_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Kredensial email/password disimpan di account dengan providerId = "credential".
export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  password: text('password'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
});

// Undangan staff: owner input username dan nama, staff buat password via /invite/[token].
// Token disimpan sebagai hash SHA-256. Masa berlaku 48 jam.
export const staffInvitation = pgTable(
  'staff_invitation',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id),
    // Username login staff (staff operasional tidak wajib punya email).
    username: text('username').notNull(),
    name: text('name'),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    acceptedAt: timestamp('accepted_at'),
    revokedAt: timestamp('revoked_at'),
    invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  (t) => [
    index('staff_invitation_business_created_idx').on(t.businessId, t.createdAt),
    index('staff_invitation_token_hash_idx').on(t.tokenHash)
  ]
);

// Tabel domain utama untuk produk, diskon, transaksi, dan stok.

export const product = pgTable(
  'product',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id),
    name: text('name').notNull(),
    costPrice: integer('cost_price').notNull(),
    sellingPrice: integer('selling_price').notNull(),
    // Sisa stok. Stok 0 berarti habis (tidak mengubah isActive pilihan owner).
    stock: integer('stock').notNull().default(0),
    // Ambang menipis per produk (default 5).
    minStock: integer('min_stock').notNull().default(5),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (t) => [
    index('product_business_id_idx').on(t.businessId),
    check('product_stock_nonneg', sql`${t.stock} >= 0`),
    check('product_min_stock_nonneg', sql`${t.minStock} >= 0`)
  ]
);

export const discountScopeEnum = pgEnum('discount_scope', ['PRODUCT', 'GLOBAL']);

// Diskon persen per bisnis: PRODUCT (satu produk) atau GLOBAL (semua produk).
// Status diturunkan saat dibaca: INACTIVE > SCHEDULED > EXPIRED > SOLD_OUT > ACTIVE.
export const discount = pgTable(
  'discount',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id),
    name: text('name').notNull(),
    scope: discountScopeEnum('scope').notNull(),
    percent: integer('percent').notNull(),
    // PRODUCT wajib menunjuk produk; GLOBAL wajib null.
    productId: text('product_id').references(() => product.id, { onDelete: 'cascade' }),
    isActive: boolean('is_active').notNull().default(true),
    startsAt: timestamp('starts_at').notNull().defaultNow(),
    endsAt: timestamp('ends_at'),
    quota: integer('quota'),
    quotaUsed: integer('quota_used').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  (t) => [
    index('discount_business_scope_idx').on(t.businessId, t.scope, t.isActive),
    index('discount_product_idx').on(t.productId),
    check('discount_percent_range', sql`${t.percent} between 1 and 100`),
    check('discount_scope_product', sql`(${t.scope} = 'PRODUCT') = (${t.productId} is not null)`),
    check('discount_window_valid', sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
    check('discount_quota_valid', sql`${t.quota} is null or ${t.quota} > 0`),
    check('discount_quota_used_nonneg', sql`${t.quotaUsed} >= 0`),
    check('discount_quota_not_exceeded', sql`${t.quota} is null or ${t.quotaUsed} <= ${t.quota}`),
    check('discount_global_time_only', sql`${t.scope} = 'PRODUCT' or (${t.endsAt} is not null and ${t.quota} is null)`)
  ]
);

export const transaction = pgTable(
  'transaction',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    // Snapshot nama kasir saat transaksi dicatat agar riwayat aman jika user dihapus.
    cashierName: text('cashier_name'),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  (t) => [index('transaction_business_created_idx').on(t.businessId, t.createdAt)]
);

export const transactionItem = pgTable(
  'transaction_item',
  {
    id: text('id').primaryKey(),
    transactionId: text('transaction_id')
      .notNull()
      .references(() => transaction.id),
    productId: text('product_id')
      .notNull()
      .references(() => product.id),
    quantity: integer('quantity').notNull(),
    priceAtSale: integer('price_at_sale').notNull(),
    costAtSale: integer('cost_at_sale').notNull(),
    // Snapshot diskon pada baris transaksi (discountedQty dalam unit, discountAmount dalam Rp).
    discountId: text('discount_id').references(() => discount.id, { onDelete: 'set null' }),
    discountName: text('discount_name'),
    discountedQty: integer('discounted_qty').notNull().default(0),
    discountAmount: integer('discount_amount').notNull().default(0)
  },
  (t) => [
    index('transaction_item_transaction_id_idx').on(t.transactionId),
    check(
      'transaction_item_discount_valid',
      sql`${t.discountedQty} between 0 and ${t.quantity} and ${t.discountAmount} >= 0 and ${t.discountAmount} <= ${t.quantity}::bigint * ${t.priceAtSale}`
    )
  ]
);

export const stockReasonEnum = pgEnum('stock_reason', ['SALE', 'VOID_RESTORE', 'RESTOCK', 'ADJUST']);

// Audit pergerakan stok per produk untuk penjualan, pembatalan, restock, atau penyesuaian.
export const stockMovement = pgTable(
  'stock_movement',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id),
    productId: text('product_id')
      .notNull()
      .references(() => product.id),
    qtyChange: integer('qty_change').notNull(),
    reason: stockReasonEnum('reason').notNull(),
    refTxId: text('ref_tx_id'),
    note: text('note'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  (t) => [index('stock_movement_business_product_created_idx').on(t.businessId, t.productId, t.createdAt)]
);

// Riwayat Copilot per bisnis agar owner dapat lanjut di perangkat lain.
export const copilotConversation = pgTable(
  'copilot_conversation',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id),
    title: text('title').notNull().default('Percakapan baru'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (t) => [index('copilot_conversation_business_updated_idx').on(t.businessId, t.updatedAt)]
);

// Pesan user, jawaban assistant, hasil tool, dan notice; role teks agar migrasi ringan.
export const copilotMessage = pgTable(
  'copilot_message',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => copilotConversation.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    toolName: text('tool_name'),
    toolResult: jsonb('tool_result'),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  (t) => [index('copilot_message_conversation_created_idx').on(t.conversationId, t.createdAt)]
);
