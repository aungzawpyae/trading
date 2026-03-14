interface TickerStream {
  s: string      // Symbol
  c: string      // Last price
  P: string      // Price change percent 24h
  p: string      // Price change 24h
  h: string      // High 24h
  l: string      // Low 24h
  v: string      // Base volume
  q: string      // Quote volume
  o: string      // Open price
}

export interface MarketCoin {
  symbol: string
  baseAsset: string
  quoteAsset: string
  price: number
  priceChange24h: number
  priceChangePct24h: number
  high24h: number
  low24h: number
  volume24h: number
  quoteVolume24h: number
  openPrice: number
  prevPrice: number
  flash: 'up' | 'down' | null
}

export function useBinanceWs() {
  const coins = ref<Map<string, MarketCoin>>(new Map())
  const connected = ref(false)
  const coinList = computed(() => {
    return Array.from(coins.value.values())
      .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
  })

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function connect() {
    if (ws) ws.close()

    // All market tickers stream
    ws = new WebSocket('wss://stream.binance.com:9443/ws/!ticker@arr')

    ws.onopen = () => {
      connected.value = true
    }

    ws.onmessage = (event) => {
      const tickers: TickerStream[] = JSON.parse(event.data)
      const updated = new Map(coins.value)

      for (const t of tickers) {
        // Only USDT pairs
        if (!t.s.endsWith('USDT')) continue
        // Skip leveraged tokens and stablecoins
        if (t.s.includes('UP') || t.s.includes('DOWN') || t.s.includes('BEAR') || t.s.includes('BULL')) continue
        if (['USDCUSDT', 'BUSDUSDT', 'TUSDUSDT', 'DAIUSDT', 'FDUSDUSDT', 'EURUSDT'].includes(t.s)) continue

        const price = parseFloat(t.c)
        const existing = updated.get(t.s)
        const prevPrice = existing?.price ?? price

        let flash: 'up' | 'down' | null = null
        if (existing) {
          if (price > prevPrice) flash = 'up'
          else if (price < prevPrice) flash = 'down'
        }

        updated.set(t.s, {
          symbol: t.s,
          baseAsset: t.s.replace('USDT', ''),
          quoteAsset: 'USDT',
          price,
          priceChange24h: parseFloat(t.p),
          priceChangePct24h: parseFloat(t.P),
          high24h: parseFloat(t.h),
          low24h: parseFloat(t.l),
          volume24h: parseFloat(t.v),
          quoteVolume24h: parseFloat(t.q),
          openPrice: parseFloat(t.o),
          prevPrice,
          flash,
        })
      }

      coins.value = updated
    }

    ws.onclose = () => {
      connected.value = false
      reconnectTimer = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (ws) {
      ws.onclose = null
      ws.close()
    }
    connected.value = false
  }

  return { coins, coinList, connected, connect, disconnect }
}
