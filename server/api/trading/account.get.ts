import { useBinance } from '../../services/binance'

export default defineEventHandler(async () => {
  const binance = useBinance()

  const [spotAccount, permissions, futuresAccount] = await Promise.all([
    binance.getAccountInfo().catch(() => null),
    binance.getApiKeyPermissions().catch(() => null),
    binance.getFuturesAccount().catch(() => null),
  ])

  // Calculate spot total in USDT
  let spotTotalUsdt = 0
  const spotBalances = spotAccount?.balances || []
  for (const bal of spotBalances) {
    if (['USDT', 'BUSD', 'FDUSD'].includes(bal.asset)) {
      spotTotalUsdt += bal.total
    } else if (bal.total > 0) {
      try {
        const ticker = await binance.getTicker(`${bal.asset}USDT`)
        spotTotalUsdt += bal.total * ticker.price
      } catch {}
    }
  }

  return {
    spot: {
      canTrade: spotAccount?.canTrade ?? false,
      accountType: spotAccount?.accountType ?? 'unknown',
      balances: spotBalances,
      totalEstimatedUsdt: Math.round(spotTotalUsdt * 100) / 100,
    },
    futures: futuresAccount ? {
      totalWalletBalance: futuresAccount.totalWalletBalance,
      totalUnrealizedProfit: futuresAccount.totalUnrealizedProfit,
      availableBalance: futuresAccount.availableBalance,
      assets: futuresAccount.assets,
      openPositions: futuresAccount.positions,
    } : null,
    permissions,
    totalCombinedUsdt: Math.round((spotTotalUsdt + (futuresAccount?.totalWalletBalance || 0)) * 100) / 100,
    riskPerTrade: Math.round((spotTotalUsdt + (futuresAccount?.totalWalletBalance || 0)) * 0.03 * 100) / 100,
  }
})
