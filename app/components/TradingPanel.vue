<script setup lang="ts">
const props = defineProps<{
  symbol: string
  currentPrice: number
  analysisLevels?: {
    entry?: number
    stop_loss?: number
    take_profit?: number
  } | null
  analysisSignal?: string | null
}>()

const emit = defineEmits<{
  traded: []
}>()

// Trade form
const side = ref<'BUY' | 'SELL'>('BUY')
const leverage = ref(10)
const stopLoss = ref('')
const takeProfit = ref('')
const riskPercent = ref(3)

// State
const loading = ref(false)
const closing = ref(false)
const error = ref('')
const success = ref('')

// Position data
const { data: posData, refresh: refreshPosition } = await useFetch<any>(
  `/api/trading/position/${props.symbol}`,
)

// Auto-fill from AI analysis
function fillFromAnalysis() {
  if (!props.analysisLevels) return
  if (props.analysisLevels.stop_loss) stopLoss.value = String(props.analysisLevels.stop_loss)
  if (props.analysisLevels.take_profit) takeProfit.value = String(props.analysisLevels.take_profit)

  // Set side based on signal
  if (props.analysisSignal) {
    if (['strong_buy', 'buy'].includes(props.analysisSignal)) side.value = 'BUY'
    else if (['strong_sell', 'sell'].includes(props.analysisSignal)) side.value = 'SELL'
  }
}

// Calculate position size preview
const positionPreview = computed(() => {
  const sl = parseFloat(stopLoss.value)
  if (!sl || !props.currentPrice || !posData.value?.account) return null

  const balance = posData.value.account.availableBalance
  const riskAmount = balance * (riskPercent.value / 100)
  const slDistance = Math.abs(props.currentPrice - sl)
  if (slDistance === 0) return null

  const tp = parseFloat(takeProfit.value)
  const rr = tp ? Math.abs(tp - props.currentPrice) / slDistance : 0
  const quantity = (riskAmount * leverage.value) / slDistance

  return {
    quantity: quantity.toFixed(4),
    riskAmount: riskAmount.toFixed(2),
    slDistance: slDistance.toFixed(2),
    rr: rr.toFixed(1),
    potentialProfit: (riskAmount * rr).toFixed(2),
    notionalValue: (quantity * props.currentPrice).toFixed(2),
  }
})

async function placeTrade() {
  error.value = ''
  success.value = ''

  if (!stopLoss.value || !takeProfit.value) {
    error.value = 'Stop Loss and Take Profit are required'
    return
  }

  loading.value = true
  try {
    const result = await $fetch<any>('/api/trading/manual-trade', {
      method: 'POST',
      body: {
        symbol: props.symbol,
        side: side.value,
        leverage: leverage.value,
        stopLoss: stopLoss.value,
        takeProfit: takeProfit.value,
        riskPercent: riskPercent.value,
      },
    })

    success.value = `${side.value === 'BUY' ? 'LONG' : 'SHORT'} ${result.order.quantity} @ $${result.order.entryPrice.toLocaleString()}`
    stopLoss.value = ''
    takeProfit.value = ''
    await refreshPosition()
    emit('traded')
  } catch (err: any) {
    error.value = err.data?.message || err.message || 'Trade failed'
  } finally {
    loading.value = false
  }
}

async function closePosition() {
  if (!confirm(`Close ${props.symbol} position?`)) return

  closing.value = true
  error.value = ''
  success.value = ''

  try {
    const result = await $fetch<any>('/api/trading/close-position', {
      method: 'POST',
      body: { symbol: props.symbol },
    })

    success.value = `Closed: $${result.pnl} (${result.pnlPercent}%) — ${result.result.toUpperCase()}`
    await refreshPosition()
    emit('traded')
  } catch (err: any) {
    error.value = err.data?.message || err.message || 'Close failed'
  } finally {
    closing.value = false
  }
}

