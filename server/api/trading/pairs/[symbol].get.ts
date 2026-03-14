import { useBinance } from '../../../services/binance'

export default defineEventHandler(async (event) => {
  const symbol = getRouterParam(event, 'symbol')!.toUpperCase()
  const supabase = useDb()
  const binance = useBinance()

  const { data: pair } = await supabase
    .from('trading_pairs')
    .select('*')
    .eq('symbol', symbol)
    .single()

  if (!pair) throw createError({ statusCode: 404, message: 'Trading pair not found' })

  const ticker = await binance.getTicker(pair.symbol)
  const klines = await binance.getKlines(pair.symbol, '1h', 48)

  const { data: latestAnalysis } = await supabase
    .from('analyses')
    .select('*')
    .eq('trading_pair_id', pair.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return { pair, ticker, klines, latestAnalysis }
})
