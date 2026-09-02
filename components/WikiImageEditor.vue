<script setup lang="ts">
import { cloneWikiImageAnnotation, type WikiImageAnnotation, type WikiImagePoint, type WikiImageRecord, type WikiImageStroke } from '~/utils/wiki-images';

type Locale = 'en' | 'de';
type EditMode = 'draw' | 'pin';

const props = defineProps<{
  image: WikiImageRecord | null;
  locale: Locale;
  saving: boolean;
}>();

const emit = defineEmits<{
  save: [payload: { annotationData: WikiImageAnnotation; renderedImage: string; expectedUpdatedAt: string }];
}>();

const open = defineModel<boolean>('open', { default: false });
const imageElement = ref<HTMLImageElement | null>(null);
const canvasElement = ref<HTMLCanvasElement | null>(null);
const annotation = ref<WikiImageAnnotation>({ version: 1, strokes: [], pins: [] });
const drawingStroke = ref<WikiImageStroke | null>(null);
const mode = ref<EditMode>('draw');
const color = ref('#ef4444');
const strokeWidth = ref(5);
const pendingPin = ref<WikiImagePoint | null>(null);
const pendingPinComment = ref('');
const colors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#111827'];
let resizeObserver: ResizeObserver | null = null;
let resizeFrame: number | null = null;

const copy = computed(() => props.locale === 'de' ? {
  title: 'Wiki-Bild bearbeiten',
  description: 'Zeichne direkt ins Bild oder setze kommentierte Pins.',
  draw: 'Zeichnen',
  pin: 'Kommentar-Pin',
  undo: 'Letzte Zeichnung zurücknehmen',
  clear: 'Zeichnungen löschen',
  clearPins: 'Alle Pins löschen',
  pinComment: 'Kommentar zum Pin',
  addPin: 'Pin hinzufügen',
  cancelPin: 'Pin verwerfen',
  pins: 'Pin-Kommentare',
  noPins: 'Noch keine Pins gesetzt.',
  deletePin: 'Pin entfernen',
  cancel: 'Abbrechen',
  save: 'Bild speichern',
  helpDraw: 'Ziehe mit Maus, Stift oder Finger über das Bild.',
  helpPin: 'Klicke die gewünschte Stelle im Bild an und ergänze den Kommentar.',
  color: 'Zeichenfarbe',
  width: 'Strichbreite',
} : {
  title: 'Edit Wiki image',
  description: 'Draw directly on the image or place comment pins.',
  draw: 'Draw',
  pin: 'Comment pin',
  undo: 'Undo last drawing',
  clear: 'Clear drawings',
  clearPins: 'Clear all pins',
  pinComment: 'Pin comment',
  addPin: 'Add pin',
  cancelPin: 'Discard pin',
  pins: 'Pin comments',
  noPins: 'No pins yet.',
  deletePin: 'Remove pin',
  cancel: 'Cancel',
  save: 'Save image',
  helpDraw: 'Drag across the image with a mouse, pen, or finger.',
  helpPin: 'Click a position in the image, then add the comment.',
  color: 'Drawing color',
  width: 'Stroke width',
});

watch([open, () => props.image?.id], ([isOpen]) => {
  if (!isOpen) {
    stopResizeObserver();
    return;
  }
  if (!props.image) return;
  annotation.value = cloneWikiImageAnnotation(props.image.annotation);
  drawingStroke.value = null;
  pendingPin.value = null;
  pendingPinComment.value = '';
  mode.value = 'draw';
  nextTick(() => {
    if (imageElement.value?.complete) onImageLoad();
  });
});

watch(mode, () => {
  drawingStroke.value = null;
  pendingPin.value = null;
  pendingPinComment.value = '';
  redrawCanvas();
});

onBeforeUnmount(stopResizeObserver);

function onImageLoad() {
  stopResizeObserver();
  if (imageElement.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleCanvasSync);
    resizeObserver.observe(imageElement.value);
  }
  scheduleCanvasSync();
}

function stopResizeObserver() {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
  resizeFrame = null;
}

function scheduleCanvasSync() {
  if (!open.value) return;
  if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    resizeCanvas();
    redrawCanvas();
  });
}

function resizeCanvas() {
  const canvas = canvasElement.value;
  const image = imageElement.value;
  if (!canvas || !image || !image.clientWidth || !image.clientHeight) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(image.clientWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.clientHeight * ratio));
}

function redrawCanvas() {
  const canvas = canvasElement.value;
  const image = imageElement.value;
  if (!canvas || !image || !image.clientWidth || !image.clientHeight) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.setTransform(canvas.width / image.clientWidth, 0, 0, canvas.height / image.clientHeight, 0, 0);
  for (const stroke of [...annotation.value.strokes, ...(drawingStroke.value ? [drawingStroke.value] : [])]) {
    drawStroke(context, stroke, image.clientWidth, image.clientHeight, 1);
  }
}