// Auto-fill on mount if analysis exists
onMounted(() => {
  if (props.analysisLevels) fillFromAnalysis()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Account Info -->
    <div v-if="posData?.account" class="flex gap-4 text-sm">
      <div>
        <span class="text-gray-500">Balance:</span>
        <span class="ml-1 font-mono">${{ posData.account.totalWalletBalance.toFixed(2) }}</span>
      </div>
      <div>
        <span class="text-gray-500">Available:</span>
        <span class="ml-1 font-mono">${{ posData.account.availableBalance.toFixed(2) }}</span>
      </div>
      <div>
        <span class="text-gray-500">3% Risk:</span>
        <span class="ml-1 font-mono text-yellow-400">${{ posData.account.riskPerTrade }}</span>
      </div>
    </div>

    <!-- Current Position -->
    <div v-if="posData?.position" class="bg-gray-900 rounded-lg border p-4" :class="posData.position.unrealizedProfit >= 0 ? 'border-emerald-700' : 'border-red-700'">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-bold flex items-center gap-2">
          <span :class="posData.position.positionAmt > 0 ? 'text-emerald-400' : 'text-red-400'">
            {{ posData.position.positionAmt > 0 ? 'LONG' : 'SHORT' }}
          </span>
          <span class="text-gray-400 text-sm">{{ posData.position.leverage }}x</span>
        </h3>
        <button
          class="bg-red-600 hover:bg-red-500 text-white px-4 py-1.5 rounded text-sm transition disabled:opacity-50"
          :disabled="closing"
          @click="closePosition"
        >
          {{ closing ? 'Closing...' : 'Close Position' }}
        </button>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <div class="text-gray-500 text-xs">Size</div>
          <div class="font-mono">{{ Math.abs(posData.position.positionAmt) }}</div>
        </div>
        <div>
          <div class="text-gray-500 text-xs">Entry</div>
          <div class="font-mono">${{ posData.position.entryPrice.toLocaleString() }}</div>
        </div>
        <div>
          <div class="text-gray-500 text-xs">Mark Price</div>
          <div class="font-mono">${{ posData.position.markPrice.toLocaleString() }}</div>
        </div>
        <div>
          <div class="text-gray-500 text-xs">PnL</div>
          <div class="font-mono font-bold" :class="posData.position.unrealizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'">
            ${{ posData.position.unrealizedProfit.toFixed(2) }}
          </div>
        </div>
      </div>

      <div v-if="posData.position.liquidationPrice > 0" class="mt-2 text-xs text-gray-500">
        Liq: ${{ posData.position.liquidationPrice.toLocaleString() }}
      </div>

      <!-- Open Orders -->
      <div v-if="posData.openOrders?.length" class="mt-3 pt-3 border-t border-gray-700">
        <div class="text-xs text-gray-500 mb-1">Open Orders</div>
        <div v-for="o in posData.openOrders" :key="o.orderId" class="text-xs flex gap-3">
          <span :class="o.type.includes('STOP') ? 'text-red-400' : 'text-emerald-400'">{{ o.type.replace('_', ' ') }}</span>
          <span class="font-mono">${{ o.price || o.stopPrice }}</span>
          <span class="text-gray-500">{{ o.side }} {{ o.origQty }}</span>
        </div>
      </div>
    </div>

    <!-- Trade Form (show only when no position) -->
    <div v-if="!posData?.position" class="bg-gray-900 rounded-lg border border-gray-700 p-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold">Manual Trade</h3>
        <button
          v-if="analysisLevels"
          class="text-xs text-blue-400 hover:text-blue-300"
          @click="fillFromAnalysis"
        >
          Fill from AI
        </button>
      </div>

      <!-- Side Toggle -->
      <div class="grid grid-cols-2 gap-2 mb-4">
        <button
          class="py-2.5 rounded-lg font-bold text-sm transition"
          :class="side === 'BUY' ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'"
          @click="side = 'BUY'"
        >
          LONG
        </button>
        <button
          class="py-2.5 rounded-lg font-bold text-sm transition"
          :class="side === 'SELL' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'"
          @click="side = 'SELL'"
        >
          SHORT
        </button>
      </div>

      <!-- Leverage -->
      <div class="mb-3">
        <label class="text-xs text-gray-400 block mb-1">Leverage</label>
        <div class="flex gap-2">
          <button
            v-for="lev in [5, 10, 15, 20, 25]"
            :key="lev"
            class="flex-1 py-1.5 rounded text-sm transition"
            :class="leverage === lev ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'"
            @click="leverage = lev"
          >
            {{ lev }}x
          </button>
        </div>
      </div>

      <!-- SL / TP -->
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label class="text-xs text-gray-400 block mb-1">Stop Loss ($)</label>
          <input
            v-model="stopLoss"
            type="number"
            step="any"
            placeholder="SL price"
            class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm font-mono focus:border-red-500 focus:outline-none"
          />
        </div>
        <div>
          <label class="text-xs text-gray-400 block mb-1">Take Profit ($)</label>
          <input
            v-model="takeProfit"
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
        <div class="flex gap-2">
          <button
            v-for="r in [1, 2, 3, 5]"
            :key="r"
            class="flex-1 py-1.5 rounded text-sm transition"
            :class="riskPercent === r ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'"
            @click="riskPercent = r"
          >
            {{ r }}%
          </button>
        </div>
      </div>

      <!-- Position Preview -->
      <div v-if="positionPreview" class="bg-gray-800 rounded p-3 mb-4 text-xs space-y-1">
        <div class="flex justify-between">
          <span class="text-gray-500">Position Size</span>
          <span class="font-mono">{{ positionPreview.quantity }} units</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Notional Value</span>
          <span class="font-mono">${{ positionPreview.notionalValue }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Risk Amount</span>
          <span class="font-mono text-yellow-400">${{ positionPreview.riskAmount }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">SL Distance</span>
          <span class="font-mono text-red-400">${{ positionPreview.slDistance }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">R:R Ratio</span>
          <span class="font-mono" :class="parseFloat(positionPreview.rr) >= 3 ? 'text-emerald-400' : 'text-yellow-400'">1:{{ positionPreview.rr }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500">Potential Profit</span>
          <span class="font-mono text-emerald-400">${{ positionPreview.potentialProfit }}</span>
        </div>
      </div>

      <!-- Warning for low R:R -->
      <div v-if="positionPreview && parseFloat(positionPreview.rr) < 3" class="bg-yellow-900/30 border border-yellow-700 rounded p-2 mb-4 text-xs text-yellow-400">
        R:R is below 1:3 — consider adjusting your levels
      </div>

      <!-- Submit -->
      <button
        class="w-full py-3 rounded-lg font-bold text-sm transition disabled:opacity-50"
        :class="side === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'"
        :disabled="loading || !stopLoss || !takeProfit"
        @click="placeTrade"
      >
        {{ loading ? 'Placing Order...' : `${side === 'BUY' ? 'LONG' : 'SHORT'} ${symbol}` }}
      </button>
    </div>

    <!-- Messages -->
    <div v-if="error" class="bg-red-900/30 border border-red-700 rounded p-3 text-sm text-red-400">
      {{ error }}
    </div>
    <div v-if="success" class="bg-emerald-900/30 border border-emerald-700 rounded p-3 text-sm text-emerald-400">
      {{ success }}
    </div>
  </div>
</template>
