import { useAnalyzer } from '../../services/analyzer'

export default defineEventHandler(async () => {
  const analyzer = useAnalyzer()
  const analysis = await analyzer.generateMarketSummary()
  return { summary: analysis }
})
