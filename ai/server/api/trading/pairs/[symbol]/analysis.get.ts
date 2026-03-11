export default defineEventHandler(async (event) => {
  const symbol = getRouterParam(event, 'symbol')!.toUpperCase()
  const supabase = useDb()

  const { data: pair } = await supabase
    .from('trading_pairs')
    .select('*')
    .eq('symbol', symbol)
    .single()

  if (!pair) throw createError({ statusCode: 404, message: 'Trading pair not found' })

  const { data: analysis } = await supabase
    .from('analyses')
    .select('*')
    .eq('trading_pair_id', pair.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!analysis) throw createError({ statusCode: 404, message: 'No analysis available yet' })

  return {
    symbol: pair.symbol,
    analysis: {
      ...analysis,
      isExpired: analysis.expires_at ? new Date(analysis.expires_at) < new Date() : false,
    },
  }
})
