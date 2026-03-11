import { useBinance } from '../../services/binance'
import { useTelegram } from '../../services/telegram'

export default defineEventHandler(async () => {
  const supabase = useDb()
  const binance = useBinance()
  const telegram = useTelegram()

  const { data: pairs } = await supabase
    .from('trading_pairs')
    .select('*')
    .eq('is_active', true)

  if (!pairs?.length) return { success: false, message: 'No pairs found' }

  const results: string[] = []

  await telegram.sendMessage('📊 <b>TRADING AI — Full Report</b>\n' + '─'.repeat(30))

  for (const pair of pairs) {
    try {
      const ticker = await binance.getTicker(pair.symbol)
      await telegram.sendTickerAlert(pair.symbol, ticker)

      const { data: analysis } = await supabase
        .from('analyses')
        .select('*')
        .eq('trading_pair_id', pair.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

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
