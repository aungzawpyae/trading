import { eq } from 'drizzle-orm'
import { tradingPairs } from '../../database/schema'
import { useAnalyzer } from '../../services/analyzer'
import { useTelegram } from '../../services/telegram'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const message = body?.message
  if (!message?.text) return { ok: true }

  const chatId = String(message.chat.id)
  const text = message.text.trim()
  const telegram = useTelegram()

  // Command handler
  if (text.startsWith('/')) {
    const [command, ...args] = text.split(' ')

    switch (command) {
      case '/start':
        await telegram.sendMessage(
          '🤖 <b>Trading AI Bot</b>\n\n' +
          'Commands:\n' +
          '/price BTCUSDT — Get current price\n' +
          '/analyze BTCUSDT — Run AI analysis\n' +
          '/summary — Market summary\n' +
          '/pairs — List tracked pairs\n' +
          '/report — Full report for all pairs\n' +
          '/chatid — Show your chat ID',
          chatId,
        )
        break

      case '/chatid':
        await telegram.sendMessage(`Your Chat ID: <code>${chatId}</code>`, chatId)
        break

      case '/price': {
        const symbol = (args[0] || 'BTCUSDT').toUpperCase()
        try {
          const { useBinance } = await import('../../services/binance')
          const binance = useBinance()
          const ticker = await binance.getTicker(symbol)
          await telegram.sendTickerAlert(symbol, ticker, chatId)
        } catch {
          await telegram.sendMessage(`Could not fetch price for ${symbol}`, chatId)
        }
        break
      }

      case '/analyze': {
        const symbol = (args[0] || 'BTCUSDT').toUpperCase()
        const interval = args[1] || '1h'
        try {
          const db = useDb()
          const [pair] = await db.select().from(tradingPairs).where(eq(tradingPairs.symbol, symbol)).limit(1)
          if (!pair) {
            await telegram.sendMessage(`Trading pair ${symbol} not found`, chatId)
            break
          }
          await telegram.sendMessage(`⏳ Analyzing ${symbol} (${interval})...`, chatId)
          const analyzer = useAnalyzer()
          const analysis = await analyzer.analyzePair(pair.id, pair.symbol, interval)
          await telegram.sendAnalysisAlert(symbol, analysis, chatId)
        } catch (err: any) {
          await telegram.sendMessage(`Analysis failed: ${err.message}`, chatId)
        }
        break
      }

      case '/summary': {
        try {
          await telegram.sendMessage('⏳ Generating market summary...', chatId)
          const analyzer = useAnalyzer()
          const summary = await analyzer.generateMarketSummary()
          await telegram.sendMarketSummary(summary, chatId)
        } catch (err: any) {
          await telegram.sendMessage(`Summary failed: ${err.message}`, chatId)
        }
        break
      }

      case '/pairs': {
        const db = useDb()
        const pairs = await db.select().from(tradingPairs).where(eq(tradingPairs.isActive, true))
        const list = pairs.map((p) => `• ${p.symbol} (${p.baseAsset}/${p.quoteAsset})`).join('\n')
        await telegram.sendMessage(`📋 <b>Tracked Pairs</b>\n\n${list}`, chatId)
        break
      }

      case '/report': {
        const { useBinance } = await import('../../services/binance')
        const binance = useBinance()
        const db = useDb()
        const pairs = await db.select().from(tradingPairs).where(eq(tradingPairs.isActive, true))

        await telegram.sendMessage('⏳ Generating full report...', chatId)

        for (const pair of pairs) {
          try {
            const ticker = await binance.getTicker(pair.symbol)
            await telegram.sendTickerAlert(pair.symbol, ticker, chatId)
          } catch {}
        }
        break
      }

      default:
        await telegram.sendMessage('Unknown command. Use /start to see available commands.', chatId)
    }
  }

  return { ok: true }
})
