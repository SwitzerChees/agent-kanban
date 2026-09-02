<script setup lang="ts">
import type { WikiReferenceMember, WikiReferenceTask } from '~/utils/wiki-references';

type Locale = 'en' | 'de';

interface Suggestion {
  id: string;
  kind: 'user' | 'task';
  label: string;
  description: string;
  insertText: string;
}

const props = withDefaults(defineProps<{
  modelValue: string;
  locale: Locale;
  members: readonly WikiReferenceMember[];
  tasks: readonly WikiReferenceTask[];
  placeholder: string;
  label: string;
  disabled?: boolean;
  autofocus?: boolean;
  cancelable?: boolean;
}>(), {
  disabled: false,
  autofocus: false,
  cancelable: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  submit: [];
  cancel: [];
}>();

const textarea = ref<HTMLTextAreaElement | null>(null);
const trigger = ref<'@' | '#' | null>(null);
const query = ref('');
const referenceStart = ref(0);
const referenceCursor = ref(0);
const activeIndex = ref(0);
const menuPosition = reactive({ top: 0, left: 0, width: 320 });
const menuId = `wiki-todo-references-${Math.random().toString(36).slice(2)}`;

const copy = computed(() => props.locale === 'de' ? {
  hint: '@ Person · # Task · Strg/⌘ + Enter zum Speichern',
  references: 'Person oder Task auswählen',
} : {
  hint: '@ person · # task · Ctrl/⌘ + Enter to save',
  references: 'Choose a person or task',
});

const suggestions = computed<Suggestion[]>(() => {
  const needle = query.value.trim().toLocaleLowerCase(props.locale === 'de' ? 'de-CH' : 'en');
  const entries: Suggestion[] = trigger.value === '@'
    ? props.members.map((member) => ({
        id: member.id,
        kind: 'user',
        label: `@${member.name}`,
        description: props.locale === 'de' ? 'Projektmitglied' : 'Project member',
        insertText: `@${member.name}`,
      }))
    : trigger.value === '#'
      ? props.tasks.map((task) => ({
          id: task.id,
          kind: 'task',
          label: `#${task.key}`,
          description: task.title,
          insertText: `#${task.key}`,
        }))
      : [];
  return entries.filter((entry) => !needle
    || `${entry.label}\n${entry.description}`.toLocaleLowerCase().includes(needle)).slice(0, 8);
});

const menuOpen = computed(() => Boolean(trigger.value && suggestions.value.length));

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  nextTick(() => {
    resize();
    if (props.autofocus) focus();
  });
});

onBeforeUnmount(() => document.removeEventListener('pointerdown', handleDocumentPointerDown));

watch(() => props.modelValue, () => nextTick(resize));

function focus() {
  textarea.value?.focus();
  const length = textarea.value?.value.length ?? 0;
  textarea.value?.setSelectionRange(length, length);
}

function resize() {
  const input = textarea.value;
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 192)}px`;
}

function handleInput(event: Event) {
  const input = event.target as HTMLTextAreaElement;
  emit('update:modelValue', input.value);
  resize();
  updateReferenceMenu(input);
}

function updateReferenceMenu(input: HTMLTextAreaElement) {
  const cursor = input.selectionStart ?? input.value.length;
  const prefix = input.value.slice(0, cursor);
  const match = prefix.match(/(^|[\s([{])([@#])([^@#\n]*)$/);
  if (!match || match[3]!.length > 100) {
    closeMenu();
    return;
  }
  trigger.value = match[2] as '@' | '#';
  query.value = match[3]!;
  referenceStart.value = (match.index ?? 0) + match[1]!.length;
  referenceCursor.value = cursor;
  activeIndex.value = 0;

  const rect = input.getBoundingClientRect();
  const width = Math.min(Math.max(rect.width, 320), window.innerWidth - 16);
  const menuHeight = Math.min(12 + suggestions.value.length * 56, 288);
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  menuPosition.top = spaceBelow >= menuHeight ? rect.bottom + 6 : Math.max(8, rect.top - menuHeight - 6);
  menuPosition.left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  menuPosition.width = width;
}

function handleKeydown(event: KeyboardEvent) {
  if (menuOpen.value) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      activeIndex.value = (activeIndex.value + direction + suggestions.value.length) % suggestions.value.length;
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      selectReference(suggestions.value[activeIndex.value]!);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }
  }
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    emit('submit');
    return;
  }
  if (event.key === 'Escape' && props.cancelable) {
    event.preventDefault();
    emit('cancel');
  }
}

function selectReference(suggestion: Suggestion) {
  const input = textarea.value;
  if (!input) return;
  const before = input.value.slice(0, referenceStart.value);
  const after = input.value.slice(referenceCursor.value);
  const separator = after && /^\s/.test(after) ? '' : ' ';
  const value = `${before}${suggestion.insertText}${separator}${after}`;
  const cursor = before.length + suggestion.insertText.length + separator.length;
  emit('update:modelValue', value);
  closeMenu();
  nextTick(() => {
    input.focus();
    input.setSelectionRange(cursor, cursor);
    resize();
  });
}

function closeMenu() {
  trigger.value = null;
  query.value = '';
  activeIndex.value = 0;
}

function handleDocumentPointerDown(event: PointerEvent) {
  const element = event.target instanceof Element ? event.target : null;
  if (element?.closest(`[data-wiki-todo-textarea], #${menuId}`)) return;
  closeMenu();
}

