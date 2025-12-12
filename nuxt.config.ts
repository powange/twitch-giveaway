// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  devtools: {
    enabled: true
  },

  runtimeConfig: {
    // Variables privées (côté serveur uniquement)
    // Utilise NUXT_TWITCH_CLIENT_ID et NUXT_TWITCH_CLIENT_SECRET au runtime
    twitchClientId: '',
    twitchClientSecret: ''
  },

  css: ['~/assets/css/main.css'],

  routeRules: {
    // SSR par défaut pour les pages dynamiques
  },

  compatibilityDate: '2025-01-15',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
