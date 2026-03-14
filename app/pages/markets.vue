<script setup lang="ts">
import type { MarketCoin } from '~/composables/useBinanceWs'

const { coinList, connected, connect, disconnect } = useBinanceWs()

const search = ref('')
const sortKey = ref<keyof MarketCoin>('quoteVolume24h')
const sortDir = ref<'asc' | 'desc'>('desc')
const page = ref(1)
const perPage = 50

const filteredCoins = computed(() => {
  let list = coinList.value

  if (search.value) {
    const q = search.value.toUpperCase()
    list = list.filter(c => c.symbol.includes(q) || c.baseAsset.includes(q))
  }

  list.sort((a, b) => {
    const av = a[sortKey.value] as number
    const bv = b[sortKey.value] as number
    return sortDir.value === 'desc' ? bv - av : av - bv
  })

  return list
})

const totalPages = computed(() => Math.ceil(filteredCoins.value.length / perPage))
const paginatedCoins = computed(() => {
  const start = (page.value - 1) * perPage
  return filteredCoins.value.slice(start, start + perPage)
})

function toggleSort(key: keyof MarketCoin) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortKey.value = key
    sortDir.value = 'desc'
  }
}

function sortIcon(key: keyof MarketCoin) {
  if (sortKey.value !== key) return ''
  return sortDir.value === 'desc' ? ' ▼' : ' ▲'
}

function formatPrice(price: number) {
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (price >= 1) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  if (price >= 0.01) return price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
  return price.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 8 })
}

function formatVolume(vol: number) {
  if (vol >= 1e9) return (vol / 1e9).toFixed(2) + 'B'
  if (vol >= 1e6) return (vol / 1e6).toFixed(2) + 'M'
  if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K'
  return vol.toFixed(0)
}

// Clear flash after animation
const flashTimers = new Map<string, ReturnType<typeof setTimeout>>()
function getFlashClass(coin: MarketCoin) {
  if (!coin.flash) return ''

  // Clear existing timer
  if (flashTimers.has(coin.symbol)) clearTimeout(flashTimers.get(coin.symbol)!)

  // Auto-clear flash after 500ms
  flashTimers.set(coin.symbol, setTimeout(() => {
    coin.flash = null
  }, 500))

  return coin.flash === 'up' ? 'flash-green' : 'flash-red'
}

onMounted(() => connect())
onUnmounted(() => {
  disconnect()
  flashTimers.forEach(t => clearTimeout(t))
})

// Reset page when search changes
watch(search, () => { page.value = 1 })
</script>

<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-4">
        <NuxtLink to="/" class="text-gray-400 hover:text-white transition">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </NuxtLink>
        <h1 class="text-2xl font-bold">Markets</h1>
        <span class="text-xs px-2 py-0.5 rounded-full" :class="connected ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'">
          {{ connected ? 'LIVE' : 'CONNECTING...' }}
        </span>
      </div>
      <div class="text-sm text-gray-500">
        {{ filteredCoins.length }} pairs
      </div>
    </div>

    <!-- Search -->
    <div class="mb-4">
      <input
        v-model="search"
        type="text"
        placeholder="Search coin... (BTC, ETH, SOL)"
        class="w-full md:w-80 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition"
      />
    </div>

    <!-- Table -->
    <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-gray-400 text-xs uppercase border-b border-gray-700">
              <th class="text-left py-3 px-4 w-12">#</th>
              <th class="text-left py-3 px-4 sticky left-0 bg-gray-800 z-10">Name</th>
              <th class="text-right py-3 px-4 cursor-pointer hover:text-white select-none" @click="toggleSort('price')">
                Price{{ sortIcon('price') }}
              </th>
              <th class="text-right py-3 px-4 cursor-pointer hover:text-white select-none" @click="toggleSort('priceChangePct24h')">
                24h %{{ sortIcon('priceChangePct24h') }}
              </th>
              <th class="text-right py-3 px-4 cursor-pointer hover:text-white select-none hidden md:table-cell" @click="toggleSort('high24h')">
                24h High{{ sortIcon('high24h') }}
              </th>
              <th class="text-right py-3 px-4 cursor-pointer hover:text-white select-none hidden md:table-cell" @click="toggleSort('low24h')">
                24h Low{{ sortIcon('low24h') }}
              </th>
              <th class="text-right py-3 px-4 cursor-pointer hover:text-white select-none" @click="toggleSort('quoteVolume24h')">
                Volume (USDT){{ sortIcon('quoteVolume24h') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!paginatedCoins.length && connected" class="text-center">
              <td colspan="7" class="py-12 text-gray-500">Loading market data...</td>
            </tr>
            <tr v-if="!paginatedCoins.length && !connected" class="text-center">
              <td colspan="7" class="py-12 text-gray-500">Connecting to Binance...</td>
            </tr>
            <tr
              v-for="(coin, idx) in paginatedCoins"
              :key="coin.symbol"
              class="border-b border-gray-700/50 hover:bg-gray-750 hover:bg-gray-700/30 transition-colors"
              :class="getFlashClass(coin)"
            >
              <!-- Rank -->
              <td class="py-3 px-4 text-gray-500 text-xs">
                {{ (page - 1) * perPage + idx + 1 }}
              </td>

              <!-- Name -->
              <td class="py-3 px-4 sticky left-0 bg-gray-800 z-10">
                <NuxtLink :to="`/pair/${coin.symbol}`" class="flex items-center gap-2 hover:text-emerald-400 transition">
                  <div class="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 shrink-0">
                    {{ coin.baseAsset.slice(0, 2) }}
                  </div>
                  <div>
                    <span class="font-semibold text-white">{{ coin.baseAsset }}</span>
                    <span class="text-gray-500 text-xs ml-1">/ USDT</span>
                  </div>
                </NuxtLink>
              </td>

              <!-- Price -->
              <td class="py-3 px-4 text-right font-mono text-white">
                ${{ formatPrice(coin.price) }}
              </td>

              <!-- 24h Change -->
              <td class="py-3 px-4 text-right font-mono font-medium"
                :class="coin.priceChangePct24h >= 0 ? 'text-emerald-400' : 'text-red-400'">
                {{ coin.priceChangePct24h >= 0 ? '+' : '' }}{{ coin.priceChangePct24h.toFixed(2) }}%
              </td>

              <!-- 24h High -->
              <td class="py-3 px-4 text-right font-mono text-gray-300 hidden md:table-cell">
                ${{ formatPrice(coin.high24h) }}
              </td>

              <!-- 24h Low -->
              <td class="py-3 px-4 text-right font-mono text-gray-300 hidden md:table-cell">
                ${{ formatPrice(coin.low24h) }}
              </td>

              <!-- Volume -->
              <td class="py-3 px-4 text-right font-mono text-gray-300">
                ${{ formatVolume(coin.quoteVolume24h) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex items-center justify-between px-4 py-3 border-t border-gray-700">
        <button
          :disabled="page <= 1"
          class="text-sm px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
          @click="page--"
        >
          Prev
        </button>
        <span class="text-sm text-gray-400">
          Page {{ page }} of {{ totalPages }}
        </span>
        <button
          :disabled="page >= totalPages"
          class="text-sm px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
          @click="page++"
        >
          Next
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.flash-green {
  animation: flashGreen 0.5s ease-out;
}
.flash-red {
  animation: flashRed 0.5s ease-out;
}

@keyframes flashGreen {
  0% { background-color: rgba(16, 185, 129, 0.2); }
  100% { background-color: transparent; }
}
@keyframes flashRed {
  0% { background-color: rgba(239, 68, 68, 0.2); }
  100% { background-color: transparent; }
}
</style>
