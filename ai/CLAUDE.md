# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nuxt 4 fullstack crypto trading analysis system. Binance API (market data) + Google Gemini AI (analysis) + Telegram bot (alerts). PostgreSQL via Supabase, Drizzle ORM, Pinia state management, Tailwind CSS.

## Common Commands

- **Dev server**: `npm run dev`
- **Build**: `npm run build`
- **Type check**: `npx nuxi typecheck`
- **DB migrations**: `npm run db:generate && npm run db:migrate`
- **DB studio**: `npm run db:studio`

## Architecture

Nuxt 4 (`future.compatibilityVersion: 4`) with `app/` directory for frontend, `server/` for backend.

### Server (Nitro)
- `server/database/schema.ts` — Drizzle ORM schema (PostgreSQL, UUID primary keys): tradingPairs, klines, tickers, analyses, alerts
- `server/utils/db.ts` — Database singleton via `useDb()`
- `server/utils/types.ts` — Shared types, enums (Signal, Interval, RiskLevel, Trend), DTOs (TickerData, KlineData, IndicatorResult, AnalysisResult)
- `server/services/binance.ts` — Binance REST API with in-memory cache (5-60s TTL)
- `server/services/gemini.ts` — Gemini AI API (JSON response mode, temperature 0.3)
- `server/services/indicators.ts` — Technical indicators: RSI, SMA, EMA, MACD, Bollinger Bands, ATR, Volume Profile, Support/Resistance
- `server/services/analyzer.ts` — Core brain: fetch data → calculate indicators → prompt Gemini → persist to DB → auto-notify Telegram
- `server/services/telegram.ts` — Telegram Bot API: send alerts, formatted messages, webhook handler

### Frontend (Vue 3)
- `app/stores/trading.ts` — Pinia store for dashboard state
- `app/pages/index.vue` — Dashboard with price cards + analysis panels
- `app/pages/pair/[symbol].vue` — Pair detail page
- `app/components/` — PriceCard, AnalysisPanel

## Key Data Flow

1. `useBinance()` fetches market data from Binance (cached in-memory)
2. `calculateIndicators()` computes 10 technical indicators from kline closes
3. `useAnalyzer().analyzePair()` builds prompt → calls Gemini → parses JSON → saves to PostgreSQL → sends Telegram alert
4. Frontend fetches via `/api/trading/dashboard` and displays with Pinia store

## API Routes

### Trading (`/api/trading/`)
- `GET /pairs` — list active pairs
- `GET /pairs/:symbol` — pair detail with ticker + klines + latest analysis
- `POST /pairs/:symbol/analyze` — trigger AI analysis
- `GET /pairs/:symbol/analysis` — latest analysis
- `GET /dashboard` — all pairs with prices + signals
- `POST /market-summary` — generate AI market summary
- `POST /seed` — seed default trading pairs

### Telegram (`/api/telegram/`)
- `POST /setup` — get bot info, set/delete webhook
- `POST /webhook` — incoming Telegram messages (commands: /price, /analyze, /summary, /pairs, /report)
- `POST /send-analysis` — send latest analysis to channel
- `POST /send-summary` — send market summary to channel
- `POST /send-all` — full report for all pairs

## Environment Variables

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `DATABASE_URL`, `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

## Database

PostgreSQL via Supabase. Schema managed by Drizzle ORM with UUID primary keys. Config in `drizzle.config.ts`.

## Notes

- Server-side `$fetch` uses `(globalThis.$fetch as any)` to avoid Nuxt typed route inference causing TS depth errors
- Server file imports use relative paths (not `~/server/`)
- Telegram bot auto-sends analysis results after each `analyzePair()` and `generateMarketSummary()` call
