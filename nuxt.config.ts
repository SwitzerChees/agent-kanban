export default defineNuxtConfig({
  compatibilityDate: '2026-05-15',
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  vite: {
    server: {
      allowedHosts: ['agent-kanban.hackerman.ch'],
    },
  },
  ui: {
    fonts: false,
  },
  nitro: {
    experimental: {
      asyncContext: true,
    },
  },
});
