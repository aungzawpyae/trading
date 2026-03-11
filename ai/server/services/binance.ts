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
  const apiKey = config.binanceApiKey
  const apiSecret = config.binanceApiSecret

  function sign(queryString: string): string {
    return createHmac('sha256', apiSecret).update(queryString).digest('hex')
  }

  async function getTicker(symbol: string): Promise<TickerData> {
    return cached(`ticker:${symbol}`, 5, async () => {
      const data: any = await (globalThis.$fetch as any)(`${baseUrl}/api/v3/ticker/24hr`, {
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
      const data: any[] = await (globalThis.$fetch as any)(`${baseUrl}/api/v3/klines`, {
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
      const data = await (globalThis.$fetch as any)(`${baseUrl}/api/v3/depth`, {
        query: { symbol, limit },
      })
      return data
    })
  }

  async function getAccountInfo(): Promise<any> {
    const timestamp = Date.now()
    const queryString = `timestamp=${timestamp}`
    const signature = sign(queryString)

    const data = await (globalThis.$fetch as any)(`${baseUrl}/api/v3/account`, {
      query: { timestamp, signature },
      headers: { 'X-MBX-APIKEY': apiKey },
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
    const timestamp = Date.now()
    const queryString = `timestamp=${timestamp}`
    const signature = sign(queryString)

    const data = await (globalThis.$fetch as any)(`${baseUrl}/sapi/v1/account/apiRestrictions`, {
      query: { timestamp, signature },
      headers: { 'X-MBX-APIKEY': apiKey },
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

  return { getTicker, getKlines, getOrderBook, getAccountInfo, getApiKeyPermissions }
}
