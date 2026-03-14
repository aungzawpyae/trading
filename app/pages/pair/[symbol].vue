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
</script>

<template>
  <div>
    <NuxtLink to="/" class="text-emerald-400 hover:underline text-sm mb-4 inline-block">&larr; Back to Dashboard</NuxtLink>

    <div v-if="status === 'pending' && !data" class="text-center py-12 text-gray-400">Loading...</div>

    <div v-else-if="data">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
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

        <!-- Right: Trading Panel (1 col) -->
        <div>
          <h2 class="text-lg font-bold mb-4">Trade</h2>
          <TradingPanel
            :symbol="symbol"
            :current-price="data.ticker?.price || 0"
            :analysis-levels="data.latestAnalysis?.raw_response?.key_levels || null"
            :analysis-signal="data.latestAnalysis?.signal || null"
            @traded="refresh()"
          />
        </div>
      </div>
    </div>
  </div>
</template>
