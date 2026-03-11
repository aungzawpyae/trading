import { useBinance } from '../../services/binance'

export default defineEventHandler(async () => {
  const supabase = useDb()
  const binance = useBinance()

  const { data: pairs } = await supabase
    .from('trading_pairs')
    .select('*')
    .eq('is_active', true)

  if (!pairs?.length) return { pairs: [] }

  const data = await Promise.all(
    pairs.map(async (pair) => {
      let ticker = null
      try {
        ticker = await binance.getTicker(pair.symbol)
      } catch {}

      const { data: latestAnalysis } = await supabase
        .from('analyses')
        .select('*')
        .eq('trading_pair_id', pair.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      return {
        id: pair.id,
        symbol: pair.symbol,
        baseAsset: pair.base_asset,
        quoteAsset: pair.quote_asset,
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
              rawResponse: latestAnalysis.raw_response,
              createdAt: latestAnalysis.created_at,
            }
          : null,
      }
    }),
  )

  return { pairs: data }
})
