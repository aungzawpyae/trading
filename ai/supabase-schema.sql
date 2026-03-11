-- Run this in Supabase SQL Editor to create all tables
-- https://supabase.com/dashboard → SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trading Pairs
CREATE TABLE trading_pairs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol VARCHAR(20) NOT NULL UNIQUE,
  base_asset VARCHAR(10) NOT NULL,
  quote_asset VARCHAR(10) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Klines (candlestick data)
CREATE TABLE klines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trading_pair_id UUID NOT NULL REFERENCES trading_pairs(id) ON DELETE CASCADE,
  interval VARCHAR(5) NOT NULL,
  open_time TIMESTAMPTZ NOT NULL,
  open DECIMAL(18,8) NOT NULL,
  high DECIMAL(18,8) NOT NULL,
  low DECIMAL(18,8) NOT NULL,
  close DECIMAL(18,8) NOT NULL,
  volume DECIMAL(24,8) NOT NULL,
  close_time TIMESTAMPTZ NOT NULL,
  quote_volume DECIMAL(24,8) NOT NULL,
  trades_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX klines_pair_interval_time ON klines(trading_pair_id, interval, open_time);
CREATE INDEX klines_pair_interval_close ON klines(trading_pair_id, interval, close_time);

-- Tickers (price snapshots)
CREATE TABLE tickers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trading_pair_id UUID NOT NULL REFERENCES trading_pairs(id) ON DELETE CASCADE,
  price DECIMAL(18,8) NOT NULL,
  price_change_24h DECIMAL(18,8) DEFAULT 0,
  price_change_pct_24h DECIMAL(8,4) DEFAULT 0,
  high_24h DECIMAL(18,8) DEFAULT 0,
  low_24h DECIMAL(18,8) DEFAULT 0,
  volume_24h DECIMAL(24,8) DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tickers_pair_recorded ON tickers(trading_pair_id, recorded_at);

-- AI Analyses
CREATE TABLE analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trading_pair_id UUID NOT NULL REFERENCES trading_pairs(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
  interval VARCHAR(5),
  signal VARCHAR(15) NOT NULL,
  confidence DECIMAL(5,2) DEFAULT 0,
  summary TEXT NOT NULL,
  raw_response JSONB,
  indicators JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX analyses_pair_type_created ON analyses(trading_pair_id, type, created_at);

-- Alerts
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trading_pair_id UUID NOT NULL REFERENCES trading_pairs(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  condition_value DECIMAL(18,8),
  is_triggered BOOLEAN NOT NULL DEFAULT false,
  triggered_at TIMESTAMPTZ,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security (optional, disable if using service key)
-- ALTER TABLE trading_pairs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE klines ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tickers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
