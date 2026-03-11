// ─── Enums ───
export const Signal = {
  StrongBuy: 'strong_buy',
  Buy: 'buy',
  Hold: 'hold',
  Sell: 'sell',
  StrongSell: 'strong_sell',
} as const
export type Signal = typeof Signal[keyof typeof Signal]

export const Interval = {
  OneMinute: '1m',
  FiveMinutes: '5m',
  FifteenMinutes: '15m',
  OneHour: '1h',
  FourHours: '4h',
  OneDay: '1d',
} as const
export type Interval = typeof Interval[keyof typeof Interval]

export const RiskLevel = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
} as const
export type RiskLevel = typeof RiskLevel[keyof typeof RiskLevel]

export const Trend = {
  Bullish: 'bullish',
  Bearish: 'bearish',
  Sideways: 'sideways',
} as const
export type Trend = typeof Trend[keyof typeof Trend]

// ─── DTOs ───
export interface TickerData {
  symbol: string
  price: number
  priceChange24h: number
  priceChangePct24h: number
  high24h: number
  low24h: number
  volume24h: number
}

export interface KlineData {
  openTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  closeTime: number
  quoteVolume: number
  tradesCount: number
}

export interface IndicatorResult {
  rsi14: number | null
  sma20: number | null
  sma50: number | null
  ema12: number | null
  ema26: number | null
  macd: { macd: number; signal: number; histogram: number } | null
  bollingerBands: { upper: number; middle: number; lower: number; bandwidth: number } | null
  atr14: number | null
  volumeProfile: { current: number; average: number; ratio: number; trend: string }
  supportResistance: { support: number; resistance: number; pivot: number }
  currentPrice: number
  priceChange5: number | null
}

export interface AnalysisResult {
  signal: Signal
  confidence: number
  summary: string
  keyLevels: { support: number; resistance: number; stopLoss?: number; takeProfit?: number } | null
  risk: RiskLevel | null
  trend: Trend | null
  timeframeBias: string | null
}

export interface MarketSummaryResult {
  overallSentiment: Signal
  confidence: number
  summary: string
  topPick: string | null
  riskLevel: RiskLevel | null
  marketPhase: string | null
}

// ─── Helpers ───
export const INTERVAL_EXPIRY_MINUTES: Record<string, number> = {
  '1m': 2,
  '5m': 10,
  '15m': 20,
  '1h': 60,
  '4h': 240,
  '1d': 1440,
}

export function signalColor(signal: string): string {
  const colors: Record<string, string> = {
    strong_buy: '#00c853',
    buy: '#4caf50',
    hold: '#ff9800',
    sell: '#f44336',
    strong_sell: '#b71c1c',
  }
  return colors[signal] || '#9e9e9e'
}

export function signalBadgeClass(signal: string): string {
  const classes: Record<string, string> = {
    strong_buy: 'bg-emerald-500',
    buy: 'bg-emerald-600',
    hold: 'bg-yellow-500',
    sell: 'bg-red-500',
    strong_sell: 'bg-red-700',
  }
  return classes[signal] || 'bg-gray-500'
}
