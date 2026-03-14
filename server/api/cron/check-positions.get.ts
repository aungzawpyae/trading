import { useAutoTrader } from '../../services/auto-trader'
import { useTelegram } from '../../services/telegram'

export default defineEventHandler(async (event) => {
  // Verify cron secret
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

  try {
    const autoTrader = useAutoTrader()
    const results = await autoTrader.checkAndClosePositions()

    return {
      success: true,
      closedPositions: results.length,
      results,
    }
  } catch (err: any) {
    const telegram = useTelegram()
    await telegram.sendMessage(`❌ <b>Position Check Failed</b>\n\n${err.message}`)
    return { success: false, error: err.message }
  }
})
