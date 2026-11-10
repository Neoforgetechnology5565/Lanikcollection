import {
  pgTable, serial, text, integer, boolean, timestamp, jsonb, pgEnum, uniqueIndex, index,
} from "drizzle-orm/pg-core";

export const orderStatus = pgEnum("order_status", [
  "AWAITING_PAYMENT", // created, waiting for the customer to pay
  "PAID",             // payment verified server-side (or approved by an admin)
  "REVIEW",           // money arrived but needs a human: late, under-paid, stock gone
  "EXPIRED",          // payment window closed without a verified payment
  "CANCELLED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
]);

export const paymentStatus = pgEnum("payment_status", [
  "PENDING", "SUCCESSFUL", "FAILED", "EXPIRED", "REVIEW", "REFUNDED",
]);

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
  menuGroup: text("menu_group"), // heading in the Shop dropdown; empty = "More"
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  categoryId: integer("category_id").references(() => categories.id),
  priceKobo: integer("price_kobo").notNull(),
  saleKobo: integer("sale_kobo"),
  wholesaleKobo: integer("wholesale_kobo"),
  wholesaleMin: integer("wholesale_min"),
  images: text("images").array().notNull().default([]),
  sizes: text("sizes").array().notNull().default([]),
  colors: text("colors").array().notNull().default([]),
  stock: integer("stock").notNull().default(0),
  featured: boolean("featured").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(),
  accessToken: text("access_token").notNull(), // lets a guest view their own order
  customerId: integer("customer_id"),            // set when placed while signed in
  status: orderStatus("status").notNull().default("AWAITING_PAYMENT"),
  customerName: text("customer_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  notes: text("notes"),
  subtotalKobo: integer("subtotal_kobo").notNull(),
  shippingKobo: integer("shipping_kobo").notNull().default(0),
  discountKobo: integer("discount_kobo").notNull().default(0),
  totalKobo: integer("total_kobo").notNull(),
  discountCode: text("discount_code"),
  stockReserved: boolean("stock_reserved").notNull().default(true),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
}, (t) => [index("orders_status_exp_idx").on(t.status, t.expiresAt)]);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  name: text("name").notNull(),
  size: text("size"),
  color: text("color"),
  qty: integer("qty").notNull(),
  unitKobo: integer("unit_kobo").notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  // card | bank_transfer | ussd | opay | qr | internet_banking | manual_transfer
  method: text("method").notNull(),
  provider: text("provider").notNull().default("flutterwave"),
  txRef: text("tx_ref").notNull(),
  providerTxId: text("provider_tx_id"),
  status: paymentStatus("status").notNull().default("PENDING"),
  amountKobo: integer("amount_kobo").notNull(),      // what we expect
  paidAmountKobo: integer("paid_amount_kobo"),        // what the provider confirmed
  currency: text("currency").notNull().default("NGN"),
  // dynamic virtual account details (bank transfer)
  vaBank: text("va_bank"),
  vaAccountNumber: text("va_account_number"),
  vaAccountName: text("va_account_name"),
  vaNote: text("va_note"),
  vaExpiresAt: timestamp("va_expires_at", { withTimezone: true }),
  checkoutLink: text("checkout_link"),
  failureReason: text("failure_reason"),
  note: text("note"),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
}, (t) => [uniqueIndex("payments_tx_ref_idx").on(t.txRef), index("payments_order_idx").on(t.orderId)]);

export const paymentProofs = pgTable("payment_proofs", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  paymentId: integer("payment_id").references(() => payments.id),
  reference: text("reference").notNull(),
  amountKobo: integer("amount_kobo").notNull(),
  fileName: text("file_name").notNull(),   // stored under uploads/, never web-public
  mime: text("mime").notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING | APPROVED | REJECTED
  reviewedBy: text("reviewed_by"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

// Idempotency log for provider webhooks.
export const webhookEvents = pgTable("webhook_events", {
  id: serial("id").primaryKey(),
  eventKey: text("event_key").notNull().unique(),
  txRef: text("tx_ref"),
  payload: jsonb("payload"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
});

export const discountCodes = pgTable("discount_codes", {
  code: text("code").primaryKey(),
  percent: integer("percent").notNull(),
  active: boolean("active").notNull().default(true),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  tokenVersion: integer("token_version").notNull().default(0), // bump to invalidate every existing session
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const addresses = pgTable("addresses", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("Home"),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  phone: text("phone"),
});

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  rating: integer("rating").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING | APPROVED | REJECTED
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("reviews_one_per_customer").on(t.productId, t.customerId)]);

export const shippingZones = pgTable("shipping_zones", {
  state: text("state").primaryKey(),
  feeKobo: integer("fee_kobo").notNull(),
});

export const subscribers = pgTable("subscribers", {
  email: text("email").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emails = pgTable("emails", {
  id: serial("id").primaryKey(),
  toAddress: text("to_address").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  status: text("status").notNull().default("QUEUED"), // QUEUED (no provider) | SENT | FAILED
  kind: text("kind").notNull().default("misc"),
  attempts: integer("attempts").notNull().default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Stock lives here, one row per size/colour combination ("" = not applicable).
export const productVariants = pgTable("product_variants", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  size: text("size").notNull().default(""),
  color: text("color").notNull().default(""),
  stock: integer("stock").notNull().default(0),
}, (t) => [uniqueIndex("variant_unique").on(t.productId, t.size, t.color)]);

export const authTokens = pgTable("auth_tokens", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // verify | reset
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

// Shared (database-backed) rate limiting so it works across many server instances.
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});

export const wishlistItems = pgTable("wishlist_items", {
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("wishlist_unique").on(t.customerId, t.productId)]);

export const refunds = pgTable("refunds", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  paymentId: integer("payment_id").references(() => payments.id),
  amountKobo: integer("amount_kobo").notNull(),
  reason: text("reason").notNull().default(""),
  method: text("method").notNull().default("manual"),   // flutterwave | manual
  status: text("status").notNull().default("REQUESTED"), // REQUESTED | PROCESSED | FAILED
  providerRef: text("provider_ref"),
  error: text("error"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});
