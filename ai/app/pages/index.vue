<script setup lang="ts">
const trading = useTradingStore()

const { data: dashboard, status, refresh } = await useFetch('/api/trading/dashboard')

watchEffect(() => {
  if (dashboard.value) {
    trading.pairs = dashboard.value.pairs
  }
})

async function handleAnalyze(symbol: string) {
  await trading.runAnalysis(symbol)
  await refresh()
}

// Auto-refresh every 30 seconds
const refreshInterval = ref<ReturnType<typeof setInterval> | null>(null)
onMounted(() => {
  refreshInterval.value = setInterval(() => refresh(), 30000)
})
onUnmounted(() => {
  if (refreshInterval.value) clearInterval(refreshInterval.value)
})
</script>

<template>
  <div>
    <!-- Loading State -->
    <div v-if="status === 'pending' && !dashboard" class="text-center py-12">
      <div class="text-gray-400">Loading trading data...</div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!trading.pairs.length" class="text-center py-12">
      <h2 class="text-xl font-bold mb-4">No Trading Pairs Found</h2>
      <p class="text-gray-400 mb-4">Seed the database with default trading pairs to get started.</p>
      <button
        class="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg transition"
        @click="trading.seedPairs()"
      >
        Seed Default Pairs
      </button>
    </div>

    <!-- Dashboard -->
    <div v-else>
      <!-- Price Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        <PriceCard
          v-for="pair in trading.pairs"
          :key="pair.id"
          :pair="pair"
          @analyze="handleAnalyze"
          @select="navigateTo(`/pair/${$event}`)"
        />
      </div>

      <!-- Actions Bar -->
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold">AI Analyses</h2>
        <div class="flex gap-2">
          <button
            class="text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded transition"
            @click="refresh()"
          >
            Refresh
          </button>
          <button
            class="text-sm bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded transition"
            @click="async () => { for (const p of trading.pairs) { if (!p.analysis) await handleAnalyze(p.symbol) } }"
          >
            Analyze All
          </button>
        </div>
      </div>

      <!-- Recent Analyses -->
      <div class="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div v-if="trading.pairs.every(p => !p.analysis)" class="text-gray-400 text-center py-8">
          No analyses yet. Click "Run AI Analysis" on any pair to start.
        </div>
        <div v-else class="space-y-4">
          <AnalysisPanel
            v-for="pair in trading.pairs.filter(p => p.analysis)"
            :key="pair.id"
            :analysis="pair.analysis!"
            :symbol="pair.symbol"
          />
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-if="trading.error" class="fixed bottom-4 right-4 bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
      {{ trading.error }}
      <button class="ml-2 text-red-400 hover:text-red-200" @click="trading.error = null">&times;</button>
    </div>
  </div>
</template>
