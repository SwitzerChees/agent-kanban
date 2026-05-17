export default defineNuxtConfig({
  compatibilityDate: '2026-05-15',
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: true },
  ui: {
    fonts: false,
  },
  nitro: {
    experimental: {
      asyncContext: true,
    },
  },
});
