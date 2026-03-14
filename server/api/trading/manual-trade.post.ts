import { useBinance } from '../../services/binance'
import { useTelegram } from '../../services/telegram'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { symbol, side, leverage, stopLoss, takeProfit, riskPercent } = body

  if (!symbol || !side) {
    throw createError({ statusCode: 400, message: 'symbol and side are required' })
  }

  if (!stopLoss || !takeProfit) {
    throw createError({ statusCode: 400, message: 'stopLoss and takeProfit are required' })
  }

  const binance = useBinance()
  const telegram = useTelegram()
  const supabase = useDb()

  // Check existing position
  const positions = await binance.getFuturesPositions()
  const existing = positions.find((p) => p.symbol === symbol && p.positionAmt !== 0)
  if (existing) {
    throw createError({ statusCode: 400, message: `Already in position: ${existing.positionAmt > 0 ? 'LONG' : 'SHORT'} ${Math.abs(existing.positionAmt)}` })
  }

  // Get account balance
  const account = await binance.getFuturesAccount()
  const walletBalance = account.availableBalance
  const riskPct = riskPercent || 3
  const riskAmount = walletBalance * (riskPct / 100)

  // Get ticker for current price
  const ticker = await binance.getTicker(symbol)
  const entryPrice = ticker.price
  const sl = parseFloat(stopLoss)
  const tp = parseFloat(takeProfit)
  const lev = leverage || 10
  const slDistance = Math.abs(entryPrice - sl)

  if (slDistance === 0) {
    throw createError({ statusCode: 400, message: 'Stop loss cannot equal entry price' })
  }

  const rr = Math.abs(tp - entryPrice) / slDistance

  // Get exchange info for precision
  const exchangeInfo = await binance.getFuturesExchangeInfo(symbol)
  const quantityPrecision = exchangeInfo?.quantityPrecision || 3

  let quantity = (riskAmount * lev) / slDistance
  quantity = parseFloat(quantity.toFixed(quantityPrecision))

  if (exchangeInfo?.minQty && quantity < exchangeInfo.minQty) {
    throw createError({ statusCode: 400, message: `Position size ${quantity} below minimum ${exchangeInfo.minQty}` })
  }

  const tradeSide = side.toUpperCase() as 'BUY' | 'SELL'
  const closeSide: 'BUY' | 'SELL' = tradeSide === 'BUY' ? 'SELL' : 'BUY'

  try {
    // Set leverage
    await binance.futuresSetLeverage(symbol, lev).catch(() => {})

    // Market entry
    const order = await binance.futuresMarketOrder(symbol, tradeSide, quantity)

    // SL order
    const slOrder = await binance.futuresStopLossOrder(symbol, closeSide, quantity, sl).catch((err: any) => {
      console.error(`SL order failed: ${err.message}`)
      return null
    })

    // TP order
    const tpOrder = await binance.futuresTakeProfitOrder(symbol, closeSide, quantity, tp).catch((err: any) => {
      console.error(`TP order failed: ${err.message}`)
      return null
    })

    // Get pair ID
    const { data: pair } = await supabase
      .from('trading_pairs')
      .select('id')
      .eq('symbol', symbol)
      .single()

    // Write journal entry
    await supabase.from('trade_journal').insert({
      trading_pair_id: pair?.id,
      symbol,
      side: tradeSide,
      status: 'open',
      entry_price: entryPrice,
      stop_loss: sl,
      take_profit: tp,
      quantity,
      leverage: lev,
      risk_reward: Math.round(rr * 100) / 100,
      risk_amount: riskAmount,
      wallet_balance: walletBalance,
      signal: 'manual',
      entry_notes: `Manual trade via UI`,
      order_id: String(order.orderId),
      sl_order_id: slOrder ? String(slOrder.orderId) : null,
      tp_order_id: tpOrder ? String(tpOrder.orderId) : null,
      opened_at: new Date().toISOString(),
    })

    // Telegram alert
    const direction = tradeSide === 'BUY' ? 'LONG' : 'SHORT'
    let msg = `📊 <b>MANUAL TRADE</b>\n${'─'.repeat(25)}\n\n`
    msg += `${tradeSide === 'BUY' ? '🟢' : '🔴'} <b>${symbol}</b> ${direction} ${lev}x\n`
    msg += `Entry: $${entryPrice.toLocaleString()}\n`
    msg += `SL: $${sl.toLocaleString()}\n`
    msg += `TP: $${tp.toLocaleString()}\n`
    msg += `R:R: 1:${rr.toFixed(1)}\n`
    msg += `Size: ${quantity}\n`
    msg += `Risk: $${riskAmount.toFixed(2)} (${riskPct}%)\n`
    await telegram.sendMessage(msg)

    return {
      success: true,
      order: {
        orderId: order.orderId,
        symbol,
        side: tradeSide,
        quantity,
        entryPrice,
        stopLoss: sl,
        takeProfit: tp,
        leverage: lev,
        riskReward: Math.round(rr * 100) / 100,
        riskAmount,
        slOrderId: slOrder?.orderId || null,
        tpOrderId: tpOrder?.orderId || null,
      },
    }
  } catch (err: any) {
    await telegram.sendMessage(`❌ Manual trade failed: ${symbol} ${tradeSide}\n${err.message}`)
    throw createError({ statusCode: 500, message: err.message })
  }
})
