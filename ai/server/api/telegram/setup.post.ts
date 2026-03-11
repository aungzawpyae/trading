import { useTelegram } from '../../services/telegram'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const config = useRuntimeConfig()

  const telegram = useTelegram()

  // Get bot info
  const botInfo = await telegram.getBotInfo()

  // Set webhook if URL provided
  if (body?.webhookUrl) {
    const webhookUrl = body.webhookUrl.replace(/\/$/, '') + '/api/telegram/webhook'
    const result = await (globalThis.$fetch as any)(`https://api.telegram.org/bot${config.telegramBotToken}/setWebhook`, {
      method: 'POST',
      body: { url: webhookUrl },
    })
    return { bot: botInfo?.result, webhook: result }
  }

  // Delete webhook (for polling mode)
  if (body?.deleteWebhook) {
    const result = await (globalThis.$fetch as any)(`https://api.telegram.org/bot${config.telegramBotToken}/deleteWebhook`, {
      method: 'POST',
    })
    return { bot: botInfo?.result, webhook: result }
  }

  // Just return bot info and updates
  const updates = await telegram.getUpdates()

  return {
    bot: botInfo?.result,
    updates: updates?.result?.slice(-5),
    hint: 'POST with { "webhookUrl": "https://your-domain.com" } to set webhook, or { "deleteWebhook": true } to remove it.',
  }
})
