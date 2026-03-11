const TELEGRAM_API = 'https://api.telegram.org'

export function useTelegram() {
  const config = useRuntimeConfig()
  const botToken = config.telegramBotToken
  const defaultChatId = config.telegramChatId

  async function sendMessage(text: string, chatId?: string): Promise<any> {
    const targetChat = chatId || defaultChatId
    if (!botToken || !targetChat) {
      console.warn('Telegram bot token or chat ID not configured')
      return null
    }

    return (globalThis.$fetch as any)(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: 'POST',
      body: {
        chat_id: targetChat,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      },
    }).catch((err: any) => {
      console.error('Telegram send failed:', err.message)
      return null
    })
  }

  async function getUpdates(): Promise<any> {
    if (!botToken) return null
    return (globalThis.$fetch as any)(`${TELEGRAM_API}/bot${botToken}/getUpdates`, {
      method: 'GET',
    })
  }

  async function getBotInfo(): Promise<any> {
    if (!botToken) return null
    return (globalThis.$fetch as any)(`${TELEGRAM_API}/bot${botToken}/getMe`, {
      method: 'GET',
    })
  }

  // ─── Formatted Messages ───

  function formatAnalysisMessage(symbol: string, analysis: any): string {
    const signalEmoji: Record<string, string> = {
      strong_buy: '🟢🟢',
      buy: '🟢',
      hold: '🟡',
      sell: '🔴',
      strong_sell: '🔴🔴',
    }

    const emoji = signalEmoji[analysis.signal] || '⚪'
    const confidence = parseFloat(analysis.confidence || '0').toFixed(0)
    const raw = analysis.raw_response || {}

    let msg = `${emoji} <b>${symbol}</b> — <b>${analysis.signal.replace('_', ' ').toUpperCase()}</b>\n`
    msg += `Confidence: ${confidence}% | Risk: ${raw.risk || 'N/A'}\n`
    msg += `Trend: ${raw.trend || 'N/A'}`
    if (raw.retracement_type && raw.retracement_type !== 'none') {
      msg += ` | Retracement: ${raw.retracement_type.replace('_', ' ')}`
    }
    msg += `\n\n${analysis.summary}\n`

    if (raw.key_levels) {
      msg += `\n📊 <b>Trade Setup</b>\n`
      if (raw.key_levels.entry) msg += `  Entry: $${parseFloat(raw.key_levels.entry).toLocaleString()}\n`
      if (raw.key_levels.stop_loss) msg += `  🛑 SL: $${parseFloat(raw.key_levels.stop_loss).toLocaleString()}\n`
      if (raw.key_levels.take_profit) msg += `  🎯 TP: $${parseFloat(raw.key_levels.take_profit).toLocaleString()}\n`
      if (raw.key_levels.support) msg += `  Support: $${parseFloat(raw.key_levels.support).toLocaleString()}\n`
      if (raw.key_levels.resistance) msg += `  Resistance: $${parseFloat(raw.key_levels.resistance).toLocaleString()}\n`

      // Calculate R:R
      const entry = parseFloat(raw.key_levels.entry || raw.key_levels.support || 0)
      const sl = parseFloat(raw.key_levels.stop_loss || 0)
      const tp = parseFloat(raw.key_levels.take_profit || 0)
      if (entry && sl && tp) {
        const rr = Math.abs(tp - entry) / Math.abs(entry - sl)
        msg += `  R:R = 1:${rr.toFixed(1)}\n`
      }
    }

    if (raw.order_flow) {
      msg += `\n🔄 <b>Order Flow</b>\n${raw.order_flow}\n`
    }

    if (raw.price_action) {
      msg += `\n📈 <b>Price Action</b>\n`
      if (raw.price_action.wick_analysis) msg += `  Wick: ${raw.price_action.wick_analysis}\n`
      if (raw.price_action.momentum_direction) msg += `  Momentum: ${raw.price_action.momentum_direction}\n`
      if (raw.price_action.key_observation) msg += `  Key: ${raw.price_action.key_observation}\n`
    }

    if (raw.position_size_advice) {
      msg += `\n💰 <b>Position Size</b>\n${raw.position_size_advice}\n`
    }

    // Trade Checklist
    if (raw.trade_checklist) {
      const c = raw.trade_checklist
      msg += `\n✅ <b>Trade Checklist</b>\n`
      msg += `  ${c.sl_set ? '✅' : '❌'} SL Set\n`
      msg += `  ${c.tp_set ? '✅' : '❌'} TP Set\n`
      msg += `  ${c.rr_above_3 ? '✅' : '❌'} R:R >= 1:3\n`
      msg += `  ${c.trend_aligned ? '✅' : '❌'} Trend Aligned\n`
      msg += `  ${c.no_fomo ? '✅' : '❌'} No FOMO\n`
      msg += `  ${c.rejection_confirmed ? '✅' : '❌'} Rejection Confirmed\n`
      if (c.entry_notes) msg += `\n📝 <b>Notes:</b> ${c.entry_notes}\n`
    }

    return msg
  }

  function formatTickerMessage(symbol: string, ticker: any): string {
    const changeEmoji = ticker.priceChangePct24h >= 0 ? '📈' : '📉'
    const sign = ticker.priceChangePct24h >= 0 ? '+' : ''

    return `${changeEmoji} <b>${symbol}</b>\n` +
      `Price: $${ticker.price.toLocaleString()}\n` +
      `24h: ${sign}${ticker.priceChangePct24h.toFixed(2)}%\n` +
      `High: $${ticker.high24h.toLocaleString()} | Low: $${ticker.low24h.toLocaleString()}\n` +
      `Volume: $${(ticker.volume24h / 1_000_000).toFixed(1)}M`
  }

  function formatMarketSummaryMessage(summary: any): string {
    const raw = summary.rawResponse || summary
    let msg = `📋 <b>MARKET SUMMARY</b>\n\n`
    msg += `Sentiment: <b>${(raw.overall_sentiment || summary.signal || 'hold').replace('_', ' ').toUpperCase()}</b>\n`
    msg += `Confidence: ${parseFloat(raw.confidence || summary.confidence || '0').toFixed(0)}%\n\n`
    msg += `${raw.summary || summary.summary || ''}\n`
    if (raw.top_pick) msg += `\n⭐ Top Pick: <b>${raw.top_pick}</b>`
    if (raw.market_phase) msg += `\nPhase: ${raw.market_phase}`
    return msg
  }

  // ─── High-Level Actions ───

  async function sendAnalysisAlert(symbol: string, analysis: any, chatId?: string) {
    const msg = formatAnalysisMessage(symbol, analysis)
    return sendMessage(msg, chatId)
  }

  async function sendTickerAlert(symbol: string, ticker: any, chatId?: string) {
    const msg = formatTickerMessage(symbol, ticker)
    return sendMessage(msg, chatId)
  }

  async function sendMarketSummary(summary: any, chatId?: string) {
    const msg = formatMarketSummaryMessage(summary)
    return sendMessage(msg, chatId)
  }

  // ─── Trade Confirmation ───

  async function sendTradeConfirmation(symbol: string, analysis: any, chatId?: string): Promise<any> {
    const targetChat = chatId || defaultChatId
    if (!botToken || !targetChat) return null

    const raw = analysis.raw_response || {}
    const signal = analysis.signal?.replace('_', ' ').toUpperCase() || 'UNKNOWN'
    const kl = raw.key_levels || {}

    let msg = `⚠️ <b>TRADE CONFIRMATION REQUIRED</b>\n\n`
    msg += `📊 <b>${symbol}</b> — ${signal}\n`
    msg += `Confidence: ${parseFloat(analysis.confidence || '0').toFixed(0)}%\n\n`

    if (kl.entry) msg += `Entry: $${parseFloat(kl.entry).toLocaleString()}\n`
    if (kl.stop_loss) msg += `🛑 SL: $${parseFloat(kl.stop_loss).toLocaleString()}\n`
    if (kl.take_profit) msg += `🎯 TP: $${parseFloat(kl.take_profit).toLocaleString()}\n`

    const entry = parseFloat(kl.entry || kl.support || 0)
    const sl = parseFloat(kl.stop_loss || 0)
    const tp = parseFloat(kl.take_profit || 0)
    if (entry && sl && tp) {
      const rr = Math.abs(tp - entry) / Math.abs(entry - sl)
      msg += `R:R = 1:${rr.toFixed(1)}\n`
      const riskAmt = 3 // $100 capital × 3%
      const slDist = Math.abs(entry - sl)
      if (slDist > 0) {
        const posSize = riskAmt / slDist
        msg += `Position: ${posSize.toFixed(4)} units ($3 risk)\n`
      }
    }

    if (raw.trade_checklist?.entry_notes) {
      msg += `\n📝 ${raw.trade_checklist.entry_notes}\n`
    }

    msg += `\n<b>Reply /confirm_${symbol} to approve this trade</b>`
    msg += `\n<b>Reply /reject_${symbol} to skip this trade</b>`

    // Save pending trade to DB
    const supabase = useDb()
    await supabase.from('alerts').insert({
      trading_pair_id: analysis.trading_pair_id,
      type: 'trade_confirmation',
      message: JSON.stringify({
        symbol,
        signal: analysis.signal,
        entry: kl.entry,
        stop_loss: kl.stop_loss,
        take_profit: kl.take_profit,
        analysis_id: analysis.id,
      }),
      is_triggered: false,
    })

    return sendMessage(msg, targetChat)
  }

  async function confirmTrade(symbol: string, chatId: string): Promise<any> {
    const supabase = useDb()

    // Find pending confirmation
    const { data: alert } = await supabase
      .from('alerts')
      .select('*')
      .eq('type', 'trade_confirmation')
      .eq('is_triggered', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!alert) {
      return sendMessage(`No pending trade for confirmation.`, chatId)
    }

    const trade = JSON.parse(alert.message || '{}')
    if (trade.symbol !== symbol) {
      return sendMessage(`No pending trade for ${symbol}.`, chatId)
    }

    // Mark as confirmed
    await supabase
      .from('alerts')
      .update({ is_triggered: true, triggered_at: new Date().toISOString() })
      .eq('id', alert.id)

    return sendMessage(
      `✅ <b>TRADE CONFIRMED</b>\n\n` +
      `${symbol} — ${trade.signal?.replace('_', ' ').toUpperCase()}\n` +
      `Entry: $${trade.entry}\n` +
      `SL: $${trade.stop_loss}\n` +
      `TP: $${trade.take_profit}\n\n` +
      `📝 Log this trade in your journal!`,
      chatId,
    )
  }

  async function rejectTrade(symbol: string, chatId: string): Promise<any> {
    const supabase = useDb()

    const { data: alert } = await supabase
      .from('alerts')
      .select('*')
      .eq('type', 'trade_confirmation')
      .eq('is_triggered', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!alert) {
      return sendMessage(`No pending trade to reject.`, chatId)
    }

    // Delete the pending alert
    await supabase.from('alerts').delete().eq('id', alert.id)

    return sendMessage(`❌ <b>TRADE REJECTED</b> — ${symbol}\nGood discipline! No FOMO.`, chatId)
  }

  return {
    sendMessage,
    getUpdates,
    getBotInfo,
    sendAnalysisAlert,
    sendTickerAlert,
    sendMarketSummary,
    sendTradeConfirmation,
    confirmTrade,
    rejectTrade,
    formatAnalysisMessage,
    formatTickerMessage,
    formatMarketSummaryMessage,
  }
}
