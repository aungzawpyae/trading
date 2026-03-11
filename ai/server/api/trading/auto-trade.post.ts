import { useAutoTrader } from '../../services/auto-trader'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const symbol = (body?.symbol || '').toUpperCase()
  const interval = body?.interval || '1h'

  if (!symbol) {
    throw createError({ statusCode: 400, message: 'Symbol is required' })
  }

  const supabase = useDb()
  const { data: pair } = await supabase
    .from('trading_pairs')
    .select('*')
    .eq('symbol', symbol)
    .single()

  if (!pair) {
    throw createError({ statusCode: 404, message: `Trading pair ${symbol} not found` })
  }

  const autoTrader = useAutoTrader()
  const result = await autoTrader.autoAnalyzeAndTrade(pair.id, pair.symbol, interval)

  return result
})
