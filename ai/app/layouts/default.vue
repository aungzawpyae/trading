<template>
  <div class="min-h-screen bg-gray-900 text-white">
    <nav class="bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div class="flex items-center justify-between max-w-7xl mx-auto">
        <NuxtLink to="/" class="text-xl font-bold text-emerald-400">Trading AI</NuxtLink>
        <span class="text-gray-400 text-sm">Binance + Gemini AI Analysis</span>
      </div>
    </nav>
    <main class="max-w-7xl mx-auto px-6 py-8">
      <slot />
    </main>
  </div>
</template>
