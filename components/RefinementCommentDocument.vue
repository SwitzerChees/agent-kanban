<script setup lang="ts">
import { Extension, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { computed, onBeforeUnmount, ref, watch, watchEffect } from 'vue';

export interface RefinementDocumentComment {
  id: string;
  authorId: string;
  authorName?: string | null;
  quote: string;
  prefix: string;
  suffix: string;
  startOffset: number;
  endOffset: number;
  body: string;
  incorporatedByRefinementId?: string | null;
  createdAt: string;
  updatedAt: string;
}

const props = withDefaults(defineProps<{
  markdown: string;
  comments?: RefinementDocumentComment[];
  canComment?: boolean;
  busy?: boolean;
  locale?: string;
  currentUserId?: string | null;
  currentUserIsAdmin?: boolean;
}>(), {
  comments: () => [],
  canComment: false,
  busy: false,
  locale: 'de-CH',
  currentUserId: null,
  currentUserIsAdmin: false,
});

const emit = defineEmits<{
  create: [payload: { quote: string; prefix: string; suffix: string; startOffset: number; endOffset: number; body: string }];
  update: [payload: { commentId: string; body: string }];
  delete: [commentId: string];
  revise: [];
  interactionChange: [active: boolean];
}>();

const isGerman = computed(() => props.locale.toLowerCase().startsWith('de'));
const text = computed(() => isGerman.value ? {
  comment: 'Kommentieren',
  feedback: 'Feedback',
  selection: 'Markierte Stelle',
  request: 'Was soll die KI an dieser Stelle anpassen?',
  placeholder: 'Änderungswunsch beschreiben …',
  save: 'Kommentar speichern',
  update: 'Änderung speichern',
  cancel: 'Abbrechen',
  remove: 'Kommentar löschen',
  revise: 'Kommentare einarbeiten',
  reviseHint: 'Die KI erstellt aus der neuesten Fassung und allen offenen Kommentaren eine neue Version.',
  selectHint: 'Text markieren, um eine konkrete Anpassung zu kommentieren.',
  incorporated: 'In Folgeversion eingearbeitet',
  unknownAuthor: 'Unbekannt',
} : {
  comment: 'Comment',
  feedback: 'Feedback',
  selection: 'Selected passage',
  request: 'What should the AI change here?',
  placeholder: 'Describe the requested change …',
  save: 'Save comment',
  update: 'Save change',
  cancel: 'Cancel',
  remove: 'Delete comment',
  revise: 'Incorporate comments',
  reviseHint: 'The AI creates a new version from the latest refinement and all open comments.',
  selectHint: 'Select text to request a precise change.',
  incorporated: 'Incorporated into a later version',
  unknownAuthor: 'Unknown',
});

const root = ref<HTMLElement | null>(null);
const editorComponent = ref<{ editor?: Editor | null } | null>(null);
const editor = ref<Editor | null>(null);
const overlayRoot = ref<HTMLElement | null>(null);
const selectionAction = ref<{ left: number; top: number } | null>(null);
const selectedAnchor = ref<{ quote: string; prefix: string; suffix: string; startOffset: number; endOffset: number } | null>(null);
const activeCommentId = ref<string | null>(null);
const popoverPosition = ref<{ left: number; top: number } | null>(null);
const draft = ref('');

const pluginKey = new PluginKey<DecorationSet>(`refinement-comments-${Math.random().toString(36).slice(2)}`);
const decorationExtension = Extension.create({
  name: `refinementCommentDecorations${Math.random().toString(36).slice(2)}`,
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key: pluginKey,
      state: {
        init: (_, state) => buildDecorations(state.doc, props.comments),
        apply: (transaction, previous) => {
          const comments = transaction.getMeta(pluginKey) as RefinementDocumentComment[] | undefined;
          return comments
            ? buildDecorations(transaction.doc, comments)
            : previous.map(transaction.mapping, transaction.doc);
        },
      },
      props: {
        decorations: state => pluginKey.getState(state),
      },
    })];
  },
});

function buildDecorations(doc: ProseMirrorNode, comments: RefinementDocumentComment[]) {
  const maximum = doc.content.size;
  const decorations = comments.flatMap((comment) => {
    const start = Math.max(0, Math.min(comment.startOffset, maximum));
    const end = Math.max(start, Math.min(comment.endOffset, maximum));
    if (end <= start) return [];
    return [Decoration.inline(start, end, {
      class: comment.incorporatedByRefinementId
        ? 'ak-refinement-comment-mark ak-refinement-comment-mark-resolved'
        : 'ak-refinement-comment-mark',
      'data-refinement-comment-id': comment.id,
      'aria-label': `${text.value.feedback}: ${comment.body}`,
      role: 'button',
      tabindex: '0',
    })];
  });
  return DecorationSet.create(doc, decorations);
}

