import { pgTable, text, timestamp, boolean, integer, pgEnum } from 'drizzle-orm/pg-core';

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
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // Custom fields (bukan bawaan better-auth) — dipetakan via
  // `user.additionalFields` di src/lib/server/auth.ts.
  role: roleEnum('role').notNull().default('OWNER'),
  businessId: text('business_id').references(() => business.id),
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

// -----------------------------------------------------------------------
// Domain tables — 1:1 struktur sama kayak schema.prisma versi Next,
// cuma sintaks Drizzle. Ini yang dipakai lib/analytics.ts & lib/simulation.ts.
// -----------------------------------------------------------------------

export const product = pgTable('product', {
  id: text('id').primaryKey(),
  businessId: text('business_id')
    .notNull()
    .references(() => business.id),
  name: text('name').notNull(),
  costPrice: integer('cost_price').notNull(),
  sellingPrice: integer('selling_price').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const transaction = pgTable('transaction', {
  id: text('id').primaryKey(),
  businessId: text('business_id')
    .notNull()
    .references(() => business.id),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const transactionItem = pgTable('transaction_item', {
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
});
