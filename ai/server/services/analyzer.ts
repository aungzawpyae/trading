import { eq, desc } from 'drizzle-orm'
import { analyses, tradingPairs } from '../database/schema'
import { useBinance } from './binance'
import { useGemini } from './gemini'
import { useTelegram } from './telegram'
import { calculateIndicators } from './indicators'
import type { TickerData, IndicatorResult, AnalysisResult } from '../utils/types'
import { INTERVAL_EXPIRY_MINUTES } from '../utils/types'

export function useAnalyzer() {
  const binance = useBinance()
  const gemini = useGemini()
  const telegram = useTelegram()

  async function analyzePair(pairId: string, symbol: string, interval = '1h') {
    const db = useDb()
    const ticker = await binance.getTicker(symbol)
    const klines = await binance.getKlines(symbol, interval, 100)
    const closes = klines.map((k) => k.close)
    const indicators = calculateIndicators(closes, klines)

    const prompt = buildPrompt(symbol, interval, ticker, klines, indicators)
    console.log(`Running Gemini analysis for ${symbol} (${interval})`)

    const rawResult = await gemini.analyze(prompt)
    const result = parseAnalysisResult(rawResult)
    const expiryMinutes = INTERVAL_EXPIRY_MINUTES[interval] || 60

    const [analysis] = await db.insert(analyses).values({
      tradingPairId: pairId,
      type: 'technical',
      interval,
      signal: result.signal,
      confidence: String(result.confidence),
      summary: result.summary,
      rawResponse: rawResult,
      indicators: indicators as any,
      expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
    }).returning()

    // Auto-send to Telegram
    telegram.sendAnalysisAlert(symbol, analysis).catch(() => {})

    return analysis
  }

  async function analyzeAllPairs(interval = '1h') {
    const db = useDb()
    const pairs = await db.select().from(tradingPairs).where(eq(tradingPairs.isActive, true))
    const results = []

    for (const pair of pairs) {
      try {
        const analysis = await analyzePair(pair.id, pair.symbol, interval)
        results.push(analysis)
      } catch (err: any) {
        console.error(`Analysis failed for ${pair.symbol}:`, err.message)
      }
    }

    return results
  }

  async function generateMarketSummary() {
    const db = useDb()
    const pairs = await db.select().from(tradingPairs).where(eq(tradingPairs.isActive, true))
    const pairData = []

    for (const pair of pairs) {
      const ticker = await binance.getTicker(pair.symbol)

      const [latestAnalysis] = await db.select()
        .from(analyses)
        .where(eq(analyses.tradingPairId, pair.id))
        .orderBy(desc(analyses.createdAt))
        .limit(1)

      pairData.push({
        symbol: pair.symbol,
        price: ticker.price,
        change24h: ticker.priceChangePct24h,
        volume24h: ticker.volume24h,
        signal: latestAnalysis?.signal || 'unknown',
        confidence: latestAnalysis ? parseFloat(latestAnalysis.confidence || '0') : 0,
      })
    }

    const prompt = buildMarketSummaryPrompt(pairData)
    const rawResult = await gemini.analyze(prompt)
    const mainPair = pairs[0]
    if (!mainPair) throw new Error('No active trading pairs found')

    const [analysis] = await db.insert(analyses).values({
      tradingPairId: mainPair.id,
      type: 'market_summary',
      signal: rawResult.overall_sentiment || 'hold',
      confidence: String(rawResult.confidence || 0),
      summary: rawResult.summary || 'Market summary unavailable.',
      rawResponse: rawResult,
      indicators: { pairs: pairData } as any,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    }).returning()

    // Auto-send to Telegram
    telegram.sendMarketSummary(analysis).catch(() => {})

    return analysis
  }

  return { analyzePair, analyzeAllPairs, generateMarketSummary }
}