const activeComment = computed(() => props.comments.find(comment => comment.id === activeCommentId.value) ?? null);
const activeCommentEditable = computed(() => Boolean(activeComment.value
  && !activeComment.value.incorporatedByRefinementId
  && (activeComment.value.authorId === props.currentUserId || props.currentUserIsAdmin)));
const openComments = computed(() => props.comments.filter(comment => !comment.incorporatedByRefinementId));
const popoverStyle = computed(() => popoverPosition.value ? {
  left: `${popoverPosition.value.left}px`,
  top: `${popoverPosition.value.top}px`,
} : undefined);
const interactionActive = computed(() => Boolean(selectionAction.value || popoverPosition.value));

watchEffect(() => {
  const nextEditor = editorComponent.value?.editor ?? null;
  if (nextEditor === editor.value) return;
  editor.value = nextEditor;
  refreshDecorations();
});

watch(() => props.comments, () => {
  refreshDecorations();
  if (activeCommentId.value && !activeComment.value) closePopover();
}, { deep: true });

watch(interactionActive, active => emit('interactionChange', active), { immediate: true });

function refreshDecorations() {
  if (!editor.value || editor.value.isDestroyed) return;
  editor.value.view.dispatch(editor.value.state.tr.setMeta(pluginKey, props.comments));
}

function handleSelection() {
  if (!props.canComment || props.busy || !editor.value || !root.value) {
    selectionAction.value = null;
    return;
  }
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) {
    selectionAction.value = null;
    return;
  }
  const range = selection.getRangeAt(0);
  if (!root.value.contains(range.startContainer) || !root.value.contains(range.endContainer)) {
    selectionAction.value = null;
    return;
  }

  let from: number;
  let to: number;
  try {
    from = editor.value.view.posAtDOM(range.startContainer, range.startOffset, -1);
    to = editor.value.view.posAtDOM(range.endContainer, range.endOffset, 1);
  } catch {
    selectionAction.value = null;
    return;
  }
  if (to <= from) {
    selectionAction.value = null;
    return;
  }

  const quote = editor.value.state.doc.textBetween(from, to, ' ').trim();
  if (!quote) {
    selectionAction.value = null;
    return;
  }
  selectedAnchor.value = {
    quote,
    prefix: editor.value.state.doc.textBetween(Math.max(0, from - 120), from, ' ').slice(-120),
    suffix: editor.value.state.doc.textBetween(to, Math.min(editor.value.state.doc.content.size, to + 120), ' ').slice(0, 120),
    startOffset: from,
    endOffset: to,
  };
  positionSelectionAction(range);
}

function positionSelectionAction(range: Range) {
  const rects = range.getClientRects();
  const rect = rects.item(rects.length - 1) ?? range.getBoundingClientRect();
  selectionAction.value = clampToBoundary(rect.right - 116, rect.top - 44, 116, 40, true);
}

function startComment() {
  if (!selectedAnchor.value || !selectionAction.value) return;
  activeCommentId.value = null;
  draft.value = '';
  popoverPosition.value = clampToBoundary(selectionAction.value.left, selectionAction.value.top + 46, 352, 300);
  selectionAction.value = null;
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const marked = target?.closest<HTMLElement>('[data-refinement-comment-id]');
  const commentId = marked?.dataset.refinementCommentId;
  if (!commentId || !marked) return;
  event.preventDefault();
  const comment = props.comments.find(item => item.id === commentId);
  if (!comment) return;
  openComment(comment, marked.getBoundingClientRect());
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (!['Enter', ' '].includes(event.key)) return;
  const target = event.target as HTMLElement | null;
  const marked = target?.closest<HTMLElement>('[data-refinement-comment-id]');
  const comment = props.comments.find(item => item.id === marked?.dataset.refinementCommentId);
  if (!marked || !comment) return;
  event.preventDefault();
  openComment(comment, marked.getBoundingClientRect());
}

function openComment(comment: RefinementDocumentComment, rect?: DOMRect) {
  activeCommentId.value = comment.id;
  selectedAnchor.value = null;
  draft.value = comment.body;
  const anchorRect = rect ?? rangeRect(comment);
  popoverPosition.value = clampToBoundary(
    anchorRect?.right ? anchorRect.right + 12 : window.innerWidth / 2 - 176,
    anchorRect?.top ?? 96,
    352,
    320,
  );
}

function rangeRect(comment: RefinementDocumentComment) {
  if (!editor.value) return null;
  try {
    const start = editor.value.view.coordsAtPos(comment.startOffset);
    const end = editor.value.view.coordsAtPos(comment.endOffset);
    return { left: start.left, right: end.right, top: start.top, bottom: end.bottom } as DOMRect;
  } catch {
    return null;
  }
}

