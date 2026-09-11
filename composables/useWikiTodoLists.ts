import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { WikiTodoListRecord } from '~/utils/wiki-todos';

export function useWikiTodoLists(projectId: () => string, liveConnected: () => boolean) {
  const lists = ref<WikiTodoListRecord[]>([]);
  let controller: AbortController | null = null;
  let generation = 0;
  let mounted = false;
  let refreshFailed = false;
  let fallback: ReturnType<typeof setInterval> | null = null;

  async function refresh() {
    const id = projectId();
    const revision = ++generation;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    try {
      const response = await $fetch<{ lists: WikiTodoListRecord[] }>(`/api/projects/${id}/wiki/todo-lists`, {
        signal: request.signal,
      });
      if (revision === generation && id === projectId()) {
        lists.value = response.lists;
        refreshFailed = false;
      }
    } catch (error) {
      if (!request.signal.aborted) {
        refreshFailed = true;
        throw error;
      }
    } finally {
      if (controller === request) controller = null;
    }
  }

  const refreshQuietly = () => { void refresh().catch(() => {}); };
  const onVisibility = () => { if (!document.hidden) refreshQuietly(); };

  function disconnect() {
    generation += 1;
    controller?.abort();
    controller = null;
  }

  function connect() {
    disconnect();
    lists.value = [];
    refreshFailed = false;
    refreshQuietly();
  }

  watch(projectId, () => { if (mounted) connect(); }, { flush: 'sync' });
  onMounted(() => {
    mounted = true;
    connect();
    document.addEventListener('visibilitychange', onVisibility);
    // Live invalidations share the Wiki stream. Do not allocate another SSE
    // connection: two tabs would exhaust the HTTP/1 connection pool.
    fallback = setInterval(() => {
      if (!document.hidden && (refreshFailed || !liveConnected())) refreshQuietly();
    }, 5_000);
  });
  onBeforeUnmount(() => {
    mounted = false;
    disconnect();
    if (fallback) clearInterval(fallback);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  return { lists, refresh };
}
