import { tradingPairs } from '../../database/schema'

const DEFAULT_PAIRS = [
  { symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' },
  { symbol: 'ETHUSDT', baseAsset: 'ETH', quoteAsset: 'USDT' },
  { symbol: 'SOLUSDT', baseAsset: 'SOL', quoteAsset: 'USDT' },
  { symbol: 'BNBUSDT', baseAsset: 'BNB', quoteAsset: 'USDT' },
  { symbol: 'XRPUSDT', baseAsset: 'XRP', quoteAsset: 'USDT' },
]

export default defineEventHandler(async () => {
  const db = useDb()

  for (const pair of DEFAULT_PAIRS) {
    await db.insert(tradingPairs)
      .values(pair)
      .onConflictDoNothing({ target: tradingPairs.symbol })
  }

  const pairs = await db.select().from(tradingPairs)
  return { message: 'Seeded successfully', pairs }
})
