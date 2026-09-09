<script setup lang="ts">
const route = useRoute();
const locale = ref<'de' | 'en'>('de');
useHead(() => ({ title: 'Showroom', htmlAttrs: { lang: locale.value }, meta: [{ name: 'robots', content: 'noindex, nofollow, noarchive' }, { name: 'referrer', content: 'no-referrer' }] }));
</script>
<template>
  <main class="sr-public-page">
    <div class="sr-language"><button class="sr-button" @click="locale = locale === 'de' ? 'en' : 'de'">{{ locale === 'de' ? 'English' : 'Deutsch' }}</button></div>
    <ShowroomWorkspace :key="String(route.params.token)" :guest-token="String(route.params.token)" :locale="locale" />
  </main>
</template>
