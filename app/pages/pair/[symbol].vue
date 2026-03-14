<script setup lang="ts">
const route = useRoute()
const symbol = (route.params.symbol as string).toUpperCase()
const trading = useTradingStore()
const selectedInterval = ref('1h')
const intervals = ['1m', '5m', '15m', '1h', '4h', '1d']

const { data, status, refresh } = await useFetch<any>(`/api/trading/pairs/${symbol}`)

async function handleAnalyze() {
  await trading.runAnalysis(symbol, selectedInterval.value)
  await refresh()
}

// ─── Manual Trade State ───
const tradeSide = ref<'BUY' | 'SELL'>('BUY')
const tradeLeverage = ref(10)
const tradeStopLoss = ref('')
const tradeTakeProfit = ref('')
const tradeRiskPercent = ref(3)
const tradeLoading = ref(false)
const tradeClosing = ref(false)
const tradeError = ref('')
const tradeSuccess = ref('')

// Position data (lazy, won't block page)
const positionData = ref<any>(null)
const positionLoading = ref(false)

async function loadPosition() {
  positionLoading.value = true
  try {
    positionData.value = await $fetch(`/api/trading/position/${symbol}`)
  } catch {
    positionData.value = null
  } finally {
    positionLoading.value = false
  }
}

// Load position on mount
onMounted(() => {
  loadPosition()
})

function fillFromAnalysis() {
  const levels = data.value?.latestAnalysis?.raw_response?.key_levels
  if (!levels) return
  if (levels.stop_loss) tradeStopLoss.value = String(levels.stop_loss)
  if (levels.take_profit) tradeTakeProfit.value = String(levels.take_profit)
  const signal = data.value?.latestAnalysis?.signal
  if (signal) {
    if (['strong_buy', 'buy'].includes(signal)) tradeSide.value = 'BUY'
    else if (['strong_sell', 'sell'].includes(signal)) tradeSide.value = 'SELL'
  }
}

const positionPreview = computed(() => {
  const sl = parseFloat(tradeStopLoss.value)
  const price = data.value?.ticker?.price
  if (!sl || !price) return null

  const balance = positionData.value?.account?.availableBalance || 0
  if (!balance) return null

  const riskAmount = balance * (tradeRiskPercent.value / 100)
  const slDistance = Math.abs(price - sl)
  if (slDistance === 0) return null

  const tp = parseFloat(tradeTakeProfit.value)
  const rr = tp ? Math.abs(tp - price) / slDistance : 0
  const quantity = (riskAmount * tradeLeverage.value) / slDistance

  return {
    quantity: quantity.toFixed(4),
    riskAmount: riskAmount.toFixed(2),
    slDistance: slDistance.toFixed(2),
    rr: rr.toFixed(1),
    potentialProfit: (riskAmount * rr).toFixed(2),
    notionalValue: (quantity * price).toFixed(2),
  }
})

async function placeTrade() {
  tradeError.value = ''
  tradeSuccess.value = ''

  if (!tradeStopLoss.value || !tradeTakeProfit.value) {
    tradeError.value = 'Stop Loss and Take Profit are required'
    return
  }

  tradeLoading.value = true
  try {
    const result = await $fetch<any>('/api/trading/manual-trade', {
      method: 'POST',
      body: {
        symbol,
        side: tradeSide.value,
        leverage: tradeLeverage.value,
        stopLoss: tradeStopLoss.value,
        takeProfit: tradeTakeProfit.value,
        riskPercent: tradeRiskPercent.value,
      },
    })
    tradeSuccess.value = `${tradeSide.value === 'BUY' ? 'LONG' : 'SHORT'} ${result.order.quantity} @ $${result.order.entryPrice.toLocaleString()}`
    tradeStopLoss.value = ''
    tradeTakeProfit.value = ''
    await loadPosition()
    await refresh()
  } catch (err: any) {
    tradeError.value = err.data?.message || err.message || 'Trade failed'
  } finally {
    tradeLoading.value = false
  }
}

async function closePosition() {
  tradeClosing.value = true
  tradeError.value = ''
  tradeSuccess.value = ''
  try {
    const result = await $fetch<any>('/api/trading/close-position', {
      method: 'POST',
      body: { symbol },
    })
    tradeSuccess.value = `Closed: $${result.pnl} (${result.pnlPercent}%) — ${result.result.toUpperCase()}`
    await loadPosition()
    await refresh()
  } catch (err: any) {
    tradeError.value = err.data?.message || err.message || 'Close failed'
  } finally {
    tradeClosing.value = false
  }
}
</script>

