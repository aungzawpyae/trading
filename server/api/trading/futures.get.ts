import { useBinance } from '../../services/binance'

export default defineEventHandler(async () => {
  const binance = useBinance()

  const [account, positions, openOrders] = await Promise.all([
    binance.getFuturesAccount(),
    binance.getFuturesPositions(),
    binance.getFuturesOpenOrders(),
  ])

  return {
    account: {
      totalWalletBalance: account.totalWalletBalance,
      totalUnrealizedProfit: account.totalUnrealizedProfit,
      availableBalance: account.availableBalance,
      assets: account.assets,
    },
    positions,
    openOrders,
    riskPerTrade: Math.round(account.totalWalletBalance * 0.03 * 100) / 100,
  }
})
