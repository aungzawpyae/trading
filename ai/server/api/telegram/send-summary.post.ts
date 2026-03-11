import { eq, desc } from 'drizzle-orm'
import { analyses } from '../../database/schema'
import { useTelegram } from '../../services/telegram'

export default defineEventHandler(async () => {
  const db = useDb()
  const telegram = useTelegram()

  const [summary] = await db.select()
    .from(analyses)
    .where(eq(analyses.type, 'market_summary'))
    .orderBy(desc(analyses.createdAt))
    .limit(1)

  if (!summary) throw createError({ statusCode: 404, message: 'No market summary available. Run /api/trading/market-summary first.' })

  const result = await telegram.sendMarketSummary(summary)

  return { success: !!result }
})
