<script setup>
import { loadAll } from './utils/items.js'

const config = useRuntimeConfig()
const { data: results } = await useAsyncData('items', () =>
  loadAll([
    { name: 'python-api', url: config.pythonApiUrl },
    { name: 'node-api', url: config.nodeApiUrl },
    { name: 'java-api', url: config.javaApiUrl },
  ]),
)
</script>

<template>
  <main>
    <h1>Items</h1>
    <section v-for="result in results" :key="result.name">
      <h2>{{ result.name }}</h2>
      <p v-if="result.error">Unavailable: {{ result.error }}</p>
      <p v-else-if="result.items.length === 0">No items.</p>
      <ul v-else>
        <li v-for="item in result.items" :key="item.id">{{ item.name }}</li>
      </ul>
    </section>
  </main>
</template>
