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

function calcRR(raw: any): string {
  if (!raw?.key_levels) return '-'
  const entry = parseFloat(raw.key_levels.entry || raw.key_levels.support || 0)
  const sl = parseFloat(raw.key_levels.stop_loss || 0)
  const tp = parseFloat(raw.key_levels.take_profit || 0)
  if (!entry || !sl || !tp) return '-'
  const rr = Math.abs(tp - entry) / Math.abs(entry - sl)
  return `1:${rr.toFixed(1)}`
}
</script>

<template>
  <div class="space-y-4">
    <!-- Signal Header -->
    <div class="flex items-start gap-4 p-4 bg-gray-900 rounded-lg">
      <div v-if="symbol" class="flex-shrink-0 text-center">
        <div class="font-bold text-sm">{{ symbol }}</div>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-2">
          <span
            :class="signalCssClass[analysis.signal] || 'text-gray-400 border-gray-400'"
            class="border text-xs font-bold px-2 py-0.5 rounded uppercase"
          >
            {{ analysis.signal.replace('_', ' ') }}
          </span>
          <span class="text-xs text-gray-400">{{ parseFloat(String(analysis.confidence)).toFixed(0) }}% confidence</span>
          <span v-if="analysis.rawResponse?.risk" class="text-xs px-2 py-0.5 rounded" :class="{
            'bg-emerald-900 text-emerald-300': analysis.rawResponse.risk === 'low',
            'bg-yellow-900 text-yellow-300': analysis.rawResponse.risk === 'medium',
            'bg-red-900 text-red-300': analysis.rawResponse.risk === 'high',
          }">
            {{ analysis.rawResponse.risk }} risk
          </span>
          <span v-if="analysis.rawResponse?.trend" class="text-xs text-gray-500">
            {{ analysis.rawResponse.trend }}
          </span>
        </div>
        <p class="text-sm text-gray-300">{{ analysis.summary }}</p>
      </div>
      <div v-if="analysis.createdAt" class="text-xs text-gray-500 flex-shrink-0">
        {{ new Date(analysis.createdAt).toLocaleTimeString() }}
      </div>
    </div>

    <!-- Trade Setup -->
    <div v-if="analysis.rawResponse?.key_levels" class="bg-gray-900 rounded-lg p-4">
      <h3 class="text-sm font-bold text-gray-300 mb-3">Trade Setup</h3>
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div v-if="analysis.rawResponse.key_levels.entry" class="text-center">
          <div class="text-xs text-gray-500 mb-1">Entry</div>
          <div class="font-mono text-sm text-blue-400">${{ parseFloat(analysis.rawResponse.key_levels.entry).toLocaleString() }}</div>
        </div>
        <div v-if="analysis.rawResponse.key_levels.stop_loss" class="text-center">
          <div class="text-xs text-gray-500 mb-1">Stop Loss</div>
          <div class="font-mono text-sm text-red-400">${{ parseFloat(analysis.rawResponse.key_levels.stop_loss).toLocaleString() }}</div>
        </div>
        <div v-if="analysis.rawResponse.key_levels.take_profit" class="text-center">
          <div class="text-xs text-gray-500 mb-1">Take Profit</div>
          <div class="font-mono text-sm text-emerald-400">${{ parseFloat(analysis.rawResponse.key_levels.take_profit).toLocaleString() }}</div>
        </div>
        <div class="text-center">
          <div class="text-xs text-gray-500 mb-1">Support</div>
          <div class="font-mono text-sm">${{ parseFloat(analysis.rawResponse.key_levels.support || 0).toLocaleString() }}</div>
        </div>
        <div class="text-center">
          <div class="text-xs text-gray-500 mb-1">Resistance</div>
          <div class="font-mono text-sm">${{ parseFloat(analysis.rawResponse.key_levels.resistance || 0).toLocaleString() }}</div>
        </div>
        <div class="text-center">
          <div class="text-xs text-gray-500 mb-1">R:R</div>
          <div class="font-mono text-sm font-bold" :class="{
            'text-emerald-400': calcRR(analysis.rawResponse).includes(':') && parseFloat(calcRR(analysis.rawResponse).split(':')[1]) >= 3,
            'text-yellow-400': calcRR(analysis.rawResponse).includes(':') && parseFloat(calcRR(analysis.rawResponse).split(':')[1]) < 3,
          }">{{ calcRR(analysis.rawResponse) }}</div>
        </div>
      </div>
    </div>

    <!-- Price Action & Order Flow -->
    <div v-if="analysis.rawResponse?.price_action || analysis.rawResponse?.order_flow" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div v-if="analysis.rawResponse?.order_flow" class="bg-gray-900 rounded-lg p-4">
        <h3 class="text-sm font-bold text-gray-300 mb-2">Order Flow</h3>
        <p class="text-xs text-gray-400">{{ analysis.rawResponse.order_flow }}</p>
      </div>
      <div v-if="analysis.rawResponse?.price_action" class="bg-gray-900 rounded-lg p-4">
        <h3 class="text-sm font-bold text-gray-300 mb-2">Price Action</h3>
        <div class="space-y-1 text-xs">
          <div v-if="analysis.rawResponse.price_action.wick_analysis">
            <span class="text-gray-500">Wick:</span>
            <span class="text-gray-300 ml-1">{{ analysis.rawResponse.price_action.wick_analysis }}</span>
          </div>
          <div v-if="analysis.rawResponse.price_action.momentum_direction">
            <span class="text-gray-500">Momentum:</span>
            <span class="text-gray-300 ml-1">{{ analysis.rawResponse.price_action.momentum_direction }}</span>
          </div>
          <div v-if="analysis.rawResponse.price_action.volume_signal">
            <span class="text-gray-500">Volume:</span>
            <span class="text-gray-300 ml-1">{{ analysis.rawResponse.price_action.volume_signal }}</span>
          </div>
          <div v-if="analysis.rawResponse.price_action.key_observation">
            <span class="text-gray-500">Key:</span>
            <span class="text-gray-300 ml-1">{{ analysis.rawResponse.price_action.key_observation }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Retracement & Position Size -->
    <div v-if="analysis.rawResponse?.retracement_type || analysis.rawResponse?.position_size_advice" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div v-if="analysis.rawResponse?.retracement_type && analysis.rawResponse.retracement_type !== 'none'" class="bg-gray-900 rounded-lg p-4">
        <h3 class="text-sm font-bold text-gray-300 mb-2">Retracement</h3>
        <span class="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 uppercase">
          {{ analysis.rawResponse.retracement_type.replace('_', ' ') }}
        </span>
      </div>
      <div v-if="analysis.rawResponse?.position_size_advice" class="bg-gray-900 rounded-lg p-4">
        <h3 class="text-sm font-bold text-gray-300 mb-2">Position Size (3% Risk)</h3>
        <p class="text-xs text-gray-400">{{ analysis.rawResponse.position_size_advice }}</p>
      </div>
    </div>

    <!-- Trade Checklist -->
    <div v-if="analysis.rawResponse?.trade_checklist" class="bg-gray-900 rounded-lg p-4">
      <h3 class="text-sm font-bold text-gray-300 mb-3">Trade Checklist</h3>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
        <div :class="analysis.rawResponse.trade_checklist.sl_set ? 'text-emerald-400' : 'text-red-400'">
          {{ analysis.rawResponse.trade_checklist.sl_set ? '[PASS]' : '[FAIL]' }} SL Set
        </div>
        <div :class="analysis.rawResponse.trade_checklist.tp_set ? 'text-emerald-400' : 'text-red-400'">
          {{ analysis.rawResponse.trade_checklist.tp_set ? '[PASS]' : '[FAIL]' }} TP Set
        </div>
        <div :class="analysis.rawResponse.trade_checklist.rr_above_3 ? 'text-emerald-400' : 'text-red-400'">
          {{ analysis.rawResponse.trade_checklist.rr_above_3 ? '[PASS]' : '[FAIL]' }} R:R >= 1:3
        </div>
        <div :class="analysis.rawResponse.trade_checklist.trend_aligned ? 'text-emerald-400' : 'text-red-400'">
          {{ analysis.rawResponse.trade_checklist.trend_aligned ? '[PASS]' : '[FAIL]' }} Trend Aligned
        </div>
        <div :class="analysis.rawResponse.trade_checklist.no_fomo ? 'text-emerald-400' : 'text-red-400'">
          {{ analysis.rawResponse.trade_checklist.no_fomo ? '[PASS]' : '[FAIL]' }} No FOMO
        </div>
        <div :class="analysis.rawResponse.trade_checklist.rejection_confirmed ? 'text-emerald-400' : 'text-red-400'">
          {{ analysis.rawResponse.trade_checklist.rejection_confirmed ? '[PASS]' : '[FAIL]' }} Rejection Confirmed
        </div>
      </div>
      <div v-if="analysis.rawResponse.trade_checklist.entry_notes" class="mt-3 p-3 bg-gray-800 rounded text-xs text-gray-300 border-l-2 border-blue-500">
        <span class="text-gray-500 font-bold">Entry Notes:</span> {{ analysis.rawResponse.trade_checklist.entry_notes }}
      </div>
    </div>

    <!-- Timeframe Bias -->
    <div v-if="analysis.rawResponse?.timeframe_bias" class="text-xs text-gray-500 px-4">
      Timeframe Bias: {{ analysis.rawResponse.timeframe_bias }}
    </div>
  </div>
</template>
