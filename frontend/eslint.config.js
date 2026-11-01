import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  { ignores: ['.nuxt/**', '.output/**', 'node_modules/**', 'reports/**'] },
  js.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        // Nuxt auto-imports
        defineNuxtConfig: 'readonly',
        defineEventHandler: 'readonly',
        useAsyncData: 'readonly',
        useRuntimeConfig: 'readonly',
      },
    },
  },
]
