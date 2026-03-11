import { useAutoTrader } from '../../services/auto-trader'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const interval = body?.interval || '1h'

  const autoTrader = useAutoTrader()
  const results = await autoTrader.autoTradeAllPairs(interval)

  return {
    interval,
    total: results.length,
    executed: results.filter((r) => r.success).length,
    skipped: results.filter((r) => r.skipped).length,
    failed: results.filter((r) => r.error).length,
    results,
  }
})
