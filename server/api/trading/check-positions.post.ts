import { useAutoTrader } from '../../services/auto-trader'

export default defineEventHandler(async () => {
  const autoTrader = useAutoTrader()
  const results = await autoTrader.checkAndClosePositions()
  return { closed: results.length, results }
})
