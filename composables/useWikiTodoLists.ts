import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { WikiTodoListRecord } from '~/utils/wiki-todos';

export function useWikiTodoLists(projectId: () => string) {
  const lists = ref<WikiTodoListRecord[]>([]);
  let source: EventSource | null = null;
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
    source?.close();
    source = null;
  }

  function connect() {
    disconnect();
    lists.value = [];
    refreshFailed = false;
    source = new EventSource(`/api/projects/${projectId()}/wiki/todo-lists/events`);
    source.addEventListener('ready', refreshQuietly);
    source.addEventListener('changed', refreshQuietly);
    refreshQuietly();
  }

  watch(projectId, () => { if (mounted) connect(); }, { flush: 'sync' });
  onMounted(() => {
    mounted = true;
    connect();
    document.addEventListener('visibilitychange', onVisibility);
    // Keep lists usable when a proxy or connection interrupts SSE.
    fallback = setInterval(() => {
      if (!document.hidden && (refreshFailed || source?.readyState !== EventSource.OPEN)) refreshQuietly();
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
