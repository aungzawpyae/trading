import { useAnalyzer } from '../../services/analyzer'
import { useTelegram } from '../../services/telegram'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const message = body?.message
  if (!message?.text) return { ok: true }

  const chatId = String(message.chat.id)
  const text = message.text.trim()
  const telegram = useTelegram()

  if (text.startsWith('/')) {
    const [command, ...args] = text.split(' ')

    // Handle /confirm_SYMBOL and /reject_SYMBOL
    if (command.startsWith('/confirm_')) {
      const symbol = command.replace('/confirm_', '').toUpperCase()
      await telegram.confirmTrade(symbol, chatId)
      return { ok: true }
    }

    if (command.startsWith('/reject_')) {
      const symbol = command.replace('/reject_', '').toUpperCase()
      await telegram.rejectTrade(symbol, chatId)
      return { ok: true }
    }

    switch (command) {
      case '/start':
        await telegram.sendMessage(
          '🤖 <b>Trading AI Bot</b>\n\n' +
          '<b>Commands:</b>\n' +
          '/price BTCUSDT — Get current price\n' +
          '/analyze BTCUSDT — Run AI analysis\n' +
          '/analyze BTCUSDT 4h — Analysis with timeframe\n' +
          '/account — Check balance & API permissions\n' +
          '/summary — Market summary\n' +
          '/pairs — List tracked pairs\n' +
          '/report — Full report for all pairs\n' +
          '/rules — Show trading rules\n' +
          '/chatid — Show your chat ID\n\n' +
          '<b>Trade Confirmation:</b>\n' +
          '/confirm_BTCUSDT — Approve pending trade\n' +
          '/reject_BTCUSDT — Reject pending trade\n\n' +
          '⚠️ AI will ask for confirmation before any trade signal is approved.',
          chatId,
        )
        break

      case '/chatid':
        await telegram.sendMessage(`Your Chat ID: <code>${chatId}</code>`, chatId)
        break

      case '/account':
      case '/balance': {
        try {
          const { useBinance } = await import('../../services/binance')
          const binance = useBinance()
          const account = await binance.getAccountInfo()
          const permissions = await binance.getApiKeyPermissions().catch(() => null)

          let totalUsdt = 0
          const balanceLines: string[] = []

          for (const bal of account.balances) {
            if (['USDT', 'BUSD', 'FDUSD'].includes(bal.asset)) {
              totalUsdt += bal.total
              balanceLines.push(`  ${bal.asset}: $${bal.total.toFixed(2)}`)
            } else if (bal.total > 0) {
              try {
                const ticker = await binance.getTicker(`${bal.asset}USDT`)
                const usdValue = bal.total * ticker.price
                totalUsdt += usdValue
                balanceLines.push(`  ${bal.asset}: ${bal.total.toFixed(6)} (~$${usdValue.toFixed(2)})`)
              } catch {
                balanceLines.push(`  ${bal.asset}: ${bal.total.toFixed(6)}`)
              }
            }
          }

          let msg = `💰 <b>Account Info</b>\n\n`
          msg += `Type: ${account.accountType}\n`
          msg += `Can Trade: ${account.canTrade ? '✅' : '❌'}\n\n`

          if (permissions) {
            msg += `<b>API Permissions:</b>\n`
            msg += `  Spot Trading: ${permissions.enableSpotAndMarginTrading ? '✅' : '❌'}\n`
            msg += `  Futures: ${permissions.enableFutures ? '✅' : '❌'}\n`
            msg += `  Reading: ${permissions.enableReading ? '✅' : '❌'}\n`
            msg += `  Withdrawals: ${permissions.enableWithdrawals ? '✅' : '❌'}\n\n`
          }

          msg += `<b>Balances:</b>\n`
          msg += balanceLines.length ? balanceLines.join('\n') : '  No balances'
          msg += `\n\n<b>Total: ~$${totalUsdt.toFixed(2)} USDT</b>`
          msg += `\n3% Risk = $${(totalUsdt * 0.03).toFixed(2)} per trade`

          await telegram.sendMessage(msg, chatId)
        } catch (err: any) {
          await telegram.sendMessage(`Account check failed: ${err.message}`, chatId)
        }
        break
      }

      case '/rules':
        await telegram.sendMessage(
          '📋 <b>TRADING RULES</b>\n\n' +
          '1. SL first, TP second, then Position Size\n' +
          '2. Write notes — WHY this entry?\n' +
          '3. NO FOMO — no emotion-based entries\n' +
          '4. Minimum 1:3 R:R ratio\n' +
          '5. Max 3% capital risk per trade ($3 on $100)\n' +
          '6. 3 consecutive losses → STOP & Reset\n\n' +
          '<b>Entry Checklist:</b>\n' +
          '• Where is the order flow?\n' +
          '• Where are sellers/buyers?\n' +
          '• Who is the loser? Beat the loser\n' +
          '• Wait for rejection — no entry while price is moving\n' +
          '• Check retracement type\n\n' +
          '<b>Remember:</b>\n' +
          '• The Trend is your best friend\n' +
          '• Upper wick big = sell pressure\n' +
          '• Lower wick big = buy support\n' +
          '• Giant volume candle = future S/R zone',
          chatId,
        )
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
          const supabase = useDb()
          const { data: pair } = await supabase
            .from('trading_pairs')
            .select('*')
            .eq('symbol', symbol)
            .single()

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
        const supabase = useDb()
        const { data: pairs } = await supabase
          .from('trading_pairs')
          .select('*')
          .eq('is_active', true)

        const list = (pairs || []).map((p: any) => `• ${p.symbol} (${p.base_asset}/${p.quote_asset})`).join('\n')
        await telegram.sendMessage(`📋 <b>Tracked Pairs</b>\n\n${list || 'No pairs found'}`, chatId)
        break
      }

      case '/report': {
        const { useBinance } = await import('../../services/binance')
        const binance = useBinance()
        const supabase = useDb()
        const { data: pairs } = await supabase
          .from('trading_pairs')
          .select('*')
          .eq('is_active', true)

        await telegram.sendMessage('⏳ Generating full report...', chatId)

        for (const pair of pairs || []) {
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
