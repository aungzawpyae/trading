import { useAutoTrader } from '../../services/auto-trader'
import { useTelegram } from '../../services/telegram'

export default defineEventHandler(async (event) => {
  // Verify cron secret (Vercel sends this header for cron jobs)
  const authHeader = getHeader(event, 'authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  // Check if bot is enabled
  const supabase = useDb()
  const { data: config } = await supabase
    .from('bot_config')
    .select('*')
    .eq('key', 'auto_trade')
    .single()

  if (!config || !config.enabled) {
    return { skipped: true, reason: 'bot_disabled' }
  }

  const interval = config.value?.interval || '15m'
  const telegram = useTelegram()

  try {
    const autoTrader = useAutoTrader()
    const results = await autoTrader.autoTradeAllPairs(interval)

    return {
      success: true,
      interval,
      total: results.length,
      executed: results.filter((r) => r.success).length,
      skipped: results.filter((r) => r.skipped).length,
      results,
    }
  } catch (err: any) {
    await telegram.sendMessage(`❌ <b>Cron Trade Scan Failed</b>\n\n${err.message}`)
    return { success: false, error: err.message }
  }
})
