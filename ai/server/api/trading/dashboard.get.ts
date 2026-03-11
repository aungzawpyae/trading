import { eq, desc } from 'drizzle-orm'
import { tradingPairs, analyses } from '../../database/schema'
import { useBinance } from '../../services/binance'

export default defineEventHandler(async () => {
  const db = useDb()
  const binance = useBinance()

  const pairs = await db.select().from(tradingPairs).where(eq(tradingPairs.isActive, true))

  const data = await Promise.all(
    pairs.map(async (pair) => {
      let ticker = null
      try {
        ticker = await binance.getTicker(pair.symbol)
      } catch {}

      const [latestAnalysis] = await db.select()
        .from(analyses)
        .where(eq(analyses.tradingPairId, pair.id))
        .orderBy(desc(analyses.createdAt))
        .limit(1)

      return {
        id: pair.id,
        symbol: pair.symbol,
        baseAsset: pair.baseAsset,
        quoteAsset: pair.quoteAsset,
        price: ticker?.price ?? 0,
        changePct: ticker?.priceChangePct24h ?? 0,
        high24h: ticker?.high24h ?? 0,
        low24h: ticker?.low24h ?? 0,
        volume24h: ticker?.volume24h ?? 0,
        analysis: latestAnalysis
          ? {
              signal: latestAnalysis.signal,
              confidence: parseFloat(latestAnalysis.confidence || '0'),
              summary: latestAnalysis.summary,
              rawResponse: latestAnalysis.rawResponse,
              createdAt: latestAnalysis.createdAt,
            }
          : null,
      }
    }),
  )

  return { pairs: data }
})
