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
          '<b>Analysis:</b>\n' +
          '/price BTCUSDT — Current price\n' +
          '/analyze BTCUSDT — AI analysis\n' +
          '/analyze BTCUSDT 4h — With timeframe\n' +
          '/summary — Market summary\n\n' +
          '<b>Auto Trading:</b>\n' +
          '/trade BTCUSDT — Auto analyze + execute trade\n' +
          '/trade BTCUSDT 4h — With timeframe\n' +
          '/trade_all — Scan & trade all pairs\n' +
          '/positions — View open futures positions\n' +
          '/close BTCUSDT — Close position\n\n' +
          '<b>Account:</b>\n' +
          '/account — Balance & positions\n' +
          '/pairs — Tracked pairs\n' +
          '/report — Full report\n' +
          '/rules — Trading rules\n' +
          '/reset_trading — Reset loss counter\n' +
          '/chatid — Your chat ID\n\n' +
          '⚠️ Auto-trade enforces: SL/TP, 1:3 R:R, 3% risk, no FOMO',
          chatId,
        )
        break

      case '/chatid':
        await telegram.sendMessage(`Your Chat ID: <code>${chatId}</code>`, chatId)
        break

      // ─── Auto Trade Commands ───

      case '/trade': {
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

          await telegram.sendMessage(`🤖 <b>Auto-Trade:</b> Analyzing ${symbol} (${interval})...`, chatId)
          const { useAutoTrader } = await import('../../services/auto-trader')
          const autoTrader = useAutoTrader()
          const result = await autoTrader.autoAnalyzeAndTrade(pair.id, pair.symbol, interval)

          if (result.skipped) {
            await telegram.sendMessage(`⏭️ ${symbol} skipped: ${result.reason}`, chatId)
          }
        } catch (err: any) {
          await telegram.sendMessage(`Auto-trade failed: ${err.message}`, chatId)
        }
        break
      }

      case '/trade_all': {
        const interval = args[0] || '1h'
        try {
          const { useAutoTrader } = await import('../../services/auto-trader')
          const autoTrader = useAutoTrader()
          await autoTrader.autoTradeAllPairs(interval)
        } catch (err: any) {
          await telegram.sendMessage(`Auto-trade scan failed: ${err.message}`, chatId)
        }
        break
      }

      case '/positions': {
        try {
          const { useBinance } = await import('../../services/binance')
          const binance = useBinance()
          const positions = await binance.getFuturesPositions()

          if (positions.length === 0) {
            await telegram.sendMessage('📭 No open futures positions.', chatId)
            break
          }

          let msg = `📊 <b>Open Positions</b>\n${'─'.repeat(25)}\n\n`
          for (const pos of positions) {
            const side = pos.positionAmt > 0 ? '📈 LONG' : '📉 SHORT'
            const pnlEmoji = pos.unrealizedProfit >= 0 ? '🟢' : '🔴'
            msg += `<b>${pos.symbol}</b> ${side} ${pos.leverage}x\n`
            msg += `  Size: ${Math.abs(pos.positionAmt)}\n`
            msg += `  Entry: $${pos.entryPrice}\n`
            msg += `  Mark: $${pos.markPrice}\n`
            msg += `  ${pnlEmoji} PnL: $${pos.unrealizedProfit.toFixed(2)}\n`
            if (pos.liquidationPrice > 0) {
              msg += `  Liq: $${pos.liquidationPrice}\n`
            }
            msg += `\n`
          }
          await telegram.sendMessage(msg, chatId)
        } catch (err: any) {
          await telegram.sendMessage(`Positions check failed: ${err.message}`, chatId)
        }
        break
      }

      case '/close': {
        const symbol = (args[0] || '').toUpperCase()
        if (!symbol) {
          await telegram.sendMessage('Usage: /close BTCUSDT', chatId)
          break
        }
        try {
          const { useBinance } = await import('../../services/binance')
          const binance = useBinance()
          const positions = await binance.getFuturesPositions()
          const pos = positions.find((p) => p.symbol === symbol)

          if (!pos) {
            await telegram.sendMessage(`No open position for ${symbol}`, chatId)
            break
          }

          // Close by placing opposite market order
          const closeSide = pos.positionAmt > 0 ? 'SELL' : 'BUY'
          const qty = Math.abs(pos.positionAmt)

          // Cancel existing SL/TP orders
          await binance.futuresCancelAllOrders(symbol).catch(() => {})

          // Close position
          const order = await binance.futuresMarketOrder(symbol, closeSide as 'BUY' | 'SELL', qty)

          const pnlEmoji = pos.unrealizedProfit >= 0 ? '🟢' : '🔴'
          await telegram.sendMessage(
            `${pnlEmoji} <b>Position Closed</b>\n\n` +
            `${symbol} ${pos.positionAmt > 0 ? 'LONG' : 'SHORT'}\n` +
            `Entry: $${pos.entryPrice}\n` +
            `Exit: $${pos.markPrice}\n` +
            `PnL: $${pos.unrealizedProfit.toFixed(2)}\n` +
            `Order: ${order.orderId}`,
            chatId,
          )
        } catch (err: any) {
          await telegram.sendMessage(`Close failed: ${err.message}`, chatId)
        }
        break
      }

      case '/reset_trading': {
        const supabase = useDb()
        // Clear recent loss records
        await supabase
          .from('alerts')
          .delete()
          .eq('type', 'trade_executed')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

        await telegram.sendMessage('✅ <b>Trading Reset</b>\n\nLoss counter cleared. Auto-trading re-enabled.', chatId)
        break
      }

      // ─── Info Commands ───

      case '/account':
      case '/balance': {
        try {
          const { useBinance } = await import('../../services/binance')
          const binance = useBinance()

          const [spotAccount, futuresAccount] = await Promise.all([
            binance.getAccountInfo().catch(() => null),
            binance.getFuturesAccount().catch(() => null),
          ])

          let msg = `💰 <b>Account Info (Demo)</b>\n`
          msg += `${'─'.repeat(25)}\n\n`

          let spotTotal = 0
          if (spotAccount) {
            msg += `📊 <b>SPOT</b>\n`
            for (const bal of spotAccount.balances) {
              if (['USDT', 'BUSD', 'FDUSD'].includes(bal.asset)) {
                spotTotal += bal.total
                msg += `  ${bal.asset}: $${bal.total.toFixed(2)}\n`
              } else if (bal.total > 0) {
                try {
                  const ticker = await binance.getTicker(`${bal.asset}USDT`)
                  const usdVal = bal.total * ticker.price
                  spotTotal += usdVal
                  msg += `  ${bal.asset}: ${bal.total.toFixed(6)} (~$${usdVal.toFixed(2)})\n`
                } catch {
                  msg += `  ${bal.asset}: ${bal.total.toFixed(6)}\n`
                }
              }
            }
            msg += `  <b>Spot Total: ~$${spotTotal.toFixed(2)}</b>\n\n`
          }

          if (futuresAccount) {
            msg += `📈 <b>FUTURES</b>\n`
            msg += `  Wallet: $${futuresAccount.totalWalletBalance.toFixed(2)}\n`
            msg += `  Available: $${futuresAccount.availableBalance.toFixed(2)}\n`
            msg += `  Unrealized PnL: $${futuresAccount.totalUnrealizedProfit.toFixed(2)}\n`

            if (futuresAccount.positions.length > 0) {
              msg += `\n  <b>Open Positions:</b>\n`
              for (const pos of futuresAccount.positions) {
                const side = pos.positionAmt > 0 ? 'LONG' : 'SHORT'
                const pnlEmoji = pos.unrealizedProfit >= 0 ? '🟢' : '🔴'
                msg += `  ${pnlEmoji} ${pos.symbol} ${side} ${pos.leverage}x\n`
                msg += `    Entry: $${pos.entryPrice} | Mark: $${pos.markPrice}\n`
                msg += `    PnL: $${pos.unrealizedProfit.toFixed(2)}\n`
              }
            }
            msg += `  <b>Futures Total: $${futuresAccount.totalWalletBalance.toFixed(2)}</b>\n\n`
          }

          const combined = spotTotal + (futuresAccount?.totalWalletBalance || 0)
          msg += `${'─'.repeat(25)}\n`
          msg += `💎 <b>Total: ~$${combined.toFixed(2)} USDT</b>\n`
          msg += `⚠️ <b>3% Risk = $${(combined * 0.03).toFixed(2)} per trade</b>`

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
          '5. Max 3% capital risk per trade\n' +
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
