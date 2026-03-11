import { useBinance } from './binance'
import { useGemini } from './gemini'
import { useTelegram } from './telegram'
import { calculateIndicators } from './indicators'
import type { TickerData, IndicatorResult, AnalysisResult } from '../utils/types'
import { INTERVAL_EXPIRY_MINUTES } from '../utils/types'
import { TRADING_RULES_PROMPT } from '../utils/trading-rules'

export function useAnalyzer() {
  const binance = useBinance()
  const gemini = useGemini()
  const telegram = useTelegram()

  async function analyzePair(pairId: string, symbol: string, interval = '1h') {
    const supabase = useDb()
    const ticker = await binance.getTicker(symbol)
    const klines = await binance.getKlines(symbol, interval, 100)
    const closes = klines.map((k) => k.close)
    const indicators = calculateIndicators(closes, klines)

    const prompt = buildPrompt(symbol, interval, ticker, klines, indicators)
    console.log(`Running Gemini analysis for ${symbol} (${interval})`)

    const rawResult = await gemini.analyze(prompt)
    const result = parseAnalysisResult(rawResult)
    const expiryMinutes = INTERVAL_EXPIRY_MINUTES[interval] || 60

    const { data: analysis, error } = await supabase
      .from('analyses')
      .insert({
        trading_pair_id: pairId,
        type: 'technical',
        interval,
        signal: result.signal,
        confidence: result.confidence,
        summary: result.summary,
        raw_response: rawResult,
        indicators: indicators as any,
        expires_at: new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to save analysis: ${error.message}`)

    // Auto-send to Telegram
    telegram.sendAnalysisAlert(symbol, analysis).catch(() => {})

    // If actionable signal (buy/sell), send trade confirmation request
    const actionableSignals = ['strong_buy', 'buy', 'sell', 'strong_sell']
    if (actionableSignals.includes(result.signal)) {
      telegram.sendTradeConfirmation(symbol, analysis).catch(() => {})
    }

    return analysis
  }

  async function analyzeAllPairs(interval = '1h') {
    const supabase = useDb()
    const { data: pairs } = await supabase
      .from('trading_pairs')
      .select('*')
      .eq('is_active', true)

    const results = []

    for (const pair of pairs || []) {
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
    const supabase = useDb()
    const { data: pairs } = await supabase
      .from('trading_pairs')
      .select('*')
      .eq('is_active', true)

    if (!pairs?.length) throw new Error('No active trading pairs found')

    const pairData = []

    for (const pair of pairs) {
      const ticker = await binance.getTicker(pair.symbol)

      const { data: latestAnalysis } = await supabase
        .from('analyses')
        .select('*')
        .eq('trading_pair_id', pair.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

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
    const mainPair = pairs[0]!

    const { data: analysis, error } = await supabase
      .from('analyses')
      .insert({
        trading_pair_id: mainPair.id,
        type: 'market_summary',
        signal: rawResult.overall_sentiment || 'hold',
        confidence: rawResult.confidence || 0,
        summary: rawResult.summary || 'Market summary unavailable.',
        raw_response: rawResult,
        indicators: { pairs: pairData },
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to save summary: ${error.message}`)

    // Auto-send to Telegram
    telegram.sendMarketSummary(analysis).catch(() => {})

    return analysis
  }

  return { analyzePair, analyzeAllPairs, generateMarketSummary }
}

function parseAnalysisResult(raw: any): AnalysisResult {
  const keyLevels = raw.key_levels || null
  const entry = keyLevels?.entry || keyLevels?.support || 0
  const sl = keyLevels?.stop_loss || 0
  const tp = keyLevels?.take_profit || 0
  const rr = sl && entry && tp ? Math.abs(tp - entry) / Math.abs(entry - sl) : 0

  return {
    signal: raw.signal || 'hold',
    confidence: Math.min(100, Math.max(0, parseFloat(raw.confidence) || 0)),
    summary: raw.summary || 'Analysis unavailable.',
    keyLevels: keyLevels ? {
      support: parseFloat(keyLevels.support) || 0,
      resistance: parseFloat(keyLevels.resistance) || 0,
      stopLoss: parseFloat(keyLevels.stop_loss) || 0,
      takeProfit: parseFloat(keyLevels.take_profit) || 0,
      entry: parseFloat(keyLevels.entry) || 0,
    } : null,
    risk: raw.risk || null,
    trend: raw.trend || null,
    timeframeBias: raw.timeframe_bias || null,
    riskRewardRatio: rr > 0 ? Math.round(rr * 100) / 100 : null,
    positionSizeAdvice: raw.position_size_advice || null,
    retracementType: raw.retracement_type || null,
    orderFlow: raw.order_flow || null,
    priceAction: raw.price_action ? {
      wickAnalysis: raw.price_action.wick_analysis || '',
      momentumDirection: raw.price_action.momentum_direction || '',
      volumeSignal: raw.price_action.volume_signal || '',
      keyObservation: raw.price_action.key_observation || '',
    } : null,
    tradeChecklist: raw.trade_checklist ? {
      slSet: !!raw.trade_checklist.sl_set,
      tpSet: !!raw.trade_checklist.tp_set,
      rrAbove3: !!raw.trade_checklist.rr_above_3,
      trendAligned: !!raw.trade_checklist.trend_aligned,
      noFomo: !!raw.trade_checklist.no_fomo,
      rejectionConfirmed: !!raw.trade_checklist.rejection_confirmed,
      entryNotes: raw.trade_checklist.entry_notes || '',
    } : null,
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

  return `You are a professional crypto trading analyst who follows STRICT risk management and trading discipline.

${TRADING_RULES_PROMPT}

## Current Market Data for ${symbol} (${interval} timeframe)
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

## ANALYSIS REQUIREMENTS
1. First determine SL, then TP (minimum 1:3 R:R)
2. Identify the trend, momentum, and order flow
3. Analyze price action: wicks, volume, rejection patterns
4. Determine retracement type if applicable
5. Only recommend entry if there is a confirmed rejection/setup — NO FOMO signals
6. Calculate suggested position size based on 3% risk rule
7. Provide entry notes explaining WHY this trade setup exists

Respond with this EXACT JSON structure:
{
  "signal": "strong_buy|buy|hold|sell|strong_sell",
  "confidence": <number 0-100>,
  "summary": "<2-3 sentence analysis explaining key factors and reasoning>",
  "key_levels": {
    "support": <price>,
    "resistance": <price>,
    "stop_loss": <REQUIRED - calculated SL price>,
    "take_profit": <REQUIRED - calculated TP price, must be >= 1:3 R:R from SL>,
    "entry": <suggested entry price>
  },
  "risk": "low|medium|high",
  "trend": "bullish|bearish|sideways",
  "timeframe_bias": "<expected move in this timeframe>",
  "retracement_type": "light|normal|deeper_correction|horizontal|none",
  "order_flow": "<Where is order flow? Who are buyers/sellers? Who is the loser?>",
  "price_action": {
    "wick_analysis": "<upper/lower wick analysis — what do they tell us>",
    "momentum_direction": "<current momentum direction and strength>",
    "volume_signal": "<what volume is telling us — giant candles, support/resistance zones>",
    "key_observation": "<most important price action observation>"
  },
  "position_size_advice": "<Calculate based on $100 capital, 3% risk = $3 max loss. e.g. 'Capital $100, Risk $3, SL distance $X = Y units position size'>",
  "trade_checklist": {
    "sl_set": true|false,
    "tp_set": true|false,
    "rr_above_3": true|false,
    "trend_aligned": true|false,
    "no_fomo": true|false,
    "rejection_confirmed": true|false,
    "entry_notes": "<WHY are you entering this trade? What setup do you see?>"
  }
}`
}

function buildMarketSummaryPrompt(pairData: any[]): string {
  const table = pairData
    .map((p) => `${p.symbol}: $${p.price} (${p.change24h.toFixed(2)}%) Signal: ${p.signal} (${p.confidence.toFixed(0)}%)`)
    .join('\n')

  return `You are a crypto market analyst following strict risk management (3% max risk per trade, 1:3 minimum R:R).

Provide an overall market summary based on these trading pairs:

${table}

Respond with this exact JSON structure:
{
  "overall_sentiment": "strong_buy|buy|hold|sell|strong_sell",
  "confidence": <number 0-100>,
  "summary": "<3-4 sentence market overview including risk assessment>",
  "top_pick": "<symbol with best risk-adjusted opportunity>",
  "risk_level": "low|medium|high",
  "market_phase": "accumulation|markup|distribution|markdown"
}`
}
