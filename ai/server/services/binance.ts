import { createHmac } from 'node:crypto'
import type { TickerData, KlineData } from '../utils/types'

const cache = new Map<string, { data: any; expiresAt: number }>()

function cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const entry = cache.get(key)
  if (entry && entry.expiresAt > Date.now()) {
    return Promise.resolve(entry.data as T)
  }
  return fetcher().then((data) => {
    cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 })
    return data
  })
}

export function useBinance() {
  const config = useRuntimeConfig()
  const baseUrl = config.binanceBaseUrl
  const futuresBaseUrl = config.binanceFuturesBaseUrl
  const apiKey = config.binanceApiKey
  const apiSecret = config.binanceApiSecret

  function sign(queryString: string): string {
    return createHmac('sha256', apiSecret).update(queryString).digest('hex')
  }

  function signedHeaders() {
    return { 'X-MBX-APIKEY': apiKey }
  }

  function signedQuery(params: Record<string, any> = {}) {
    const timestamp = Date.now()
    const allParams = { ...params, timestamp }
    const queryString = Object.entries(allParams)
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
    const signature = sign(queryString)
    return { ...allParams, signature }
  }

  // ─── Spot Market Data (public, uses real API for market data) ───

  async function getTicker(symbol: string): Promise<TickerData> {
    return cached(`ticker:${symbol}`, 5, async () => {
      // Market data from real Binance (demo testnet has limited market data)
      const data: any = await (globalThis.$fetch as any)(`https://api.binance.com/api/v3/ticker/24hr`, {
        query: { symbol },
      })
      return {
        symbol: data.symbol,
        price: parseFloat(data.lastPrice),
        priceChange24h: parseFloat(data.priceChange),
        priceChangePct24h: parseFloat(data.priceChangePercent),
        high24h: parseFloat(data.highPrice),
        low24h: parseFloat(data.lowPrice),
        volume24h: parseFloat(data.quoteVolume),
      }
    })
  }

  async function getKlines(symbol: string, interval: string, limit = 100): Promise<KlineData[]> {
    return cached(`klines:${symbol}:${interval}:${limit}`, 60, async () => {
      // Market data from real Binance
      const data: any[] = await (globalThis.$fetch as any)(`https://api.binance.com/api/v3/klines`, {
        query: { symbol, interval, limit },
      })
      return data.map((k) => ({
        openTime: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: k[6],
        quoteVolume: parseFloat(k[7]),
        tradesCount: k[8],
      }))
    })
  }

  async function getOrderBook(symbol: string, limit = 20): Promise<any> {
    return cached(`orderbook:${symbol}:${limit}`, 10, async () => {
      const data = await (globalThis.$fetch as any)(`https://api.binance.com/api/v3/depth`, {
        query: { symbol, limit },
      })
      return data
    })
  }

  // ─── Spot Account (Demo/Testnet) ───

  async function getAccountInfo(): Promise<any> {
    const query = signedQuery()
    const data = await (globalThis.$fetch as any)(`${baseUrl}/api/v3/account`, {
      query,
      headers: signedHeaders(),
    })

    return {
      canTrade: data.canTrade,
      canWithdraw: data.canWithdraw,
      canDeposit: data.canDeposit,
      accountType: data.accountType,
      balances: (data.balances || [])
        .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
        .map((b: any) => ({
          asset: b.asset,
          free: parseFloat(b.free),
          locked: parseFloat(b.locked),
          total: parseFloat(b.free) + parseFloat(b.locked),
        })),
    }
  }

  async function getApiKeyPermissions(): Promise<any> {
    const query = signedQuery()
    const data = await (globalThis.$fetch as any)(`${baseUrl}/sapi/v1/account/apiRestrictions`, {
      query,
      headers: signedHeaders(),
    })

    return {
      ipRestrict: data.ipRestrict,
      enableSpotAndMarginTrading: data.enableSpotAndMarginTrading,
      enableFutures: data.enableFutures,
      enableWithdrawals: data.enableWithdrawals,
      enableReading: data.enableReading,
      enableMargin: data.enableMargin,
      permitsUniversalTransfer: data.permitsUniversalTransfer,
    }
  }

  // ─── Futures Account (Demo) ───

  async function getFuturesAccount(): Promise<any> {
    const query = signedQuery()
    const data = await (globalThis.$fetch as any)(`${futuresBaseUrl}/fapi/v2/account`, {
      query,
      headers: signedHeaders(),
    })

    return {
      totalWalletBalance: parseFloat(data.totalWalletBalance),
      totalUnrealizedProfit: parseFloat(data.totalUnrealizedProfit),
      totalMarginBalance: parseFloat(data.totalMarginBalance),
      availableBalance: parseFloat(data.availableBalance),
      maxWithdrawAmount: parseFloat(data.maxWithdrawAmount),
      assets: (data.assets || [])
        .filter((a: any) => parseFloat(a.walletBalance) > 0)
        .map((a: any) => ({
          asset: a.asset,
          walletBalance: parseFloat(a.walletBalance),
          unrealizedProfit: parseFloat(a.unrealizedProfit),
          marginBalance: parseFloat(a.marginBalance),
          availableBalance: parseFloat(a.availableBalance),
        })),
      positions: (data.positions || [])
        .filter((p: any) => parseFloat(p.positionAmt) !== 0)
        .map((p: any) => ({
          symbol: p.symbol,
          positionAmt: parseFloat(p.positionAmt),
          entryPrice: parseFloat(p.entryPrice),
          markPrice: parseFloat(p.markPrice),
          unrealizedProfit: parseFloat(p.unrealizedProfit),
          leverage: p.leverage,
          positionSide: p.positionSide,
          marginType: p.marginType,
        })),
    }
  }

  async function getFuturesPositions(): Promise<any[]> {
    const query = signedQuery()
    const data: any[] = await (globalThis.$fetch as any)(`${futuresBaseUrl}/fapi/v2/positionRisk`, {
      query,
      headers: signedHeaders(),
    })

    return data
      .filter((p: any) => parseFloat(p.positionAmt) !== 0)
      .map((p: any) => ({
        symbol: p.symbol,
        positionAmt: parseFloat(p.positionAmt),
        entryPrice: parseFloat(p.entryPrice),
        markPrice: parseFloat(p.markPrice),
        liquidationPrice: parseFloat(p.liquidationPrice),
        unrealizedProfit: parseFloat(p.unRealizedProfit),
        leverage: p.leverage,
        positionSide: p.positionSide,
        marginType: p.marginType,
      }))
  }

  async function getFuturesOpenOrders(symbol?: string): Promise<any[]> {
    const params: Record<string, any> = {}
    if (symbol) params.symbol = symbol
    const query = signedQuery(params)

    const data: any[] = await (globalThis.$fetch as any)(`${futuresBaseUrl}/fapi/v1/openOrders`, {
      query,
      headers: signedHeaders(),
    })

    return data.map((o: any) => ({
      orderId: o.orderId,
      symbol: o.symbol,
      side: o.side,
      type: o.type,
      price: parseFloat(o.price),
      origQty: parseFloat(o.origQty),
      executedQty: parseFloat(o.executedQty),
      status: o.status,
      positionSide: o.positionSide,
    }))
  }

  return {
    getTicker,
    getKlines,
    getOrderBook,
    getAccountInfo,
    getApiKeyPermissions,
    getFuturesAccount,
    getFuturesPositions,
    getFuturesOpenOrders,
  }
}