function pointerPosition(event: PointerEvent): WikiImagePoint | null {
  const canvas = canvasElement.value;
  if (!canvas) return null;
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;
  return {
    x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
    y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
  };
}

function startStroke(event: PointerEvent) {
  if (mode.value !== 'draw') return;
  const point = pointerPosition(event);
  if (!point) return;
  try {
    (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture is optional on synthetic and handed-off touch events.
  }
  drawingStroke.value = { color: color.value, width: strokeWidth.value, points: [point] };
  redrawCanvas();
}

function moveStroke(event: PointerEvent) {
  if (!drawingStroke.value) return;
  const point = pointerPosition(event);
  if (!point) return;
  drawingStroke.value = { ...drawingStroke.value, points: [...drawingStroke.value.points, point] };
  redrawCanvas();
}

function finishStroke(event: PointerEvent) {
  if (!drawingStroke.value) return;
  try {
    (event.currentTarget as HTMLCanvasElement).releasePointerCapture(event.pointerId);
  } catch {
    // The browser may already have released capture.
  }
  if (drawingStroke.value.points.length > 1) {
    annotation.value = { ...annotation.value, strokes: [...annotation.value.strokes, drawingStroke.value] };
  }
  drawingStroke.value = null;
  redrawCanvas();
}

function placePin(event: MouseEvent) {
  if (mode.value !== 'pin' || event.target instanceof Element && event.target.closest('button')) return;
  const target = event.currentTarget as HTMLElement;
  const bounds = target.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  pendingPin.value = {
    x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
    y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
  };
  pendingPinComment.value = '';
  nextTick(() => document.querySelector<HTMLInputElement>('[data-wiki-pin-comment]')?.focus());
}

function addPin() {
  const comment = pendingPinComment.value.trim();
  if (!pendingPin.value || !comment) return;
  annotation.value = {
    ...annotation.value,
    pins: [...annotation.value.pins, {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...pendingPin.value,
      comment,
    }],
  };
  pendingPin.value = null;
  pendingPinComment.value = '';
}

function removePin(id: string) {
  annotation.value = { ...annotation.value, pins: annotation.value.pins.filter((pin) => pin.id !== id) };
}

function undoStroke() {
  annotation.value = { ...annotation.value, strokes: annotation.value.strokes.slice(0, -1) };
  redrawCanvas();
}

function clearStrokes() {
  annotation.value = { ...annotation.value, strokes: [] };
  drawingStroke.value = null;
  redrawCanvas();
}

function save() {
  if (!props.image || props.saving || annotation.value.pins.some((pin) => !pin.comment.trim())) return;
  emit('save', {
    annotationData: cloneWikiImageAnnotation(annotation.value),
    renderedImage: renderAnnotatedImage(),
    expectedUpdatedAt: props.image.updatedAt,
  });
}

function renderAnnotatedImage() {
  const image = imageElement.value;
  if (!image) throw new Error('wiki_image_not_ready');
  const canvas = document.createElement('canvas');
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('annotation_canvas_unavailable');
  context.drawImage(image, 0, 0, width, height);
  const scale = width / (image.clientWidth || width);
  for (const stroke of annotation.value.strokes) drawStroke(context, stroke, width, height, scale);
  return canvas.toDataURL('image/png');
}

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: WikiImageStroke,
  width: number,
  height: number,
  lineScale: number,
) {
  const first = stroke.points[0];
  if (!first) return;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = stroke.color;
  context.lineWidth = stroke.width * lineScale;
  context.beginPath();
  context.moveTo(first.x * width, first.y * height);
  for (const point of stroke.points.slice(1)) context.lineTo(point.x * width, point.y * height);
  context.stroke();
}
</script>

