import { eq, desc } from 'drizzle-orm'
import { tradingPairs, analyses } from '../../../../database/schema'

export default defineEventHandler(async (event) => {
  const symbol = getRouterParam(event, 'symbol')!.toUpperCase()
  const db = useDb()

  const [pair] = await db.select().from(tradingPairs).where(eq(tradingPairs.symbol, symbol)).limit(1)
  if (!pair) throw createError({ statusCode: 404, message: 'Trading pair not found' })

  const [analysis] = await db.select()
    .from(analyses)
    .where(eq(analyses.tradingPairId, pair.id))
    .orderBy(desc(analyses.createdAt))
    .limit(1)

  if (!analysis) throw createError({ statusCode: 404, message: 'No analysis available yet' })

  return {
    symbol: pair.symbol,
    analysis: {
      ...analysis,
      isExpired: analysis.expiresAt ? new Date(analysis.expiresAt) < new Date() : false,
    },
  }
})
