import { useBinance } from '../../services/binance'

export default defineEventHandler(async () => {
  const binance = useBinance()

  const [account, permissions] = await Promise.all([
    binance.getAccountInfo(),
    binance.getApiKeyPermissions().catch(() => null),
  ])

  // Calculate total in USDT
  let totalUsdt = 0
  for (const bal of account.balances) {
    if (bal.asset === 'USDT' || bal.asset === 'BUSD' || bal.asset === 'FDUSD') {
      totalUsdt += bal.total
    } else if (bal.total > 0) {
      try {
        const ticker = await binance.getTicker(`${bal.asset}USDT`)
        totalUsdt += bal.total * ticker.price
      } catch {
        // Skip pairs without USDT market
      }
    }
  }

  return {
    account: {
      canTrade: account.canTrade,
      accountType: account.accountType,
    },
    permissions,
    balances: account.balances,
    totalEstimatedUsdt: Math.round(totalUsdt * 100) / 100,
  }
})
