import { eq } from 'drizzle-orm'
import { tradingPairs } from '../../../../database/schema'
import { useAnalyzer } from '../../../../services/analyzer'

export default defineEventHandler(async (event) => {
  const symbol = getRouterParam(event, 'symbol')!.toUpperCase()
  const body = await readBody(event).catch(() => ({}))
  const interval = body?.interval || '1h'

  const db = useDb()
  const [pair] = await db.select().from(tradingPairs).where(eq(tradingPairs.symbol, symbol)).limit(1)
  if (!pair) throw createError({ statusCode: 404, message: 'Trading pair not found' })

  const analyzer = useAnalyzer()
  const analysis = await analyzer.analyzePair(pair.id, pair.symbol, interval)

  return { symbol: pair.symbol, analysis }
})
