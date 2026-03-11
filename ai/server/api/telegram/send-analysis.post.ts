import { eq, desc } from 'drizzle-orm'
import { tradingPairs, analyses } from '../../database/schema'
import { useTelegram } from '../../services/telegram'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const symbol = (body?.symbol || 'BTCUSDT').toUpperCase()

  const db = useDb()
  const telegram = useTelegram()

  const [pair] = await db.select().from(tradingPairs).where(eq(tradingPairs.symbol, symbol)).limit(1)
  if (!pair) throw createError({ statusCode: 404, message: 'Trading pair not found' })

  const [analysis] = await db.select()
    .from(analyses)
    .where(eq(analyses.tradingPairId, pair.id))
    .orderBy(desc(analyses.createdAt))
    .limit(1)

  if (!analysis) throw createError({ statusCode: 404, message: 'No analysis available' })

  const result = await telegram.sendAnalysisAlert(pair.symbol, analysis, body?.chatId)

  return { success: !!result, symbol: pair.symbol }
})
