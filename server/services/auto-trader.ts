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

  async function autoAnalyzeAndTrade(pairId: string, symbol: string, interval = '15m'): Promise<any> {
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

    // Step 2: Check consecutive losses from journal
    const { data: recentJournal } = await supabase
      .from('trade_journal')
      .select('result')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(3)

    const consecutiveLosses = (recentJournal || [])
      .filter((t: any) => t.result === 'loss').length

    if (consecutiveLosses >= TRADING_RULES.maxConsecutiveLosses) {
      const msg = `🛑 <b>AUTO-TRADE BLOCKED</b>\n\n${symbol}: 3 consecutive losses detected.\nTrading paused. Reset required.\n\nSend /reset_trading to resume.`
      await telegram.sendMessage(msg)
      return { skipped: true, reason: 'consecutive_losses', losses: consecutiveLosses }
    }

    // Step 3: Run AI analysis (day trader mode)
    const analysis = await analyzer.analyzePair(pairId, symbol, interval)
    const raw = analysis.raw_response || {}
    const checklist = raw.trade_checklist || {}

    // Step 4: Validate
    const actionableSignals = ['strong_buy', 'buy', 'sell', 'strong_sell']
    if (!actionableSignals.includes(analysis.signal)) {
      console.log(`${symbol}: Signal is ${analysis.signal}, no trade.`)
      return { skipped: true, reason: 'no_signal', signal: analysis.signal }
    }

    if (!checklist.sl_set || !checklist.tp_set) {
      await telegram.sendMessage(`⚠️ ${symbol} — Signal: ${analysis.signal} but SL/TP not set. Skipping.`)
      return { skipped: true, reason: 'checklist_failed', missing: 'sl_tp' }
    }

    if (!checklist.rr_above_3) {
      await telegram.sendMessage(`⚠️ ${symbol} — R:R below 1:3. Skipping.`)
      return { skipped: true, reason: 'checklist_failed', missing: 'rr_ratio' }
    }

    if (!checklist.no_fomo) {
      await telegram.sendMessage(`⚠️ ${symbol} — FOMO detected. Skipping.`)
      return { skipped: true, reason: 'checklist_failed', missing: 'fomo' }
    }

    const keyLevels = raw.key_levels
    if (!keyLevels?.entry || !keyLevels?.stop_loss || !keyLevels?.take_profit) {
      await telegram.sendMessage(`⚠️ ${symbol} — Missing entry/SL/TP levels. Skipping.`)
      return { skipped: true, reason: 'missing_levels' }
    }

    // Step 5: Calculate position size
    const entryPrice = parseFloat(keyLevels.entry)
    const stopLoss = parseFloat(keyLevels.stop_loss)
    const takeProfit = parseFloat(keyLevels.take_profit)
    const slDistance = Math.abs(entryPrice - stopLoss)

    if (slDistance === 0) return { skipped: true, reason: 'invalid_sl_distance' }

    const futuresAccount = await binance.getFuturesAccount()
    const walletBalance = futuresAccount.availableBalance
    const riskAmount = walletBalance * (TRADING_RULES.maxRiskPerTrade / 100)
    const rr = Math.abs(takeProfit - entryPrice) / slDistance

    const exchangeInfo = await binance.getFuturesExchangeInfo(symbol)
    const quantityPrecision = exchangeInfo?.quantityPrecision || 3
    const leverage = 10

    let quantity = (riskAmount * leverage) / slDistance
    quantity = parseFloat(quantity.toFixed(quantityPrecision))

    if (exchangeInfo?.minQty && quantity < exchangeInfo.minQty) {
      await telegram.sendMessage(`⚠️ ${symbol} — Position size ${quantity} below minimum. Skipping.`)
      return { skipped: true, reason: 'below_min_qty' }
    }

    const isBuy = ['strong_buy', 'buy'].includes(analysis.signal)
    const side: 'BUY' | 'SELL' = isBuy ? 'BUY' : 'SELL'
    const closeSide: 'BUY' | 'SELL' = isBuy ? 'SELL' : 'BUY'

    // Step 6: Execute trade
    try {
      await binance.futuresSetLeverage(symbol, leverage).catch(() => {})

      console.log(`🚀 Auto-trade: ${side} ${quantity} ${symbol} @ market`)
      const order = await binance.futuresMarketOrder(symbol, side, quantity)

      const slOrder = await binance.futuresStopLossOrder(symbol, closeSide, quantity, stopLoss).catch((err: any) => {
        console.error(`SL order failed: ${err.message}`)
        return null
      })

      const tpOrder = await binance.futuresTakeProfitOrder(symbol, closeSide, quantity, takeProfit).catch((err: any) => {
        console.error(`TP order failed: ${err.message}`)
        return null
      })

      const execution: TradeExecution = {
        symbol, side, quantity, entryPrice, stopLoss, takeProfit, leverage,
        riskReward: Math.round(rr * 100) / 100,
        orderId: order.orderId,
        slOrderId: slOrder?.orderId || null,
        tpOrderId: tpOrder?.orderId || null,
      }

      // Step 7: Write Trade Journal
      await supabase.from('trade_journal').insert({
        trading_pair_id: pairId,
        symbol,
        side,
        status: 'open',
        entry_price: entryPrice,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        quantity,
        leverage,
        risk_reward: Math.round(rr * 100) / 100,
        risk_amount: riskAmount,
        wallet_balance: walletBalance,
        interval,
        signal: analysis.signal,
        confidence: analysis.confidence,
        entry_notes: checklist.entry_notes || analysis.summary,
        order_flow: raw.order_flow || null,
        analysis_id: analysis.id,
        order_id: String(order.orderId),
        sl_order_id: slOrder ? String(slOrder.orderId) : null,
        tp_order_id: tpOrder ? String(tpOrder.orderId) : null,
        opened_at: new Date().toISOString(),
      })

      // Step 8: Alert Telegram
      await sendTradeAlert(execution, analysis, walletBalance, riskAmount)

      return { success: true, execution }
    } catch (err: any) {
      const errMsg = `❌ <b>AUTO-TRADE FAILED</b>\n\n${symbol} ${side}\nError: ${err.message}`
      await telegram.sendMessage(errMsg)
      console.error(`Auto-trade failed for ${symbol}:`, err.message)
      return { success: false, error: err.message }
    }
  }

  /**
   * Check open positions and close/update journal if SL/TP hit
   */
  async function checkAndClosePositions(): Promise<any[]> {
    const supabase = useDb()
    const results: any[] = []

    // Get open journal entries
    const { data: openTrades } = await supabase
      .from('trade_journal')
      .select('*')
      .eq('status', 'open')

    if (!openTrades?.length) return results

    // Get current positions
    const positions = await binance.getFuturesPositions()

    for (const trade of openTrades) {
      const pos = positions.find((p) => p.symbol === trade.symbol && p.positionAmt !== 0)

      if (!pos) {
        // Position was closed (SL or TP hit, or manual close)
        const ticker = await binance.getTicker(trade.symbol)
        const exitPrice = ticker.price
        const isBuy = trade.side === 'BUY'
        const pnl = isBuy
          ? (exitPrice - parseFloat(trade.entry_price)) * parseFloat(trade.quantity)
          : (parseFloat(trade.entry_price) - exitPrice) * parseFloat(trade.quantity)
        const pnlPct = ((exitPrice - parseFloat(trade.entry_price)) / parseFloat(trade.entry_price)) * 100 * (isBuy ? 1 : -1)

        let result: string
        if (pnl > 0) result = 'win'
        else if (pnl < 0) result = 'loss'
        else result = 'breakeven'

        // Determine exit reason
        let exitNotes = 'Position closed'
        if (isBuy && exitPrice <= parseFloat(trade.stop_loss)) exitNotes = 'Stop Loss hit'
        else if (isBuy && exitPrice >= parseFloat(trade.take_profit)) exitNotes = 'Take Profit hit'
        else if (!isBuy && exitPrice >= parseFloat(trade.stop_loss)) exitNotes = 'Stop Loss hit'
        else if (!isBuy && exitPrice <= parseFloat(trade.take_profit)) exitNotes = 'Take Profit hit'

        // Update journal
        await supabase
          .from('trade_journal')
          .update({
            status: 'closed',
            exit_price: exitPrice,
            pnl: Math.round(pnl * 100) / 100,
            pnl_percent: Math.round(pnlPct * 100) / 100,
            result,
            exit_notes: exitNotes,
            closed_at: new Date().toISOString(),
          })
          .eq('id', trade.id)

        // Alert Telegram
        const emoji = result === 'win' ? '🟢' : result === 'loss' ? '🔴' : '⚪'
        let msg = `${emoji} <b>TRADE CLOSED — ${trade.symbol}</b>\n`
        msg += `${'─'.repeat(25)}\n\n`
        msg += `Side: ${trade.side === 'BUY' ? 'LONG' : 'SHORT'}\n`
        msg += `Entry: $${parseFloat(trade.entry_price).toLocaleString()}\n`
        msg += `Exit: $${exitPrice.toLocaleString()}\n`
        msg += `PnL: $${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%)\n`
        msg += `Result: <b>${result.toUpperCase()}</b>\n`
        msg += `Reason: ${exitNotes}\n`
        msg += `\n📝 Entry: ${trade.entry_notes || '-'}`

        await telegram.sendMessage(msg)

        results.push({ symbol: trade.symbol, result, pnl, exitNotes })
      }
    }

    return results
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

    msg += `${analysis.summary}`
    await telegram.sendMessage(msg)
  }

  async function autoTradeAllPairs(interval = '15m'): Promise<any[]> {
    const supabase = useDb()
    const { data: pairs } = await supabase
      .from('trading_pairs')
      .select('*')
      .eq('is_active', true)

    const results = []

    // First check and close any finished positions
    await checkAndClosePositions()

    await telegram.sendMessage(`🤖 <b>Day Trade Scan</b>\nPairs: ${(pairs || []).length} | TF: ${interval}`)

    for (const pair of pairs || []) {
      try {
        const result = await autoAnalyzeAndTrade(pair.id, pair.symbol, interval)
        results.push({ symbol: pair.symbol, ...result })
      } catch (err: any) {
        console.error(`Auto-trade error ${pair.symbol}:`, err.message)
        results.push({ symbol: pair.symbol, error: err.message })
      }
    }

    const executed = results.filter((r) => r.success)
    const skipped = results.filter((r) => r.skipped)

    let summary = `📋 <b>Scan Complete</b>\n`
    summary += `✅ Executed: ${executed.length} | ⏭️ Skipped: ${skipped.length}`
    await telegram.sendMessage(summary)

    return results
  }

  return { autoAnalyzeAndTrade, autoTradeAllPairs, checkAndClosePositions }
}
