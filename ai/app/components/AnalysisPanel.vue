<script setup lang="ts">
defineProps<{
  analysis: {
    signal: string
    confidence: number | string
    summary: string
    rawResponse?: any
    createdAt?: string
  }
  symbol?: string
}>()

const signalCssClass: Record<string, string> = {
  strong_buy: 'text-emerald-400 border-emerald-400',
  buy: 'text-emerald-400 border-emerald-400',
  hold: 'text-yellow-400 border-yellow-400',
  sell: 'text-red-400 border-red-400',
  strong_sell: 'text-red-400 border-red-400',
}
</script>

<template>
  <div class="flex items-start gap-4 p-4 bg-gray-900 rounded-lg">
    <div v-if="symbol" class="flex-shrink-0 text-center">
      <div class="font-bold text-sm">{{ symbol }}</div>
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2 mb-1">
        <span
          :class="signalCssClass[analysis.signal] || 'text-gray-400 border-gray-400'"
          class="border text-xs font-bold px-2 py-0.5 rounded uppercase"
        >
          {{ analysis.signal.replace('_', ' ') }}
        </span>
        <span class="text-xs text-gray-400">{{ parseFloat(String(analysis.confidence)).toFixed(0) }}% confidence</span>
        <span v-if="analysis.rawResponse?.risk" class="text-xs text-gray-500">
          Risk: {{ analysis.rawResponse.risk }}
        </span>
      </div>
      <p class="text-sm text-gray-300">{{ analysis.summary }}</p>
      <div v-if="analysis.rawResponse?.key_levels" class="flex gap-4 mt-1 text-xs text-gray-500">
        <span>S: ${{ parseFloat(analysis.rawResponse.key_levels.support || 0).toLocaleString() }}</span>
        <span>R: ${{ parseFloat(analysis.rawResponse.key_levels.resistance || 0).toLocaleString() }}</span>
        <span v-if="analysis.rawResponse?.trend">Trend: {{ analysis.rawResponse.trend }}</span>
      </div>
    </div>
    <div v-if="analysis.createdAt" class="text-xs text-gray-500 flex-shrink-0">
      {{ new Date(analysis.createdAt).toLocaleTimeString() }}
    </div>
  </div>
</template>
