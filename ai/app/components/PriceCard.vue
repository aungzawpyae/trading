<script setup lang="ts">
const props = defineProps<{
  pair: {
    id: string
    symbol: string
    baseAsset: string
    quoteAsset: string
    price: number
    changePct: number
    high24h: number
    low24h: number
    volume24h: number
    analysis: {
      signal: string
      confidence: number
      summary: string
    } | null
  }
}>()

const emit = defineEmits<{
  analyze: [symbol: string]
  select: [symbol: string]
}>()

const trading = useTradingStore()

const signalBadgeClass: Record<string, string> = {
  strong_buy: 'bg-emerald-500',
  buy: 'bg-emerald-600',
  hold: 'bg-yellow-500',
  sell: 'bg-red-500',
  strong_sell: 'bg-red-700',
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(1)}B`
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`
  return `$${vol.toFixed(0)}`
}
</script>

<template>
  <div
    class="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition cursor-pointer"
    @click="emit('select', pair.symbol)"
  >
    <div class="flex items-center justify-between mb-2">
      <h3 class="font-bold text-lg">{{ pair.baseAsset }}</h3>
      <span class="text-xs text-gray-400">{{ pair.symbol }}</span>
    </div>

    <div class="text-2xl font-mono mb-1">${{ pair.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</div>

    <div class="flex items-center gap-2 mb-3">
      <span :class="pair.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'" class="text-sm font-medium">
        {{ pair.changePct >= 0 ? '+' : '' }}{{ pair.changePct.toFixed(2) }}%
      </span>
      <span class="text-gray-500 text-xs">24h</span>
    </div>

    <div class="text-xs text-gray-400 space-y-1 mb-3">
      <div class="flex justify-between">
        <span>High</span>
        <span>${{ pair.high24h.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
      </div>
      <div class="flex justify-between">
        <span>Low</span>
        <span>${{ pair.low24h.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</span>
      </div>
      <div class="flex justify-between">
        <span>Volume</span>
        <span>{{ formatVolume(pair.volume24h) }}</span>
      </div>
    </div>

    <!-- AI Signal -->
    <div v-if="pair.analysis" class="border-t border-gray-700 pt-3">
      <div class="flex items-center justify-between mb-1">
        <span
          :class="signalBadgeClass[pair.analysis.signal] || 'bg-gray-500'"
          class="text-white text-xs font-bold px-2 py-1 rounded uppercase"
        >
          {{ pair.analysis.signal.replace('_', ' ') }}
        </span>
        <span class="text-xs text-gray-400">{{ pair.analysis.confidence }}%</span>
      </div>
      <div class="w-full bg-gray-700 rounded-full h-1.5 mt-1">
        <div
          :class="signalBadgeClass[pair.analysis.signal] || 'bg-gray-500'"
          class="h-1.5 rounded-full"
          :style="{ width: `${pair.analysis.confidence}%` }"
        />
      </div>
    </div>

    <div v-else class="border-t border-gray-700 pt-3">
      <button
        class="w-full text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 px-3 rounded transition disabled:opacity-50"
        :disabled="trading.analyzing[pair.symbol]"
        @click.stop="emit('analyze', pair.symbol)"
      >
        {{ trading.analyzing[pair.symbol] ? 'Analyzing...' : 'Run AI Analysis' }}
      </button>
    </div>
  </div>
</template>