defineExpose({ focus });
</script>

<template>
  <div class="ak-wiki-todo-textarea-wrap">
    <textarea
      ref="textarea"
      :value="props.modelValue"
      :placeholder="props.placeholder"
      :aria-label="props.label"
      :aria-controls="menuOpen ? menuId : undefined"
      :aria-expanded="menuOpen"
      aria-autocomplete="list"
      rows="2"
      maxlength="2000"
      :disabled="props.disabled"
      data-wiki-todo-textarea
      @mousedown.stop
      @click.stop
      @input="handleInput"
      @keydown.stop="handleKeydown"
    />
    <span class="ak-wiki-todo-textarea-hint">{{ copy.hint }}</span>
    <Teleport to="body">
      <div
        v-if="menuOpen"
        :id="menuId"
        class="ak-wiki-todo-reference-menu"
        :style="{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px`, width: `${menuPosition.width}px` }"
        role="listbox"
        :aria-label="copy.references"
        data-wiki-todo-reference-menu
      >
        <button
          v-for="(suggestion, index) in suggestions"
          :key="`${suggestion.kind}:${suggestion.id}`"
          type="button"
          :class="{ 'is-active': index === activeIndex }"
          role="option"
          :aria-selected="index === activeIndex"
          @mouseenter="activeIndex = index"
          @mousedown.prevent.stop
          @click.stop="selectReference(suggestion)"
        >
          <span class="ak-wiki-todo-reference-icon" :class="suggestion.kind"><UIcon :name="suggestion.kind === 'task' ? 'i-lucide-square-check-big' : 'i-lucide-user-round'" /></span>
          <span class="min-w-0"><strong>{{ suggestion.label }}</strong><small>{{ suggestion.description }}</small></span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.ak-wiki-todo-textarea-wrap { min-width: 0; width: 100%; }
.ak-wiki-todo-textarea-wrap textarea {
  display: block;
  width: 100%;
  min-height: 4.5rem;
  resize: vertical;
  overflow-y: auto;
  border: 1px solid rgb(161 161 170);
  border-radius: 0.625rem;
  background: white;
  padding: 0.625rem 0.75rem;
  color: rgb(39 39 42);
  font: inherit;
  font-size: 0.8125rem;
  line-height: 1.35rem;
  outline: none;
}
.ak-wiki-todo-textarea-wrap textarea:focus {
  border-color: rgb(13 148 136);
  box-shadow: 0 0 0 3px rgb(20 184 166 / 0.14);
}
.ak-wiki-todo-textarea-wrap textarea:disabled { cursor: wait; opacity: 0.6; }
.ak-wiki-todo-textarea-hint {
  display: block;
  margin-top: 0.25rem;
  color: rgb(113 113 122);
  font-size: 0.6875rem;
  line-height: 1rem;
}
:global(.dark) .ak-wiki-todo-textarea-wrap textarea {
  border-color: rgb(82 82 91);
  background: rgb(24 24 27);
  color: rgb(244 244 245);
}
</style>

<style>
.ak-wiki-todo-reference-menu {
  position: fixed;
  z-index: 100;
  max-height: 18rem;
  overflow-y: auto;
  border: 1px solid rgb(228 228 231);
  border-radius: 0.75rem;
  background: white;
  padding: 0.375rem;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.12), 0 8px 10px -6px rgb(0 0 0 / 0.08);
}
.ak-wiki-todo-reference-menu > button {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.75rem;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  text-align: left;
}
.ak-wiki-todo-reference-menu > button:hover,
.ak-wiki-todo-reference-menu > button.is-active { background: rgb(240 253 250); }
.ak-wiki-todo-reference-menu strong,
.ak-wiki-todo-reference-menu small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ak-wiki-todo-reference-menu strong { color: rgb(24 24 27); font-size: 0.8125rem; }
.ak-wiki-todo-reference-menu small { color: rgb(113 113 122); font-size: 0.6875rem; }
.ak-wiki-todo-reference-icon {
  display: grid;
  width: 2rem;
  height: 2rem;
  flex: none;
  place-items: center;
  border-radius: 0.5rem;
}
.ak-wiki-todo-reference-icon svg { width: 1rem; height: 1rem; }
.ak-wiki-todo-reference-icon.user { background: rgb(236 253 245); color: rgb(4 120 87); }
.ak-wiki-todo-reference-icon.task { background: rgb(239 246 255); color: rgb(29 78 216); }
.dark .ak-wiki-todo-reference-menu { border-color: rgb(63 63 70); background: rgb(24 24 27); }
.dark .ak-wiki-todo-reference-menu > button:hover,
.dark .ak-wiki-todo-reference-menu > button.is-active { background: rgb(19 78 74 / 0.65); }
.dark .ak-wiki-todo-reference-menu strong { color: rgb(244 244 245); }
.dark .ak-wiki-todo-reference-icon.user { background: rgb(6 78 59 / 0.6); color: rgb(110 231 183); }
.dark .ak-wiki-todo-reference-icon.task { background: rgb(30 58 138 / 0.55); color: rgb(147 197 253); }
</style>
