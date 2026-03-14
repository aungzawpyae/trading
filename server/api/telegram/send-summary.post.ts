import { useTelegram } from '../../services/telegram'

export default defineEventHandler(async () => {
  const supabase = useDb()
  const telegram = useTelegram()

  const { data: summary } = await supabase
    .from('analyses')
    .select('*')
    .eq('type', 'market_summary')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!summary) throw createError({ statusCode: 404, message: 'No market summary available. Run /api/trading/market-summary first.' })

  const result = await telegram.sendMarketSummary(summary)
  return { success: !!result }
})