function submitComment() {
  const body = draft.value.trim();
  if (!body || props.busy) return;
  if (activeComment.value) emit('update', { commentId: activeComment.value.id, body });
  else if (selectedAnchor.value) emit('create', { ...selectedAnchor.value, body });
  closePopover();
  window.getSelection()?.removeAllRanges();
}

function removeComment() {
  if (!activeComment.value || !activeCommentEditable.value || props.busy) return;
  emit('delete', activeComment.value.id);
  closePopover();
}

function closePopover() {
  popoverPosition.value = null;
  activeCommentId.value = null;
  selectedAnchor.value = null;
  draft.value = '';
}

function clampToBoundary(left: number, top: number, width: number, height: number, preferScrollContainer = false) {
  const padding = 12;
  const boundary = interactionBoundary(preferScrollContainer);
  return {
    left: Math.max(boundary.left + padding, Math.min(left, boundary.right - width - padding)),
    top: Math.max(boundary.top + padding, Math.min(top, boundary.bottom - height - padding)),
  };
}

function interactionBoundary(preferScrollContainer: boolean) {
  const dialog = root.value?.closest<HTMLElement>('[role="dialog"]') ?? null;
  if (preferScrollContainer) {
    let candidate = root.value?.parentElement ?? null;
    while (candidate && candidate !== dialog) {
      const { overflowY } = window.getComputedStyle(candidate);
      if (['auto', 'scroll'].includes(overflowY)) return candidate.getBoundingClientRect();
      candidate = candidate.parentElement;
    }
  }
  return dialog?.getBoundingClientRect() ?? {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };
}

function handleViewportChange(event: Event) {
  if (event.type === 'scroll' && event.target instanceof Node && overlayRoot.value?.contains(event.target)) return;
  if (event.type === 'scroll' && selectionAction.value && root.value) {
    const selection = window.getSelection();
    if (selection?.rangeCount && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      if (root.value.contains(range.startContainer) && root.value.contains(range.endContainer)) {
        positionSelectionAction(range);
        return;
      }
    }
  }
  selectionAction.value = null;
  if (popoverPosition.value) closePopover();
}

function handleSelectionChange() {
  if (!selectionAction.value || popoverPosition.value || !root.value) return;
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) {
    selectionAction.value = null;
    selectedAnchor.value = null;
    return;
  }
  const range = selection.getRangeAt(0);
  if (!root.value.contains(range.startContainer) || !root.value.contains(range.endContainer)) {
    selectionAction.value = null;
    selectedAnchor.value = null;
  }
}

if (import.meta.client) {
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('scroll', handleViewportChange, true);
  document.addEventListener('selectionchange', handleSelectionChange);
}

onBeforeUnmount(() => {
  emit('interactionChange', false);
  if (!import.meta.client) return;
  window.removeEventListener('resize', handleViewportChange);
  window.removeEventListener('scroll', handleViewportChange, true);
  document.removeEventListener('selectionchange', handleSelectionChange);
});
</script>

