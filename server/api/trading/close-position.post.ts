import { useBinance } from '../../services/binance'
import { useTelegram } from '../../services/telegram'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const symbol = (body?.symbol || '').toUpperCase()

  if (!symbol) {
    throw createError({ statusCode: 400, message: 'symbol is required' })
  }

  const binance = useBinance()
  const telegram = useTelegram()
  const supabase = useDb()

  const positions = await binance.getFuturesPositions()
  const pos = positions.find((p) => p.symbol === symbol)

  if (!pos) {
    throw createError({ statusCode: 404, message: `No open position for ${symbol}` })
  }

  const closeSide: 'BUY' | 'SELL' = pos.positionAmt > 0 ? 'SELL' : 'BUY'
  const qty = Math.abs(pos.positionAmt)

  // Cancel existing orders
  await binance.futuresCancelAllOrders(symbol).catch(() => {})

  // Close position
  const order = await binance.futuresMarketOrder(symbol, closeSide, qty)

  // Update journal
  const { data: journalEntry } = await supabase
    .from('trade_journal')
    .select('*')
    .eq('symbol', symbol)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .single()

  const pnl = pos.unrealizedProfit
  const pnlPct = ((pos.markPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.positionAmt > 0 ? 1 : -1)
  const result = pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven'

  if (journalEntry) {
    await supabase.from('trade_journal').update({
      status: 'closed',
      exit_price: pos.markPrice,
      pnl: Math.round(pnl * 100) / 100,
      pnl_percent: Math.round(pnlPct * 100) / 100,
      result,
      exit_notes: 'Manual close via UI',
      closed_at: new Date().toISOString(),
    }).eq('id', journalEntry.id)
  }

  // Telegram alert
  const emoji = result === 'win' ? '🟢' : result === 'loss' ? '🔴' : '⚪'
  let msg = `${emoji} <b>POSITION CLOSED</b>\n${'─'.repeat(25)}\n\n`
  msg += `${pos.positionAmt > 0 ? '📈' : '📉'} <b>${symbol}</b> ${pos.positionAmt > 0 ? 'LONG' : 'SHORT'}\n`
  msg += `Entry: $${pos.entryPrice}\n`
  msg += `Exit: $${pos.markPrice}\n`
  msg += `PnL: $${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%)\n`
  msg += `Result: <b>${result.toUpperCase()}</b>`
  await telegram.sendMessage(msg)

  return {
    success: true,
    symbol,
    side: pos.positionAmt > 0 ? 'LONG' : 'SHORT',
    entryPrice: pos.entryPrice,
    exitPrice: pos.markPrice,
    pnl: Math.round(pnl * 100) / 100,
    pnlPercent: Math.round(pnlPct * 100) / 100,
    result,
  }
})
