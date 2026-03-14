export default defineNuxtConfig({
  future: { compatibilityVersion: 4 },
  compatibilityDate: '2025-05-01',
  devtools: { enabled: true },

  modules: ['@pinia/nuxt'],

  runtimeConfig: {
    binanceBaseUrl: process.env.BINANCE_BASE_URL || 'https://api.binance.com',
    binanceFuturesBaseUrl: process.env.BINANCE_FUTURES_BASE_URL || 'https://fapi.binance.com',
    binanceApiKey: process.env.BINANCE_API_KEY || '',
    binanceApiSecret: process.env.BINANCE_API_SECRET || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseKey: process.env.SUPABASE_KEY || '',
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    cronSecret: process.env.CRON_SECRET || '',
    public: {
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseKey: process.env.SUPABASE_KEY || '',
    },
  },

  css: ['~/assets/css/main.css'],

  postcss: {
    plugins: {
      '@tailwindcss/postcss': {},
    },
  },
})
