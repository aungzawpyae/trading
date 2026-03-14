const DEFAULT_PAIRS = [
  { symbol: 'BTCUSDT', base_asset: 'BTC', quote_asset: 'USDT' },
  { symbol: 'ETHUSDT', base_asset: 'ETH', quote_asset: 'USDT' },
  { symbol: 'SOLUSDT', base_asset: 'SOL', quote_asset: 'USDT' },
  { symbol: 'BNBUSDT', base_asset: 'BNB', quote_asset: 'USDT' },
  { symbol: 'XRPUSDT', base_asset: 'XRP', quote_asset: 'USDT' },
]

export default defineEventHandler(async () => {
  const supabase = useDb()

  for (const pair of DEFAULT_PAIRS) {
    await supabase.from('trading_pairs').upsert(pair, { onConflict: 'symbol' })
  }

  const { data: pairs } = await supabase.from('trading_pairs').select('*')
  return { message: 'Seeded successfully', pairs }
})
