import { pgTable, text, timestamp, boolean, integer, pgEnum, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// -----------------------------------------------------------------------
// Auth tables — bentuk kolomnya ngikutin konvensi default better-auth's
// drizzle adapter (user/session/account/verification). Field custom
// (role, businessId) ditambah di `user` lewat additionalFields.
// -----------------------------------------------------------------------

export const roleEnum = pgEnum('role', ['OWNER', 'STAFF']);

export const business = pgTable('business', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  // Username login staff (unik global, seperti email). Owner yang dibuat
  // via seed/demo atau sebelum fitur ini boleh NULL (login pakai email).
  // Staff selalu punya username — dibuat saat terima undangan.
  username: text('username').unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // Custom fields (bukan bawaan better-auth) — dipetakan via
  // `user.additionalFields` di src/lib/server/auth.ts.
  role: roleEnum('role').notNull().default('OWNER'),
  businessId: text('business_id').references(() => business.id),
  // Kolom wajib better-auth admin plugin (dipakai setUserPassword path) —
  // fitur ban tidak dipakai, tapi schema harus ada biar tidak 500
  // "Drizzle schema mismatch" saat runtime.
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
  // Kolom wajib better-auth admin plugin (impersonate) — tidak dipakai,
  // tapi harus ada biar tidak schema mismatch.
  impersonatedBy: text('impersonated_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Kredensial email/password better-auth disimpan di `account` dengan
// providerId = "credential", bukan tabel User terpisah kayak di Prisma/NextAuth.
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

// Undangan staff ala SaaS/POS (Square/Moka/Majoo): owner input username+nama,
// staff bikin password sendiri via link /invite/[token]. Role dikunci STAFF
// di record invite (bukan pilihan user). Token mentah cuma tampil sekali ke
// owner; di DB yang disimpan hash SHA-256-nya. Expiry default 48 jam,
// resend = revoke token lama + terbitkan token baru (bukan kirim ulang
// token yang sama). Username (bukan email) karena staff operasional tidak
// wajib punya email.
export const staffInvitation = pgTable(
  'staff_invitation',
  {
    id: text('id').primaryKey(),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id),
    // Username login staff (pengganti email — staff operasional tidak wajib
    // punya email). Kolom email lama dihapus di migrasi 0010; baris lama
    // di-backfill dari prefix email sebelum SET NOT NULL.
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

// -----------------------------------------------------------------------
// Domain tables — 1:1 struktur sama kayak schema.prisma versi Next,
// cuma sintaks Drizzle. Ini yang dipakai lib/analytics.ts & lib/simulation.ts.
// -----------------------------------------------------------------------

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
    // Sisa stok. Berkurang tiap struk tersimpan, bertambah saat restock.
    // Stok 0 = "Habis" (turunan, tidak tampil di kasir) — TIDAK mengubah
    // isActive. isActive murni pilihan owner (mis. produk dihentikan/musiman).
    stock: integer('stock').notNull().default(0),
    // Ambang "menipis" per produk — bisa diatur owner (default 5).
    minStock: integer('min_stock').notNull().default(5),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  },
  (t) => [
    index('product_business_id_idx').on(t.businessId),
    // Pengaman terakhir di level DB: kalau dua kasir jual barang terakhir
    // bersamaan, statement kedua gagal (dan batch-nya rollback) — bukan
    // stok jadi minus diam-diam.
    check('product_stock_nonneg', sql`${t.stock} >= 0`),
    check('product_min_stock_nonneg', sql`${t.minStock} >= 0`)
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
    // Snapshot nama kasir saat struk dicatat — dipakai biar riwayat tetap
    // menampilkan nama walau user staff-nya sudah dihapus dari DB.
    // Diisi di actions.create dari locals.user.name, fallback tampilan:
    // cashierName ?? user.name ?? '—'.
    cashierName: text('cashier_name'),
    createdAt: timestamp('created_at').notNull().defaultNow()
  },
  // Composite (business_id, created_at): sekali jalan melayani
  // WHERE business_id = ?  (pakai prefix kiri index) maupun
  // WHERE business_id = ? ORDER BY created_at DESC LIMIT n
  // (backward scan, tanpa sort) di dashboard & /transactions.
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
    costAtSale: integer('cost_at_sale').notNull()
  },
  (t) => [index('transaction_item_transaction_id_idx').on(t.transactionId)]
);

export const stockReasonEnum = pgEnum('stock_reason', ['SALE', 'VOID_RESTORE', 'RESTOCK', 'ADJUST']);

// Riwayat pergerakan stok per produk — audit ala realworld: setiap
// perubahan stok (jual, batal, restock, koreksi opname) tercatat siapa,
// kapan, berapa, dan struk acuannya.
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
