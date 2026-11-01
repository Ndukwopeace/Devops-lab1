// Server-side fetches use these URLs. Compose overrides them with
// NUXT_PYTHON_API_URL, NUXT_NODE_API_URL and NUXT_JAVA_API_URL.
export default defineNuxtConfig({
  compatibilityDate: '2024-09-01',
  devtools: { enabled: false },
  telemetry: false,
  runtimeConfig: {
    pythonApiUrl: 'http://localhost:8000',
    nodeApiUrl: 'http://localhost:3001',
    javaApiUrl: 'http://localhost:8080',
  },
})
