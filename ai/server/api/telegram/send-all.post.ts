import { eq, desc } from 'drizzle-orm'
import { tradingPairs, analyses } from '../../database/schema'
import { useBinance } from '../../services/binance'
import { useTelegram } from '../../services/telegram'

export default defineEventHandler(async () => {
  const db = useDb()
  const binance = useBinance()
  const telegram = useTelegram()

  const pairs = await db.select().from(tradingPairs).where(eq(tradingPairs.isActive, true))
  const results: string[] = []

  // Send header
  await telegram.sendMessage('📊 <b>TRADING AI — Full Report</b>\n' + '─'.repeat(30))

  for (const pair of pairs) {
    try {
      const ticker = await binance.getTicker(pair.symbol)
      await telegram.sendTickerAlert(pair.symbol, ticker)

      const [analysis] = await db.select()
        .from(analyses)
        .where(eq(analyses.tradingPairId, pair.id))
        .orderBy(desc(analyses.createdAt))
        .limit(1)

      if (analysis) {
        await telegram.sendAnalysisAlert(pair.symbol, analysis)
      }

      results.push(`${pair.symbol}: sent`)
    } catch (err: any) {
      results.push(`${pair.symbol}: failed - ${err.message}`)
    }
  }

  return { success: true, results }
})