function parseAnalysisResult(raw: any): AnalysisResult {
  return {
    signal: raw.signal || 'hold',
    confidence: Math.min(100, Math.max(0, parseFloat(raw.confidence) || 0)),
    summary: raw.summary || 'Analysis unavailable.',
    keyLevels: raw.key_levels || null,
    risk: raw.risk || null,
    trend: raw.trend || null,
    timeframeBias: raw.timeframe_bias || null,
  }
}

function buildPrompt(symbol: string, interval: string, ticker: TickerData, klines: any[], indicators: IndicatorResult): string {
  const recentKlines = klines.slice(-20)
  const klinesTable = recentKlines
    .map((k: any) => `O:${k.open.toFixed(2)} H:${k.high.toFixed(2)} L:${k.low.toFixed(2)} C:${k.close.toFixed(2)} V:${k.volume.toFixed(2)}`)
    .join('\n')

  const macdStr = indicators.macd
    ? `MACD: ${indicators.macd.macd}, Signal: ${indicators.macd.signal}, Histogram: ${indicators.macd.histogram}`
    : 'MACD: insufficient data'

  const bbStr = indicators.bollingerBands
    ? `Upper: ${indicators.bollingerBands.upper}, Middle: ${indicators.bollingerBands.middle}, Lower: ${indicators.bollingerBands.lower}, Bandwidth: ${indicators.bollingerBands.bandwidth}%`
    : 'BB: insufficient data'

  const sr = indicators.supportResistance
  const vol = indicators.volumeProfile

  return `You are a professional crypto trading analyst. Analyze the following market data for ${symbol} on the ${interval} timeframe.

## Current Market Data
- Price: ${ticker.price}
- 24h Change: ${ticker.priceChangePct24h}%
- 24h High: ${ticker.high24h}
- 24h Low: ${ticker.low24h}
- 24h Volume: ${ticker.volume24h} USDT

## Technical Indicators
- RSI(14): ${indicators.rsi14}
- SMA(20): ${indicators.sma20}
- SMA(50): ${indicators.sma50}
- EMA(12): ${indicators.ema12}
- EMA(26): ${indicators.ema26}
- ${macdStr}
- Bollinger Bands: ${bbStr}
- ATR(14): ${indicators.atr14}
- Volume: Current: ${vol.current}, Avg: ${vol.average}, Ratio: ${vol.ratio}x (${vol.trend})
- Support/Resistance: Support: ${sr.support}, Resistance: ${sr.resistance}, Pivot: ${sr.pivot}
- 5-period price change: ${indicators.priceChange5}%

## Recent Candles (${interval}, last 20)
${klinesTable}

Analyze and respond with this exact JSON structure:
{
  "signal": "strong_buy|buy|hold|sell|strong_sell",
  "confidence": <number 0-100>,
  "summary": "<2-3 sentence analysis explaining the key factors>",
  "key_levels": {
    "support": <price>,
    "resistance": <price>,
    "stop_loss": <suggested stop loss price>,
    "take_profit": <suggested take profit price>
  },
  "risk": "low|medium|high",
  "trend": "bullish|bearish|sideways",
  "timeframe_bias": "<short description of expected move in this timeframe>"
}`
}

function buildMarketSummaryPrompt(pairData: any[]): string {
  const table = pairData
    .map((p) => `${p.symbol}: $${p.price} (${p.change24h.toFixed(2)}%) Signal: ${p.signal} (${p.confidence.toFixed(0)}%)`)
    .join('\n')

  return `You are a crypto market analyst. Provide an overall market summary based on these trading pairs:

${table}

Respond with this exact JSON structure:
{
  "overall_sentiment": "strong_buy|buy|hold|sell|strong_sell",
  "confidence": <number 0-100>,
  "summary": "<3-4 sentence market overview>",
  "top_pick": "<symbol with best opportunity>",
  "risk_level": "low|medium|high",
  "market_phase": "accumulation|markup|distribution|markdown"
}`
}