<template>
  <section class="min-w-0">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p class="inline-flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <UIcon name="i-lucide-text-cursor-input" class="size-4" />
        {{ props.canComment ? text.selectHint : text.incorporated }}
      </p>
      <div class="flex items-center gap-2">
        <UPopover v-if="props.comments.length" :content="{ align: 'end', side: 'bottom' }">
          <UButton
            type="button"
            color="neutral"
            variant="soft"
            size="sm"
            icon="i-lucide-message-square-text"
          >
            {{ text.feedback }} · {{ props.comments.length }}
          </UButton>
          <template #content>
            <div class="max-h-80 w-80 overflow-y-auto p-2">
              <button
                v-for="comment in props.comments"
                :key="comment.id"
                type="button"
                class="block w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-600 dark:hover:bg-zinc-800"
                @click="openComment(comment)"
              >
                <span class="block truncate text-xs font-medium text-amber-800 dark:text-amber-200">“{{ comment.quote }}”</span>
                <span class="mt-1 line-clamp-2 block text-sm text-zinc-700 dark:text-zinc-200">{{ comment.body }}</span>
              </button>
            </div>
          </template>
        </UPopover>
        <UButton
          v-if="openComments.length && props.canComment"
          type="button"
          icon="i-lucide-wand-sparkles"
          size="sm"
          :loading="props.busy"
          @click="emit('revise')"
        >
          {{ openComments.length }} {{ text.revise }}
        </UButton>
      </div>
    </div>

    <div
      ref="root"
      class="ak-refinement-comment-document relative"
      @mouseup="handleSelection"
      @pointerup="handleSelection"
      @keyup="handleSelection"
      @keydown="handleDocumentKeydown"
      @click="handleDocumentClick"
    >
      <UEditor
        ref="editorComponent"
        :model-value="props.markdown"
        content-type="markdown"
        :editable="false"
        :image="false"
        :mention="false"
        :extensions="[decorationExtension]"
        class="ak-markdown-readonly text-sm leading-7 text-zinc-700 dark:text-zinc-300"
        :ui="{ content: 'px-0 py-0', base: 'px-0 sm:px-0 text-sm text-zinc-700 dark:text-zinc-300' }"
      />
    </div>

    <p v-if="openComments.length && props.canComment" class="mt-5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
      {{ text.reviseHint }}
    </p>

    <div ref="overlayRoot">
      <UButton
        v-if="selectionAction"
        type="button"
        data-testid="refinement-selection-comment"
        class="fixed z-[70] shadow-md"
        :style="{ left: `${selectionAction.left}px`, top: `${selectionAction.top}px` }"
        size="sm"
        icon="i-lucide-message-square-plus"
        @pointerdown.prevent.stop="startComment"
        @mousedown.prevent.stop
        @click.prevent.stop
      >
        {{ text.comment }}
      </UButton>

      <div
        v-if="popoverPosition"
        data-testid="refinement-comment-popover"
        class="fixed z-[75] w-[min(22rem,calc(100vw-1.5rem))] rounded-xl bg-white p-4 shadow-lg ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700"
        :style="popoverStyle"
        role="dialog"
        :aria-label="text.comment"
        @pointerdown.stop
        @click.stop
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{{ text.selection }}</p>
            <p class="mt-1 line-clamp-3 text-sm font-medium leading-5 text-amber-900 dark:text-amber-100">
              “{{ activeComment?.quote || selectedAnchor?.quote }}”
            </p>
          </div>
          <UButton type="button" color="neutral" variant="ghost" size="xs" icon="i-lucide-x" :aria-label="text.cancel" @click="closePopover" />
        </div>

        <UFormField class="mt-4" :label="text.request" required>
          <UTextarea
            v-model="draft"
            class="w-full"
            :placeholder="text.placeholder"
            :rows="4"
            :maxlength="4000"
            autoresize
            autofocus
            :disabled="props.busy || Boolean(activeComment && !activeCommentEditable)"
            @keydown.meta.enter.prevent="submitComment"
            @keydown.ctrl.enter.prevent="submitComment"
          />
        </UFormField>

        <div v-if="activeComment" class="mt-2 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <UIcon name="i-lucide-user-round" class="size-3.5" />
          <span>{{ activeComment.authorName || text.unknownAuthor }}</span>
          <span v-if="activeComment.incorporatedByRefinementId">· {{ text.incorporated }}</span>
        </div>

        <div class="mt-4 flex items-center justify-between gap-3">
          <UButton
            v-if="activeCommentEditable"
            type="button"
            color="error"
            variant="ghost"
            size="sm"
            icon="i-lucide-trash-2"
            :disabled="props.busy"
            @click="removeComment"
          >
            {{ text.remove }}
          </UButton>
          <span v-else />
          <div class="flex gap-2">
            <UButton type="button" color="neutral" variant="ghost" size="sm" @click="closePopover">{{ text.cancel }}</UButton>
            <UButton
              v-if="!activeComment || activeCommentEditable"
              type="button"
              size="sm"
              icon="i-lucide-check"
              :disabled="!draft.trim()"
              :loading="props.busy"
              @click="submitComment"
            >
              {{ activeComment ? text.update : text.save }}
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
:deep(.ak-refinement-comment-mark) {
  cursor: pointer;
  border-radius: 0.2rem;
  background: rgb(253 230 138 / 0.72);
  box-shadow: 0 0 0 2px rgb(253 230 138 / 0.28);
  transition: background-color 160ms ease-out, box-shadow 160ms ease-out;
}

:deep(.ak-refinement-comment-mark:hover),
:deep(.ak-refinement-comment-mark:focus) {
  background: rgb(252 211 77 / 0.82);
  box-shadow: 0 0 0 2px rgb(245 158 11 / 0.3);
}

:deep(.ak-refinement-comment-mark-resolved) {
  background: rgb(212 212 216 / 0.45);
  box-shadow: none;
}

:global(.dark) :deep(.ak-refinement-comment-mark) {
  background: rgb(161 98 7 / 0.55);
  box-shadow: 0 0 0 2px rgb(245 158 11 / 0.18);
}

:global(.dark) :deep(.ak-refinement-comment-mark-resolved) {
  background: rgb(82 82 91 / 0.55);
  box-shadow: none;
}

@media (prefers-reduced-motion: reduce) {
  :deep(.ak-refinement-comment-mark) {
    transition: none;
  }
}
</style>
