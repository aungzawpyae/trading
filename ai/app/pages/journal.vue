<script setup lang="ts">
const statusFilter = ref('all')
const { data, refresh } = await useFetch<any>(() => `/api/trading/journal?status=${statusFilter.value}&limit=100`)

watch(statusFilter, () => refresh())

async function checkPositions() {
  await $fetch('/api/trading/check-positions', { method: 'POST' })
  await refresh()
}

function formatDate(d: string) {
  return new Date(d).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function duration(opened: string, closed: string | null) {
  if (!closed) return 'Open'
  const ms = new Date(closed).getTime() - new Date(opened).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ${mins % 60}m`
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`
}
</script>

<template>
  <div>
    <NuxtLink to="/" class="text-emerald-400 hover:underline text-sm mb-4 inline-block">&larr; Back to Dashboard</NuxtLink>

    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Trade Journal</h1>
      <div class="flex items-center gap-3">
        <select v-model="statusFilter" class="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
          <option value="all">All Trades</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <button
          class="text-sm bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded transition"
          @click="checkPositions"
        >
          Check Positions
        </button>
        <button
          class="text-sm bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded transition"
          @click="refresh()"
        >
          Refresh
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div v-if="data?.stats" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
      <div class="bg-gray-800 rounded-lg p-3 border border-gray-700 text-center">
        <div class="text-xs text-gray-400">Total Trades</div>
        <div class="text-xl font-bold">{{ data.stats.totalTrades }}</div>
      </div>
      <div class="bg-gray-800 rounded-lg p-3 border border-gray-700 text-center">
        <div class="text-xs text-gray-400">Open</div>
        <div class="text-xl font-bold text-blue-400">{{ data.stats.openTrades }}</div>
      </div>
      <div class="bg-gray-800 rounded-lg p-3 border border-gray-700 text-center">
        <div class="text-xs text-gray-400">Win Rate</div>
        <div class="text-xl font-bold" :class="data.stats.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'">
          {{ data.stats.winRate }}%
        </div>
      </div>
      <div class="bg-gray-800 rounded-lg p-3 border border-gray-700 text-center">
        <div class="text-xs text-gray-400">Total PnL</div>
        <div class="text-xl font-bold font-mono" :class="data.stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'">
          ${{ data.stats.totalPnl.toFixed(2) }}
        </div>
      </div>
      <div class="bg-gray-800 rounded-lg p-3 border border-gray-700 text-center">
        <div class="text-xs text-gray-400">W / L</div>
        <div class="text-xl font-bold">
          <span class="text-emerald-400">{{ data.stats.wins }}</span>
          <span class="text-gray-500"> / </span>
          <span class="text-red-400">{{ data.stats.losses }}</span>
        </div>
      </div>
      <div class="bg-gray-800 rounded-lg p-3 border border-gray-700 text-center">
        <div class="text-xs text-gray-400">Profit Factor</div>
        <div class="text-xl font-bold" :class="data.stats.profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400'">
          {{ data.stats.profitFactor }}
        </div>
      </div>
      <div class="bg-gray-800 rounded-lg p-3 border border-gray-700 text-center">
        <div class="text-xs text-gray-400">Streak</div>
        <div class="text-xl font-bold" :class="data.stats.streakType === 'win' ? 'text-emerald-400' : data.stats.streakType === 'loss' ? 'text-red-400' : 'text-gray-400'">
          {{ data.stats.currentStreak }}{{ data.stats.streakType === 'win' ? 'W' : data.stats.streakType === 'loss' ? 'L' : '' }}
        </div>
      </div>
    </div>

    <!-- Avg Win / Avg Loss -->
    <div v-if="data?.stats?.totalTrades > 0" class="grid grid-cols-2 gap-3 mb-6">
      <div class="bg-gray-800 rounded-lg p-3 border border-gray-700 flex justify-between items-center">
        <span class="text-sm text-gray-400">Avg Win</span>
        <span class="font-mono text-emerald-400">${{ data.stats.avgWin.toFixed(2) }}</span>
      </div>
      <div class="bg-gray-800 rounded-lg p-3 border border-gray-700 flex justify-between items-center">
        <span class="text-sm text-gray-400">Avg Loss</span>
        <span class="font-mono text-red-400">${{ data.stats.avgLoss.toFixed(2) }}</span>
      </div>
    </div>

    <!-- Trade List -->
    <div class="space-y-3">
      <div v-if="!data?.trades?.length" class="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center text-gray-400">
        No trades yet. Use /trade BTCUSDT in Telegram or the auto-trade API to start.
      </div>

      <div
        v-for="trade in data?.trades"
        :key="trade.id"
        class="bg-gray-800 rounded-lg border border-gray-700 p-4"
        :class="{
          'border-l-4 border-l-emerald-500': trade.result === 'win',
          'border-l-4 border-l-red-500': trade.result === 'loss',
          'border-l-4 border-l-blue-500': trade.status === 'open',
        }"
      >
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-3">
            <span class="font-bold text-lg">{{ trade.symbol }}</span>
            <span
              class="text-xs font-bold px-2 py-0.5 rounded uppercase"
              :class="trade.side === 'BUY' ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'"
            >
              {{ trade.side === 'BUY' ? 'LONG' : 'SHORT' }} {{ trade.leverage }}x
            </span>
            <span
              class="text-xs px-2 py-0.5 rounded"
              :class="{
                'bg-blue-900 text-blue-300': trade.status === 'open',
                'bg-emerald-900 text-emerald-300': trade.result === 'win',
                'bg-red-900 text-red-300': trade.result === 'loss',
                'bg-gray-700 text-gray-300': trade.result === 'breakeven',
              }"
            >
              {{ trade.status === 'open' ? 'OPEN' : trade.result?.toUpperCase() }}
            </span>
            <span class="text-xs text-gray-500">{{ trade.interval }}</span>
            <span class="text-xs text-gray-500">{{ trade.signal?.replace('_', ' ') }} {{ trade.confidence }}%</span>
          </div>
          <div class="text-xs text-gray-500">
            {{ formatDate(trade.opened_at) }}
            <span v-if="trade.closed_at" class="text-gray-600"> | {{ duration(trade.opened_at, trade.closed_at) }}</span>
          </div>
        </div>

        <!-- Trade Levels -->
        <div class="grid grid-cols-3 md:grid-cols-6 gap-3 text-xs mb-2">
          <div>
            <span class="text-gray-500">Entry</span>
            <div class="font-mono">${{ parseFloat(trade.entry_price).toLocaleString() }}</div>
          </div>
          <div>
            <span class="text-gray-500">SL</span>
            <div class="font-mono text-red-400">${{ parseFloat(trade.stop_loss).toLocaleString() }}</div>
          </div>
          <div>
            <span class="text-gray-500">TP</span>
            <div class="font-mono text-emerald-400">${{ parseFloat(trade.take_profit).toLocaleString() }}</div>
          </div>
          <div>
            <span class="text-gray-500">Size</span>
            <div class="font-mono">{{ parseFloat(trade.quantity) }}</div>
          </div>
          <div>
            <span class="text-gray-500">R:R</span>
            <div class="font-mono">1:{{ trade.risk_reward }}</div>
          </div>
          <div v-if="trade.pnl !== null">
            <span class="text-gray-500">PnL</span>
            <div class="font-mono font-bold" :class="parseFloat(trade.pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'">
              ${{ parseFloat(trade.pnl).toFixed(2) }}
            </div>
          </div>
          <div v-if="trade.exit_price">
            <span class="text-gray-500">Exit</span>
            <div class="font-mono">${{ parseFloat(trade.exit_price).toLocaleString() }}</div>
          </div>
        </div>

        <!-- Notes -->
        <div v-if="trade.entry_notes" class="text-xs text-gray-400 border-t border-gray-700 pt-2 mt-2">
          <span class="text-gray-500 font-bold">Notes:</span> {{ trade.entry_notes }}
        </div>
        <div v-if="trade.exit_notes" class="text-xs mt-1">
          <span class="text-gray-500 font-bold">Exit:</span>
          <span :class="trade.result === 'win' ? 'text-emerald-400' : 'text-red-400'">{{ trade.exit_notes }}</span>
        </div>
        <div v-if="trade.order_flow" class="text-xs text-gray-500 mt-1">
          <span class="font-bold">Flow:</span> {{ trade.order_flow }}
        </div>
      </div>
    </div>
  </div>
</template>
