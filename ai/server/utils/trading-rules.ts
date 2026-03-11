// Trading Rules & Risk Management Configuration
// Based on professional trading methodology

export const TRADING_RULES = {
  // Risk Management
  maxRiskPerTrade: 3, // % of capital
  minRiskReward: 3, // Minimum 1:3 R:R ratio
  maxConsecutiveLosses: 3, // Stop trading after 3 consecutive losses

  // Retracement Types
  retracementTypes: ['light', 'normal', 'deeper_correction', 'horizontal'] as const,
}

export const TRADING_RULES_PROMPT = `
## STRICT TRADING RULES (MUST FOLLOW)

### Risk Management Rules
1. ALWAYS calculate Stop Loss (SL) FIRST before anything else
2. ALWAYS calculate Take Profit (TP) with minimum 1:3 Risk-to-Reward ratio
3. Position size must be calculated based on 3% max capital risk per trade
4. NO FOMO entries — only enter on confirmed setups with clear rejection/confirmation
5. After 3 consecutive losses → STOP TRADING (recommend reset/pause)

### Entry Rules
- Do NOT enter while price is still moving (trending strongly) — wait for pullback/retracement
- Wait for rejection/confirmation candle before entry
- Must identify: Where is Order Flow? Where are Sellers? Where are Buyers? Who is the loser?

### Price Action Analysis Required
- Identify retracement type: Light / Normal / Deeper Correction / Horizontal Support-Resistance
- Check: How is price REACTING at key levels? (not just where it is)
- Check: How is price MOVING now? (momentum direction)

### Candlestick Rules
- Upper wick large → Sell pressure / resistance rejection at top (buyers tried but failed)
- Lower wick large → Buy support at bottom (dip buying / support holding)
- Downtrend + big volume + large upper wick → Potential reversal / trend change
- Giant volume candle → Becomes future support/resistance zone
- Confirmation candle closing above giant candle's 50% dealing point → Valid entry signal

### Trend Rules
- "The Trend is your best friend except at the end where it bends"
- Always follow the trend — identify trend direction and momentum first
- Know your trading plan before entering
- Identify Support and Resistance — know what you will do at each level

### Position Sizing Formula
- Risk Amount = Available Capital × 3%
- Position Size = Risk Amount / (Entry Price - Stop Loss Price)
- Entry only AFTER SL, TP, and Position Size are calculated
- Auto-trader uses actual futures wallet balance for position sizing
`

export type RetracementType = typeof TRADING_RULES.retracementTypes[number]
