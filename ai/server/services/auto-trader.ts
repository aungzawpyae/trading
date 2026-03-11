import { useBinance } from './binance'
import { useAnalyzer } from './analyzer'
import { useTelegram } from './telegram'
import { TRADING_RULES } from '../utils/trading-rules'

interface TradeExecution {
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  entryPrice: number
  stopLoss: number
  takeProfit: number
  leverage: number
  riskReward: number
  orderId: any
  slOrderId: any
  tpOrderId: any
}

export function useAutoTrader() {
  const binance = useBinance()
  const analyzer = useAnalyzer()
  const telegram = useTelegram()

  /**
   * Full auto-trade flow:
   * 1. Fetch real market data
   * 2. Run AI analysis
   * 3. Validate trade checklist
   * 4. Calculate position size from actual futures balance
   * 5. Execute market order + SL + TP on demo futures
   * 6. Alert Telegram with full trade details
   */
  async function autoAnalyzeAndTrade(pairId: string, symbol: string, interval = '1h'): Promise<any> {
    const supabase = useDb()

    // Step 1: Check for existing open position
    const positions = await binance.getFuturesPositions()
    const existingPosition = positions.find((p) => p.symbol === symbol && p.positionAmt !== 0)
    if (existingPosition) {
      const msg = `⚠️ ${symbol} — Already in position (${existingPosition.positionAmt > 0 ? 'LONG' : 'SHORT'} ${Math.abs(existingPosition.positionAmt)} @ $${existingPosition.entryPrice}). Skipping.`
      console.log(msg)
      await telegram.sendMessage(msg)
      return { skipped: true, reason: 'existing_position', position: existingPosition }
    }

    // Step 2: Check consecutive losses (3 losses → stop)
    const { data: recentTrades } = await supabase
      .from('alerts')
      .select('*')
      .eq('type', 'trade_executed')
      .order('created_at', { ascending: false })
      .limit(3)

    const consecutiveLosses = (recentTrades || [])
      .filter((t: any) => {
        const data = JSON.parse(t.message || '{}')
        return data.result === 'loss'
      }).length

    if (consecutiveLosses >= TRADING_RULES.maxConsecutiveLosses) {
      const msg = `🛑 <b>AUTO-TRADE BLOCKED</b>\n\n${symbol}: 3 consecutive losses detected.\nTrading paused. Reset required.\n\nSend /reset_trading to resume.`
      await telegram.sendMessage(msg)
      return { skipped: true, reason: 'consecutive_losses', losses: consecutiveLosses }
    }

    // Step 3: Run AI analysis
    const analysis = await analyzer.analyzePair(pairId, symbol, interval)
    const raw = analysis.raw_response || {}
    const checklist = raw.trade_checklist || {}

    // Step 4: Validate — only trade on actionable signals with passing checklist
    const actionableSignals = ['strong_buy', 'buy', 'sell', 'strong_sell']
    if (!actionableSignals.includes(analysis.signal)) {
      console.log(`${symbol}: Signal is ${analysis.signal}, no trade.`)
      return { skipped: true, reason: 'no_signal', signal: analysis.signal }
    }

    // Checklist validation
    if (!checklist.sl_set || !checklist.tp_set) {
      await telegram.sendMessage(`⚠️ ${symbol} — Signal: ${analysis.signal} but SL/TP not set. Skipping auto-trade.`)
      return { skipped: true, reason: 'checklist_failed', missing: 'sl_tp' }
    }

    if (!checklist.rr_above_3) {
      await telegram.sendMessage(`⚠️ ${symbol} — R:R below 1:3. Skipping auto-trade.`)
      return { skipped: true, reason: 'checklist_failed', missing: 'rr_ratio' }
    }

    if (!checklist.no_fomo) {
      await telegram.sendMessage(`⚠️ ${symbol} — FOMO detected by AI. Skipping auto-trade.`)
      return { skipped: true, reason: 'checklist_failed', missing: 'fomo' }
    }

    const keyLevels = raw.key_levels
    if (!keyLevels?.entry || !keyLevels?.stop_loss || !keyLevels?.take_profit) {
      await telegram.sendMessage(`⚠️ ${symbol} — Missing entry/SL/TP levels. Skipping.`)
      return { skipped: true, reason: 'missing_levels' }
    }

    // Step 5: Calculate position size from actual balance
    const entryPrice = parseFloat(keyLevels.entry)
    const stopLoss = parseFloat(keyLevels.stop_loss)
    const takeProfit = parseFloat(keyLevels.take_profit)
    const slDistance = Math.abs(entryPrice - stopLoss)

    if (slDistance === 0) {
      return { skipped: true, reason: 'invalid_sl_distance' }
    }

    const futuresAccount = await binance.getFuturesAccount()
    const walletBalance = futuresAccount.availableBalance
    const riskAmount = walletBalance * (TRADING_RULES.maxRiskPerTrade / 100) // 3%
    const rr = Math.abs(takeProfit - entryPrice) / slDistance

    // Get symbol precision
    const exchangeInfo = await binance.getFuturesExchangeInfo(symbol)
    const quantityPrecision = exchangeInfo?.quantityPrecision || 3
    const leverage = 10 // Default leverage

    // Position size = risk amount * leverage / SL distance
    let quantity = (riskAmount * leverage) / slDistance
    quantity = parseFloat(quantity.toFixed(quantityPrecision))

    if (exchangeInfo?.minQty && quantity < exchangeInfo.minQty) {
      await telegram.sendMessage(`⚠️ ${symbol} — Position size ${quantity} below minimum ${exchangeInfo.minQty}. Skipping.`)
      return { skipped: true, reason: 'below_min_qty' }
    }

    // Determine side
    const isBuy = ['strong_buy', 'buy'].includes(analysis.signal)
    const side: 'BUY' | 'SELL' = isBuy ? 'BUY' : 'SELL'
    const closeSide: 'BUY' | 'SELL' = isBuy ? 'SELL' : 'BUY'

    // Step 6: Execute trade
    try {
      // Set leverage
      await binance.futuresSetLeverage(symbol, leverage).catch(() => {})

      // Place market order
      console.log(`🚀 Auto-trade: ${side} ${quantity} ${symbol} @ market`)
      const order = await binance.futuresMarketOrder(symbol, side, quantity)

      // Place SL order
      const slOrder = await binance.futuresStopLossOrder(symbol, closeSide, quantity, stopLoss).catch((err: any) => {
        console.error(`SL order failed: ${err.message}`)
        return null
      })

      // Place TP order
      const tpOrder = await binance.futuresTakeProfitOrder(symbol, closeSide, quantity, takeProfit).catch((err: any) => {
        console.error(`TP order failed: ${err.message}`)
        return null
      })

      const execution: TradeExecution = {
        symbol,
        side,
        quantity,
        entryPrice,
        stopLoss,
        takeProfit,
        leverage,
        riskReward: Math.round(rr * 100) / 100,
        orderId: order.orderId,
        slOrderId: slOrder?.orderId || null,
        tpOrderId: tpOrder?.orderId || null,
      }

      // Save trade to DB
      await supabase.from('alerts').insert({
        trading_pair_id: pairId,
        type: 'trade_executed',
        message: JSON.stringify({
          ...execution,
          analysis_id: analysis.id,
          confidence: analysis.confidence,
          summary: analysis.summary,
          wallet_balance: walletBalance,
          risk_amount: riskAmount,
          timestamp: new Date().toISOString(),
        }),
        is_triggered: true,
        triggered_at: new Date().toISOString(),
      })

      // Step 7: Alert Telegram
      await sendTradeAlert(execution, analysis, walletBalance, riskAmount)

      return { success: true, execution }
    } catch (err: any) {
      const errMsg = `❌ <b>AUTO-TRADE FAILED</b>\n\n${symbol} ${side}\nError: ${err.message}`
      await telegram.sendMessage(errMsg)
      console.error(`Auto-trade failed for ${symbol}:`, err.message)
      return { success: false, error: err.message }
    }
  }

  async function sendTradeAlert(exec: TradeExecution, analysis: any, balance: number, riskAmt: number) {
    const raw = analysis.raw_response || {}
    const signalEmoji = exec.side === 'BUY' ? '🟢' : '🔴'
    const directionEmoji = exec.side === 'BUY' ? '📈 LONG' : '📉 SHORT'

    let msg = `${signalEmoji}${signalEmoji} <b>AUTO-TRADE EXECUTED</b> ${signalEmoji}${signalEmoji}\n`
    msg += `${'═'.repeat(28)}\n\n`

    msg += `📊 <b>${exec.symbol}</b> — ${directionEmoji}\n`
    msg += `Signal: <b>${analysis.signal.replace('_', ' ').toUpperCase()}</b> (${parseFloat(analysis.confidence || '0').toFixed(0)}%)\n\n`

    msg += `💰 <b>Trade Details</b>\n`
    msg += `  Entry: $${exec.entryPrice.toLocaleString()}\n`
    msg += `  🛑 SL: $${exec.stopLoss.toLocaleString()}\n`
    msg += `  🎯 TP: $${exec.takeProfit.toLocaleString()}\n`
    msg += `  R:R = 1:${exec.riskReward}\n`
    msg += `  Leverage: ${exec.leverage}x\n`
    msg += `  Size: ${exec.quantity} units\n\n`

    msg += `💼 <b>Risk Management</b>\n`
    msg += `  Balance: $${balance.toFixed(2)}\n`
    msg += `  Risk (3%): $${riskAmt.toFixed(2)}\n`
    msg += `  Potential Profit: $${(riskAmt * exec.riskReward).toFixed(2)}\n\n`

    if (raw.trade_checklist?.entry_notes) {
      msg += `📝 <b>Entry Notes:</b>\n${raw.trade_checklist.entry_notes}\n\n`
    }

    if (raw.order_flow) {
      msg += `🔄 <b>Order Flow:</b> ${raw.order_flow}\n\n`
    }

    msg += `${analysis.summary}\n\n`

    msg += `<b>Order IDs:</b>\n`
    msg += `  Market: ${exec.orderId}\n`
    msg += `  SL: ${exec.slOrderId || 'FAILED'}\n`
    msg += `  TP: ${exec.tpOrderId || 'FAILED'}`

    await telegram.sendMessage(msg)
  }

  /**
   * Run auto-trading for all active pairs
   */
  async function autoTradeAllPairs(interval = '1h'): Promise<any[]> {
    const supabase = useDb()
    const { data: pairs } = await supabase
      .from('trading_pairs')
      .select('*')
      .eq('is_active', true)

    const results = []

    await telegram.sendMessage(`🤖 <b>Auto-Trade Scan Starting</b>\nPairs: ${(pairs || []).length} | Interval: ${interval}`)

    for (const pair of pairs || []) {
      try {
        const result = await autoAnalyzeAndTrade(pair.id, pair.symbol, interval)
        results.push({ symbol: pair.symbol, ...result })
      } catch (err: any) {
        console.error(`Auto-trade error ${pair.symbol}:`, err.message)
        results.push({ symbol: pair.symbol, error: err.message })
      }
    }

    // Summary
    const executed = results.filter((r) => r.success)
    const skipped = results.filter((r) => r.skipped)
    const failed = results.filter((r) => r.error)

    let summary = `📋 <b>Auto-Trade Scan Complete</b>\n\n`
    summary += `✅ Executed: ${executed.length}\n`
    summary += `⏭️ Skipped: ${skipped.length}\n`
    summary += `❌ Failed: ${failed.length}\n`

    if (executed.length > 0) {
      summary += `\n<b>Trades:</b>\n`
      for (const r of executed) {
        summary += `  ${r.symbol}: ${r.execution.side} ${r.execution.quantity} @ $${r.execution.entryPrice}\n`
      }
    }

    await telegram.sendMessage(summary)

    return results
  }

  return { autoAnalyzeAndTrade, autoTradeAllPairs }
}
