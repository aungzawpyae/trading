import { defineStore } from 'pinia'

interface PairData {
  id: string
  symbol: string
  baseAsset: string
  quoteAsset: string
  price: number
  changePct: number
  high24h: number
  low24h: number
  volume24h: number
  analysis: {
    signal: string
    confidence: number
    summary: string
    rawResponse: any
    createdAt: string
  } | null
}

interface AnalysisData {
  id: string
  type: string
  interval: string | null
  signal: string
  confidence: string
  summary: string
  rawResponse: any
  indicators: any
  createdAt: string
  isExpired: boolean
}

export const useTradingStore = defineStore('trading', {
  state: () => ({
    pairs: [] as PairData[],
    selectedSymbol: null as string | null,
    selectedPairDetail: null as any,
    currentAnalysis: null as AnalysisData | null,
    loading: false,
    analyzing: {} as Record<string, boolean>,
    error: null as string | null,
  }),

  getters: {
    selectedPair: (state) => state.pairs.find((p) => p.symbol === state.selectedSymbol),
    activePairs: (state) => state.pairs.filter((p) => p.price > 0),
  },

  actions: {
    async fetchDashboard() {
      this.loading = true
      this.error = null
      try {
        const data = await $fetch<{ pairs: PairData[] }>('/api/trading/dashboard')
        this.pairs = data.pairs
      } catch (err: any) {
        this.error = err.message || 'Failed to fetch dashboard'
      } finally {
        this.loading = false
      }
    },

    async fetchPairDetail(symbol: string) {
      this.selectedSymbol = symbol
      try {
        const data = await $fetch(`/api/trading/pairs/${symbol}`)
        this.selectedPairDetail = data
      } catch (err: any) {
        this.error = err.message
      }
    },

    async runAnalysis(symbol: string, interval = '1h') {
      this.analyzing[symbol] = true
      try {
        const data = await $fetch<{ analysis: any }>(`/api/trading/pairs/${symbol}/analyze`, {
          method: 'POST',
          body: { interval },
        })
        // Update the pair in the list
        const idx = this.pairs.findIndex((p) => p.symbol === symbol)
        const pair = idx >= 0 ? this.pairs[idx] : undefined
        if (pair && data.analysis) {
          pair.analysis = {
            signal: data.analysis.signal,
            confidence: parseFloat(data.analysis.confidence),
            summary: data.analysis.summary,
            rawResponse: data.analysis.rawResponse,
            createdAt: data.analysis.createdAt,
          }
        }
        this.currentAnalysis = data.analysis
        return data.analysis
      } catch (err: any) {
        this.error = err.message
        throw err
      } finally {
        this.analyzing[symbol] = false
      }
    },

    async fetchAnalysis(symbol: string) {
      try {
        const data = await $fetch<{ analysis: AnalysisData }>(`/api/trading/pairs/${symbol}/analysis`)
        this.currentAnalysis = data.analysis
        return data.analysis
      } catch {
        this.currentAnalysis = null
      }
    },

    async seedPairs() {
      await $fetch('/api/trading/seed', { method: 'POST' })
      await this.fetchDashboard()
    },
  },
})