<template>
  <div>
    <NuxtLink to="/" class="text-emerald-400 hover:underline text-sm mb-4 inline-block">&larr; Back to Dashboard</NuxtLink>

    <div v-if="status === 'pending' && !data" class="text-center py-12 text-gray-400">Loading...</div>

    <div v-else-if="data">
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between mb-6 gap-4">
        <div>
          <h1 class="text-3xl font-bold">{{ data.pair?.base_asset }}/{{ data.pair?.quote_asset }}</h1>
          <div class="text-4xl font-mono mt-2">
            ${{ data.ticker?.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
          </div>
          <div class="mt-1">
            <span
              :class="(data.ticker?.priceChangePct24h ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'"
              class="text-lg font-medium"
            >
              {{ (data.ticker?.priceChangePct24h ?? 0) >= 0 ? '+' : '' }}{{ (data.ticker?.priceChangePct24h ?? 0).toFixed(2) }}%
            </span>
            <span class="text-gray-500 text-sm ml-2">24h</span>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <select v-model="selectedInterval" class="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
            <option v-for="int in intervals" :key="int" :value="int">{{ int }}</option>
          </select>
          <button
            class="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg transition disabled:opacity-50"
            :disabled="trading.analyzing[symbol]"
            @click="handleAnalyze"
          >
            {{ trading.analyzing[symbol] ? 'Analyzing...' : 'Run Analysis' }}
          </button>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div class="text-xs text-gray-400 mb-1">24h High</div>
          <div class="font-mono">${{ (data.ticker?.high24h ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</div>
        </div>
        <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div class="text-xs text-gray-400 mb-1">24h Low</div>
          <div class="font-mono">${{ (data.ticker?.low24h ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</div>
        </div>
        <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div class="text-xs text-gray-400 mb-1">24h Volume</div>
          <div class="font-mono">${{ ((data.ticker?.volume24h ?? 0) / 1_000_000).toFixed(1) }}M</div>
        </div>
        <div v-if="data.latestAnalysis" class="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div class="text-xs text-gray-400 mb-1">AI Signal</div>
          <div class="font-bold uppercase" :class="{
            'text-emerald-400': ['strong_buy', 'buy'].includes(data.latestAnalysis.signal),
            'text-yellow-400': data.latestAnalysis.signal === 'hold',
            'text-red-400': ['sell', 'strong_sell'].includes(data.latestAnalysis.signal),
          }">
            {{ data.latestAnalysis.signal.replace('_', ' ') }}
          </div>
          <div v-if="data.latestAnalysis.raw_response?.risk" class="text-xs mt-1" :class="{
            'text-emerald-500': data.latestAnalysis.raw_response.risk === 'low',
            'text-yellow-500': data.latestAnalysis.raw_response.risk === 'medium',
            'text-red-500': data.latestAnalysis.raw_response.risk === 'high',
          }">{{ data.latestAnalysis.raw_response.risk }} risk</div>
        </div>
      </div>

      <!-- Main Content: 2-column layout -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <!-- Left: Analysis (2 cols) -->
        <div class="lg:col-span-2 space-y-4">
          <!-- Quick Trade Info Bar -->
          <div v-if="data.latestAnalysis?.raw_response?.key_levels" class="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-wrap gap-6 items-center text-sm">
            <div v-if="data.latestAnalysis.raw_response.key_levels.entry">
              <span class="text-gray-500 text-xs">Entry</span>
              <div class="font-mono text-blue-400">${{ parseFloat(data.latestAnalysis.raw_response.key_levels.entry).toLocaleString() }}</div>
            </div>
            <div v-if="data.latestAnalysis.raw_response.key_levels.stop_loss">
              <span class="text-gray-500 text-xs">SL</span>
              <div class="font-mono text-red-400">${{ parseFloat(data.latestAnalysis.raw_response.key_levels.stop_loss).toLocaleString() }}</div>
            </div>
            <div v-if="data.latestAnalysis.raw_response.key_levels.take_profit">
              <span class="text-gray-500 text-xs">TP</span>
              <div class="font-mono text-emerald-400">${{ parseFloat(data.latestAnalysis.raw_response.key_levels.take_profit).toLocaleString() }}</div>
            </div>
            <div v-if="data.latestAnalysis.raw_response?.trend">
              <span class="text-gray-500 text-xs">Trend</span>
              <div class="capitalize">{{ data.latestAnalysis.raw_response.trend }}</div>
            </div>
            <div v-if="data.latestAnalysis.raw_response?.retracement_type && data.latestAnalysis.raw_response.retracement_type !== 'none'">
              <span class="text-gray-500 text-xs">Retracement</span>
              <div class="capitalize">{{ data.latestAnalysis.raw_response.retracement_type.replace('_', ' ') }}</div>
            </div>
          </div>

          <!-- Full Analysis Detail -->
          <div v-if="data.latestAnalysis" class="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <h2 class="text-lg font-bold mb-4">AI Analysis</h2>
            <AnalysisPanel :analysis="{
              signal: data.latestAnalysis.signal,
              confidence: data.latestAnalysis.confidence ?? 0,
              summary: data.latestAnalysis.summary,
              rawResponse: data.latestAnalysis.raw_response,
              createdAt: data.latestAnalysis.created_at,
            }" />
          </div>

          <!-- Indicators (collapsible) -->
          <details v-if="data.latestAnalysis?.indicators">
            <summary class="text-sm text-gray-500 cursor-pointer hover:text-gray-300">Technical Indicators</summary>
            <div class="mt-2 bg-gray-800 rounded-lg border border-gray-700 p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <template v-for="(value, key) in data.latestAnalysis.indicators" :key="key">
                <div v-if="typeof value !== 'object' || value === null" class="text-xs">
                  <span class="text-gray-500">{{ String(key).replace(/_/g, ' ').toUpperCase() }}</span>
                  <div class="text-gray-300 font-mono">{{ value ?? '-' }}</div>
                </div>
                <div v-else class="text-xs bg-gray-900 rounded p-2">
                  <span class="text-gray-500 font-bold block mb-1">{{ String(key).replace(/_/g, ' ').toUpperCase() }}</span>
                  <div v-for="(subVal, subKey) in value" :key="subKey" class="flex justify-between gap-2">
                    <span class="text-gray-500 truncate">{{ String(subKey).replace(/_/g, ' ') }}</span>
                    <span class="text-gray-300 font-mono text-right">{{ typeof subVal === 'number' ? subVal.toLocaleString(undefined, { maximumFractionDigits: 2 }) : subVal }}</span>
                  </div>
                </div>
              </template>
            </div>
          </details>

          <div v-if="!data.latestAnalysis" class="bg-gray-800 rounded-lg border border-gray-700 p-6 text-center text-gray-400">
            No analysis yet. Click "Run Analysis" to get AI insights.
          </div>
        </div>

        <!-- Right: Trading Panel -->
        <div class="space-y-4">
          <h2 class="text-lg font-bold">Trade</h2>

          <!-- Account Info -->
          <div v-if="positionData?.account" class="flex flex-wrap gap-3 text-sm">
            <div>
              <span class="text-gray-500">Balance:</span>
              <span class="ml-1 font-mono">${{ positionData.account.totalWalletBalance.toFixed(2) }}</span>
            </div>
            <div>
              <span class="text-gray-500">Available:</span>
              <span class="ml-1 font-mono">${{ positionData.account.availableBalance.toFixed(2) }}</span>
            </div>
          </div>

          <!-- Current Position -->
          <div v-if="positionData?.position" class="bg-gray-900 rounded-lg border p-4" :class="positionData.position.unrealizedProfit >= 0 ? 'border-emerald-700' : 'border-red-700'">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-bold flex items-center gap-2">
                <span :class="positionData.position.positionAmt > 0 ? 'text-emerald-400' : 'text-red-400'">
                  {{ positionData.position.positionAmt > 0 ? 'LONG' : 'SHORT' }}
                </span>
                <span class="text-gray-400 text-sm">{{ positionData.position.leverage }}x</span>
              </h3>
              <button
                class="bg-red-600 hover:bg-red-500 text-white px-4 py-1.5 rounded text-sm transition disabled:opacity-50"
                :disabled="tradeClosing"
                @click="closePosition"
              >
                {{ tradeClosing ? 'Closing...' : 'Close Position' }}
              </button>
            </div>
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div class="text-gray-500 text-xs">Size</div>
                <div class="font-mono">{{ Math.abs(positionData.position.positionAmt) }}</div>
              </div>
              <div>
                <div class="text-gray-500 text-xs">Entry</div>
                <div class="font-mono">${{ positionData.position.entryPrice.toLocaleString() }}</div>
              </div>
              <div>
                <div class="text-gray-500 text-xs">Mark</div>
                <div class="font-mono">${{ positionData.position.markPrice.toLocaleString() }}</div>
              </div>
              <div>
                <div class="text-gray-500 text-xs">PnL</div>
                <div class="font-mono font-bold" :class="positionData.position.unrealizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'">
                  ${{ positionData.position.unrealizedProfit.toFixed(2) }}
                </div>
              </div>
            </div>
          </div>

          <!-- Trade Form -->
          <div v-if="!positionData?.position" class="bg-gray-900 rounded-lg border border-gray-700 p-4">
            <!-- Fill from AI -->
            <div v-if="data.latestAnalysis?.raw_response?.key_levels" class="mb-4">
              <button class="text-xs text-blue-400 hover:text-blue-300" @click="fillFromAnalysis">
                Fill from AI Analysis
              </button>
            </div>

            <!-- LONG / SHORT -->
            <div class="grid grid-cols-2 gap-2 mb-4">
              <button
                class="py-3 rounded-lg font-bold text-sm transition"
                :class="tradeSide === 'BUY' ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'"
                @click="tradeSide = 'BUY'"
              >
                LONG
              </button>
              <button
                class="py-3 rounded-lg font-bold text-sm transition"
                :class="tradeSide === 'SELL' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'"
                @click="tradeSide = 'SELL'"
              >
                SHORT
              </button>
            </div>

            <!-- Leverage -->
            <div class="mb-3">
              <label class="text-xs text-gray-400 block mb-1">Leverage</label>
              <div class="flex gap-1">
                <button
                  v-for="lev in [5, 10, 15, 20, 25]"
                  :key="lev"
                  class="flex-1 py-2 rounded text-sm transition"
                  :class="tradeLeverage === lev ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'"
                  @click="tradeLeverage = lev"
                >
                  {{ lev }}x
                </button>
              </div>
            </div>

            <!-- SL / TP -->
            <div class="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label class="text-xs text-red-400 block mb-1">Stop Loss ($)</label>
                <input
                  v-model="tradeStopLoss"
                  type="number"
                  step="any"
                  placeholder="SL price"
                  class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm font-mono focus:border-red-500 focus:outline-none"
                />
              </div>
              <div>
                <label class="text-xs text-emerald-400 block mb-1">Take Profit ($)</label>
                <input
                  v-model="tradeTakeProfit"
                  type="number"
                  step="any"
                  placeholder="TP price"
                  class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm font-mono focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <!-- Risk % -->
            <div class="mb-4">
              <label class="text-xs text-gray-400 block mb-1">Risk %</label>
              <div class="flex gap-1">
                <button
                  v-for="r in [1, 2, 3, 5]"
                  :key="r"
                  class="flex-1 py-2 rounded text-sm transition"
                  :class="tradeRiskPercent === r ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'"
                  @click="tradeRiskPercent = r"
                >
                  {{ r }}%
                </button>
              </div>
            </div>

            <!-- Preview -->
            <div v-if="positionPreview" class="bg-gray-800 rounded p-3 mb-4 text-xs space-y-1">
              <div class="flex justify-between">
                <span class="text-gray-500">Size</span>
                <span class="font-mono">{{ positionPreview.quantity }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">Notional</span>
                <span class="font-mono">${{ positionPreview.notionalValue }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">Risk</span>
                <span class="font-mono text-yellow-400">${{ positionPreview.riskAmount }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">R:R</span>
                <span class="font-mono" :class="parseFloat(positionPreview.rr) >= 3 ? 'text-emerald-400' : 'text-yellow-400'">1:{{ positionPreview.rr }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-500">Profit</span>
                <span class="font-mono text-emerald-400">${{ positionPreview.potentialProfit }}</span>
              </div>
            </div>

            <!-- R:R Warning -->
            <div v-if="positionPreview && parseFloat(positionPreview.rr) < 3" class="bg-yellow-900/30 border border-yellow-700 rounded p-2 mb-4 text-xs text-yellow-400">
              R:R below 1:3
            </div>

            <!-- Execute Button -->
            <button
              class="w-full py-3 rounded-lg font-bold transition disabled:opacity-50"
              :class="tradeSide === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'"
              :disabled="tradeLoading || !tradeStopLoss || !tradeTakeProfit"
              @click="placeTrade"
            >
              {{ tradeLoading ? 'Placing...' : `${tradeSide === 'BUY' ? 'LONG' : 'SHORT'} ${symbol}` }}
            </button>
          </div>

          <!-- Messages -->
          <div v-if="tradeError" class="bg-red-900/30 border border-red-700 rounded p-3 text-sm text-red-400">
            {{ tradeError }}
          </div>
          <div v-if="tradeSuccess" class="bg-emerald-900/30 border border-emerald-700 rounded p-3 text-sm text-emerald-400">
            {{ tradeSuccess }}
          </div>

          <!-- Loading state -->
          <div v-if="positionLoading" class="text-center text-gray-500 text-sm py-4">
            Loading position...
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
