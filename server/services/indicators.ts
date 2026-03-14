import type { KlineData, IndicatorResult } from '../utils/types'

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null
  const slice = values.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / period
}

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null
  const multiplier = 2 / (period + 1)
  let result = sma(values.slice(0, period), period)!
  for (let i = period; i < values.length; i++) {
    result = ((values[i] ?? 0) - result) * multiplier + result
  }
  return result
}

export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null

  const gains: number[] = []
  const losses: number[] = []

  for (let i = 1; i < closes.length; i++) {
    const change = (closes[i] ?? 0) - (closes[i - 1] ?? 0)
    gains.push(change > 0 ? change : 0)
    losses.push(change < 0 ? Math.abs(change) : 0)
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + (gains[i] ?? 0)) / period
    avgLoss = (avgLoss * (period - 1) + (losses[i] ?? 0)) / period
  }

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return +(100 - 100 / (1 + rs)).toFixed(2)
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9) {
  if (closes.length < slow + signalPeriod) return null

  const macdLine: number[] = []
  for (let i = slow; i <= closes.length; i++) {
    const slice = closes.slice(0, i)
    const f = ema(slice, fast)!
    const s = ema(slice, slow)!
    macdLine.push(f - s)
  }

  const signalLine = ema(macdLine, signalPeriod)!
  const currentMacd = macdLine[macdLine.length - 1] ?? 0
  return {
    macd: +currentMacd.toFixed(8),
    signal: +signalLine.toFixed(8),
    histogram: +(currentMacd - signalLine).toFixed(8),
  }
}

export function bollingerBands(closes: number[], period = 20, stdDevMultiplier = 2.0) {
  if (closes.length < period) return null
  const slice = closes.slice(-period)
  const middle = slice.reduce((a, b) => a + b, 0) / period
  const squaredDiffs = slice.map((v) => Math.pow(v - middle, 2))
  const stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / period)
  return {
    upper: +(middle + stdDevMultiplier * stdDev).toFixed(8),
    middle: +middle.toFixed(8),
    lower: +(middle - stdDevMultiplier * stdDev).toFixed(8),
    bandwidth: middle > 0 ? +((stdDevMultiplier * 2 * stdDev) / middle * 100).toFixed(4) : 0,
  }
}

export function atr(klines: KlineData[], period = 14): number | null {
  if (klines.length < period + 1) return null
  const trueRanges: number[] = []
  for (let i = 1; i < klines.length; i++) {
    const k = klines[i]!
    const prevK = klines[i - 1]!
    trueRanges.push(Math.max(k.high - k.low, Math.abs(k.high - prevK.close), Math.abs(k.low - prevK.close)))
  }
  let result = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < trueRanges.length; i++) {
    result = (result * (period - 1) + (trueRanges[i] ?? 0)) / period
  }
  return +result.toFixed(8)
}

export function volumeProfile(klines: KlineData[], recentCount = 20) {
  const recent = klines.slice(-recentCount)
  const volumes = recent.map((k) => k.volume)
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length
  const currentVolume = volumes[volumes.length - 1] ?? 0
  return {
    current: currentVolume,
    average: +avgVolume.toFixed(2),
    ratio: avgVolume > 0 ? +(currentVolume / avgVolume).toFixed(2) : 0,
    trend: currentVolume > avgVolume * 1.5 ? 'high' : currentVolume < avgVolume * 0.5 ? 'low' : 'normal',
  }
}

export function supportResistance(klines: KlineData[], lookback = 50) {
  const recent = klines.slice(-lookback)
  const highs = recent.map((k) => k.high)
  const lows = recent.map((k) => k.low)
  const maxHigh = Math.max(...highs)
  const minLow = Math.min(...lows)
  const lastClose = recent[recent.length - 1]?.close ?? 0
  return {
    resistance: maxHigh,
    support: minLow,
    pivot: +((maxHigh + minLow + lastClose) / 3).toFixed(8),
  }
}

export function calculateIndicators(closes: number[], klines: KlineData[]): IndicatorResult {
  const currentPrice = closes[closes.length - 1] ?? 0
  const prev5 = closes[closes.length - 5]
  const priceChange5 = closes.length >= 5 && prev5
    ? +((currentPrice - prev5) / prev5 * 100).toFixed(4)
    : null

  return {
    rsi14: rsi(closes, 14),
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    ema12: ema(closes, 12),
    ema26: ema(closes, 26),
    macd: macd(closes),
    bollingerBands: bollingerBands(closes),
    atr14: atr(klines, 14),
    volumeProfile: volumeProfile(klines),
    supportResistance: supportResistance(klines),
    currentPrice,
    priceChange5,
  }
}
