import { pgTable, uuid, varchar, boolean, timestamp, decimal, integer, text, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'

export const tradingPairs = pgTable('trading_pairs', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: varchar('symbol', { length: 20 }).notNull().unique(),
  baseAsset: varchar('base_asset', { length: 10 }).notNull(),
  quoteAsset: varchar('quote_asset', { length: 10 }).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const klines = pgTable('klines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tradingPairId: uuid('trading_pair_id').notNull().references(() => tradingPairs.id, { onDelete: 'cascade' }),
  interval: varchar('interval', { length: 5 }).notNull(),
  openTime: timestamp('open_time').notNull(),
  open: decimal('open', { precision: 18, scale: 8 }).notNull(),
  high: decimal('high', { precision: 18, scale: 8 }).notNull(),
  low: decimal('low', { precision: 18, scale: 8 }).notNull(),
  close: decimal('close', { precision: 18, scale: 8 }).notNull(),
  volume: decimal('volume', { precision: 24, scale: 8 }).notNull(),
  closeTime: timestamp('close_time').notNull(),
  quoteVolume: decimal('quote_volume', { precision: 24, scale: 8 }).notNull(),
  tradesCount: integer('trades_count').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('klines_pair_interval_time').on(table.tradingPairId, table.interval, table.openTime),
  index('klines_pair_interval_close').on(table.tradingPairId, table.interval, table.closeTime),
])

export const tickers = pgTable('tickers', {
  id: uuid('id').defaultRandom().primaryKey(),
  tradingPairId: uuid('trading_pair_id').notNull().references(() => tradingPairs.id, { onDelete: 'cascade' }),
  price: decimal('price', { precision: 18, scale: 8 }).notNull(),
  priceChange24h: decimal('price_change_24h', { precision: 18, scale: 8 }).default('0'),
  priceChangePct24h: decimal('price_change_pct_24h', { precision: 8, scale: 4 }).default('0'),
  high24h: decimal('high_24h', { precision: 18, scale: 8 }).default('0'),
  low24h: decimal('low_24h', { precision: 18, scale: 8 }).default('0'),
  volume24h: decimal('volume_24h', { precision: 24, scale: 8 }).default('0'),
  recordedAt: timestamp('recorded_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('tickers_pair_recorded').on(table.tradingPairId, table.recordedAt),
])

export const analyses = pgTable('analyses', {
  id: uuid('id').defaultRandom().primaryKey(),
  tradingPairId: uuid('trading_pair_id').notNull().references(() => tradingPairs.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 30 }).notNull(),
  interval: varchar('interval', { length: 5 }),
  signal: varchar('signal', { length: 15 }).notNull(),
  confidence: decimal('confidence', { precision: 5, scale: 2 }).default('0'),
  summary: text('summary').notNull(),
  rawResponse: jsonb('raw_response'),
  indicators: jsonb('indicators'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('analyses_pair_type_created').on(table.tradingPairId, table.type, table.createdAt),
])

export const alerts = pgTable('alerts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tradingPairId: uuid('trading_pair_id').notNull().references(() => tradingPairs.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 20 }).notNull(),
  conditionValue: decimal('condition_value', { precision: 18, scale: 8 }),
  isTriggered: boolean('is_triggered').default(false).notNull(),
  triggeredAt: timestamp('triggered_at'),
  message: text('message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
