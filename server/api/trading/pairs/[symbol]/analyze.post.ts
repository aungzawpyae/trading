import { useAnalyzer } from '../../../../services/analyzer'

export default defineEventHandler(async (event) => {
  const symbol = getRouterParam(event, 'symbol')!.toUpperCase()
  const body = await readBody(event).catch(() => ({}))
  const interval = body?.interval || '1h'

  const supabase = useDb()
  const { data: pair } = await supabase
    .from('trading_pairs')
    .select('*')
    .eq('symbol', symbol)
    .single()

  if (!pair) throw createError({ statusCode: 404, message: 'Trading pair not found' })

  const analyzer = useAnalyzer()
  const analysis = await analyzer.analyzePair(pair.id, pair.symbol, interval)

  return { symbol: pair.symbol, analysis }
})
