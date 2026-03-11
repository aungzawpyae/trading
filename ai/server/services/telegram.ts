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
    const raw = analysis.rawResponse || {}

    let msg = `${emoji} <b>${symbol}</b> — <b>${analysis.signal.replace('_', ' ').toUpperCase()}</b>\n`
    msg += `Confidence: ${confidence}%\n`
    msg += `\n${analysis.summary}\n`

    if (raw.key_levels) {
      msg += `\n📊 <b>Key Levels</b>\n`
      if (raw.key_levels.support) msg += `  Support: $${parseFloat(raw.key_levels.support).toLocaleString()}\n`
      if (raw.key_levels.resistance) msg += `  Resistance: $${parseFloat(raw.key_levels.resistance).toLocaleString()}\n`
      if (raw.key_levels.stop_loss) msg += `  Stop Loss: $${parseFloat(raw.key_levels.stop_loss).toLocaleString()}\n`
      if (raw.key_levels.take_profit) msg += `  Take Profit: $${parseFloat(raw.key_levels.take_profit).toLocaleString()}\n`
    }

    if (raw.trend) msg += `\nTrend: ${raw.trend}`
    if (raw.risk) msg += ` | Risk: ${raw.risk}`

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

  return {
    sendMessage,
    getUpdates,
    getBotInfo,
    sendAnalysisAlert,
    sendTickerAlert,
    sendMarketSummary,
    formatAnalysisMessage,
    formatTickerMessage,
    formatMarketSummaryMessage,
  }
}