<template>
  <UModal v-model:open="open" :title="copy.title" :description="props.image?.fileName" :ui="{ content: 'max-w-6xl', body: 'p-0 sm:p-0', footer: 'justify-between border-t border-zinc-200 bg-zinc-50 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900' }">
    <template #body>
      <div v-if="props.image" class="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div class="min-w-0 p-4 sm:p-5">
          <div class="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/70">
            <div class="inline-flex rounded-md bg-zinc-200/70 p-0.5 dark:bg-zinc-800" role="group">
              <button type="button" class="rounded px-2.5 py-1.5 text-xs font-semibold" :class="mode === 'draw' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-zinc-600 dark:text-zinc-300'" @click="mode = 'draw'"><UIcon name="i-lucide-pencil-line" class="mr-1 inline size-3.5" />{{ copy.draw }}</button>
              <button type="button" class="rounded px-2.5 py-1.5 text-xs font-semibold" :class="mode === 'pin' ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-zinc-600 dark:text-zinc-300'" @click="mode = 'pin'"><UIcon name="i-lucide-map-pin" class="mr-1 inline size-3.5" />{{ copy.pin }}</button>
            </div>
            <template v-if="mode === 'draw'">
              <button v-for="item in colors" :key="item" type="button" class="size-7 rounded-full border-2" :class="color === item ? 'border-zinc-950 ring-2 ring-teal-500 dark:border-white' : 'border-white dark:border-zinc-900'" :style="{ backgroundColor: item }" :aria-label="`${copy.color}: ${item}`" @click="color = item" />
              <input v-model.number="strokeWidth" type="range" min="2" max="18" class="w-28 accent-teal-600" :aria-label="copy.width">
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-undo-2" :disabled="!annotation.strokes.length" :aria-label="copy.undo" @click="undoStroke" />
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-eraser" :disabled="!annotation.strokes.length" :aria-label="copy.clear" @click="clearStrokes" />
            </template>
            <span class="ml-auto text-[11px] text-zinc-500 dark:text-zinc-400">{{ mode === 'draw' ? copy.helpDraw : copy.helpPin }}</span>
          </div>

          <div class="overflow-auto rounded-lg border border-zinc-200 bg-zinc-100 p-2 dark:border-zinc-800 dark:bg-zinc-950">
            <div class="relative mx-auto w-fit max-w-full" :class="mode === 'pin' ? 'cursor-crosshair' : ''" @click="placePin">
              <img ref="imageElement" :src="props.image.sourceUrl" :alt="props.image.fileName" class="block max-h-[64vh] max-w-full select-none" draggable="false" @load="onImageLoad">
              <canvas ref="canvasElement" class="absolute inset-0 size-full touch-none" :class="mode === 'draw' ? 'cursor-crosshair' : 'pointer-events-none'" @pointerdown.prevent="startStroke" @pointermove.prevent="moveStroke" @pointerup.prevent="finishStroke" @pointercancel.prevent="finishStroke" />
              <span v-for="(pin, index) in annotation.pins" :key="pin.id" class="ak-wiki-image-editor-pin" :style="{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }">{{ index + 1 }}</span>
              <span v-if="pendingPin" class="ak-wiki-image-editor-pin is-pending" :style="{ left: `${pendingPin.x * 100}%`, top: `${pendingPin.y * 100}%` }">+</span>
            </div>
          </div>

          <form v-if="pendingPin" class="mt-3 flex gap-2" @submit.prevent="addPin">
            <UInput v-model="pendingPinComment" data-wiki-pin-comment class="min-w-0 flex-1" maxlength="500" :placeholder="copy.pinComment" :aria-label="copy.pinComment" />
            <UButton type="button" color="neutral" variant="ghost" @click="pendingPin = null">{{ copy.cancelPin }}</UButton>
            <UButton type="submit" icon="i-lucide-map-pin-plus" :disabled="!pendingPinComment.trim()">{{ copy.addPin }}</UButton>
          </form>
        </div>

        <aside class="border-t border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 lg:border-l lg:border-t-0">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-sm font-semibold text-zinc-950 dark:text-white">{{ copy.pins }}</h3>
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-map-pin-off" :disabled="!annotation.pins.length" :aria-label="copy.clearPins" @click="annotation = { ...annotation, pins: [] }" />
          </div>
          <div v-if="annotation.pins.length" class="mt-3 grid gap-2">
            <div v-for="(pin, index) in annotation.pins" :key="pin.id" class="flex items-start gap-2 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-950">
              <span class="grid size-6 shrink-0 place-items-center rounded-full bg-amber-400 text-[11px] font-bold text-amber-950">{{ index + 1 }}</span>
              <textarea v-model="pin.comment" rows="2" maxlength="500" class="min-w-0 flex-1 resize-none bg-transparent text-xs leading-5 text-zinc-700 outline-none dark:text-zinc-200" :aria-label="`${copy.pinComment} ${index + 1}`" />
              <button type="button" class="grid size-6 shrink-0 place-items-center rounded text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40" :aria-label="copy.deletePin" @click="removePin(pin.id)"><UIcon name="i-lucide-x" class="size-3.5" /></button>
            </div>
          </div>
          <p v-else class="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ copy.noPins }}</p>
        </aside>
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="ghost" @click="open = false">{{ copy.cancel }}</UButton>
      <UButton icon="i-lucide-save" :loading="props.saving" :disabled="Boolean(pendingPin)" @click="save">{{ copy.save }}</UButton>
    </template>
  </UModal>
</template>

<style scoped>
.ak-wiki-image-editor-pin {
  position: absolute;
  display: grid;
  width: 1.65rem;
  height: 1.65rem;
  transform: translate(-50%, -50%);
  place-items: center;
  border: 2px solid white;
  border-radius: 999px;
  background: rgb(251 191 36);
  color: rgb(69 26 3);
  font-size: 0.6875rem;
  font-weight: 800;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.28);
}

.ak-wiki-image-editor-pin.is-pending {
  border-style: dashed;
  background: rgb(254 243 199);
}
</style>
