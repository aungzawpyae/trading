import { useTelegram } from '../../services/telegram'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const symbol = (body?.symbol || 'BTCUSDT').toUpperCase()

  const supabase = useDb()
  const telegram = useTelegram()

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

  if (!analysis) throw createError({ statusCode: 404, message: 'No analysis available' })

  const result = await telegram.sendAnalysisAlert(pair.symbol, analysis, body?.chatId)
  return { success: !!result, symbol: pair.symbol }
})
