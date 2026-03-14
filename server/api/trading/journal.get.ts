export default defineEventHandler(async (event) => {
  const supabase = useDb()
  const query = getQuery(event)
  const status = (query.status as string) || 'all'
  const limit = parseInt(query.limit as string) || 50

  let q = supabase
    .from('trade_journal')
    .select('*')
    .order('opened_at', { ascending: false })
    .limit(limit)

  if (status !== 'all') {
    q = q.eq('status', status)
  }

  const { data: trades } = await q

  // Calculate stats
  const closed = (trades || []).filter((t: any) => t.status === 'closed')
  const wins = closed.filter((t: any) => t.result === 'win')
  const losses = closed.filter((t: any) => t.result === 'loss')
  const totalPnl = closed.reduce((sum: number, t: any) => sum + (parseFloat(t.pnl) || 0), 0)
  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0
  const avgWin = wins.length > 0 ? wins.reduce((s: number, t: any) => s + parseFloat(t.pnl), 0) / wins.length : 0
  const avgLoss = losses.length > 0 ? losses.reduce((s: number, t: any) => s + parseFloat(t.pnl), 0) / losses.length : 0

  // Streak
  let currentStreak = 0
  let streakType = ''
  for (const t of closed) {
    if (!streakType) {
      streakType = t.result
      currentStreak = 1
    } else if (t.result === streakType) {
      currentStreak++
    } else {
      break
    }
  }

  return {
    trades: trades || [],
    stats: {
      totalTrades: closed.length,
      openTrades: (trades || []).filter((t: any) => t.status === 'open').length,
      wins: wins.length,
      losses: losses.length,
      winRate: Math.round(winRate * 100) / 100,
      totalPnl: Math.round(totalPnl * 100) / 100,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      profitFactor: avgLoss !== 0 ? Math.round(Math.abs(avgWin / avgLoss) * 100) / 100 : 0,
      currentStreak,
      streakType,
    },
  }
})
