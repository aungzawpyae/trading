import { eq, desc } from 'drizzle-orm'
import { tradingPairs, analyses } from '../../../database/schema'
import { useBinance } from '../../../services/binance'

export default defineEventHandler(async (event) => {
  const symbol = getRouterParam(event, 'symbol')!.toUpperCase()
  const db = useDb()
  const binance = useBinance()

  const [pair] = await db.select().from(tradingPairs).where(eq(tradingPairs.symbol, symbol)).limit(1)
  if (!pair) throw createError({ statusCode: 404, message: 'Trading pair not found' })

  const ticker = await binance.getTicker(pair.symbol)
  const klines = await binance.getKlines(pair.symbol, '1h', 48)

  const [latestAnalysis] = await db.select()
    .from(analyses)
    .where(eq(analyses.tradingPairId, pair.id))
    .orderBy(desc(analyses.createdAt))
    .limit(1)

  return { pair, ticker, klines, latestAnalysis }
})
