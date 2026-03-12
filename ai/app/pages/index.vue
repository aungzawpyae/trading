<script setup lang="ts">
const trading = useTradingStore()

const { data: dashboard, status, refresh } = await useFetch<any>('/api/trading/dashboard')
const { data: journal } = await useFetch<any>('/api/trading/journal?limit=5')

watchEffect(() => {
  if (dashboard.value) {
    trading.pairs = dashboard.value.pairs
  }
})

async function handleAnalyze(symbol: string) {
  await trading.runAnalysis(symbol)
  await refresh()
}

async function handleAutoTrade(symbol: string) {
  trading.analyzing[symbol] = true
  try {
    await $fetch('/api/trading/auto-trade', {
      method: 'POST',
      body: { symbol, interval: '15m' },
    })
    await refresh()
  } finally {
    trading.analyzing[symbol] = false
  }
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
    <!-- Nav -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Trading AI Dashboard</h1>
      <div class="flex gap-3">
        <NuxtLink to="/markets" class="text-sm bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded transition">
          Markets
        </NuxtLink>
        <NuxtLink to="/journal" class="text-sm bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded transition">
          Trade Journal
        </NuxtLink>
      </div>
    </div>

    <!-- Journal Stats Bar -->
    <div v-if="journal?.stats?.totalTrades > 0" class="bg-gray-800 rounded-lg border border-gray-700 p-4 mb-6 flex flex-wrap gap-6 items-center text-sm">
      <div>
        <span class="text-gray-500 text-xs">Win Rate</span>
        <div class="font-bold" :class="journal.stats.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'">
          {{ journal.stats.winRate }}%
        </div>
      </div>
      <div>
        <span class="text-gray-500 text-xs">PnL</span>
        <div class="font-mono font-bold" :class="journal.stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'">
          ${{ journal.stats.totalPnl.toFixed(2) }}
        </div>
      </div>
      <div>
        <span class="text-gray-500 text-xs">W / L</span>
        <div>
          <span class="text-emerald-400 font-bold">{{ journal.stats.wins }}</span>
          <span class="text-gray-500"> / </span>
          <span class="text-red-400 font-bold">{{ journal.stats.losses }}</span>
        </div>
      </div>
      <div>
        <span class="text-gray-500 text-xs">Open</span>
        <div class="text-blue-400 font-bold">{{ journal.stats.openTrades }}</div>
      </div>
      <div>
        <span class="text-gray-500 text-xs">Streak</span>
        <div class="font-bold" :class="journal.stats.streakType === 'win' ? 'text-emerald-400' : 'text-red-400'">
          {{ journal.stats.currentStreak }}{{ journal.stats.streakType === 'win' ? 'W' : journal.stats.streakType === 'loss' ? 'L' : '' }}
        </div>
      </div>
      <div v-if="journal.stats.currentStreak >= 3 && journal.stats.streakType === 'loss'" class="text-red-400 text-xs font-bold animate-pulse">
        3 LOSSES — TRADING PAUSED
      </div>
    </div>

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

      <!-- Recent Journal Entries -->
      <div v-if="journal?.trades?.length" class="mt-8">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-bold">Recent Trades</h2>
          <NuxtLink to="/journal" class="text-sm text-emerald-400 hover:underline">View All</NuxtLink>
        </div>
        <div class="space-y-2">
          <div
            v-for="trade in journal.trades.slice(0, 5)"
            :key="trade.id"
            class="bg-gray-800 rounded-lg border border-gray-700 p-3 flex items-center justify-between"
            :class="{
              'border-l-4 border-l-emerald-500': trade.result === 'win',
              'border-l-4 border-l-red-500': trade.result === 'loss',
              'border-l-4 border-l-blue-500': trade.status === 'open',
            }"
          >
            <div class="flex items-center gap-3">
              <span class="font-bold">{{ trade.symbol }}</span>
              <span class="text-xs" :class="trade.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'">
                {{ trade.side === 'BUY' ? 'LONG' : 'SHORT' }}
              </span>
              <span class="text-xs text-gray-500">{{ trade.interval }}</span>
            </div>
            <div class="flex items-center gap-4 text-sm">
              <span class="font-mono text-xs">${{ parseFloat(trade.entry_price).toLocaleString() }}</span>
              <span v-if="trade.pnl !== null" class="font-mono font-bold" :class="parseFloat(trade.pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'">
                ${{ parseFloat(trade.pnl).toFixed(2) }}
              </span>
              <span v-else class="text-xs text-blue-400">OPEN</span>
            </div>
          </div>
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
