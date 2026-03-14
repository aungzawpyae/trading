import { useBinance } from '../../../services/binance'

export default defineEventHandler(async (event) => {
  const symbol = getRouterParam(event, 'symbol')!.toUpperCase()
  const binance = useBinance()
  const supabase = useDb()

  // Get current position
  const positions = await binance.getFuturesPositions()
  const position = positions.find((p) => p.symbol === symbol) || null

  // Get open orders for this symbol
  const openOrders = await binance.getFuturesOpenOrders(symbol)

  // Get journal entry if position exists
  let journalEntry = null
  if (position) {
    const { data } = await supabase
      .from('trade_journal')
      .select('*')
      .eq('symbol', symbol)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .single()
    journalEntry = data
  }

  // Get account balance
  const account = await binance.getFuturesAccount()

  return {
    position,
    openOrders,
    journalEntry,
    account: {
      availableBalance: account.availableBalance,
      totalWalletBalance: account.totalWalletBalance,
      riskPerTrade: Math.round(account.totalWalletBalance * 0.03 * 100) / 100,
    },
  }
})
