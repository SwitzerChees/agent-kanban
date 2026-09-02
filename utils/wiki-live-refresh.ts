export interface WikiPageRevision {
  id: string;
  updatedAt: string;
}

export interface WikiScrollCandidate {
  tag: string;
  text: string;
  top: number;
  bottom: number;
}

export interface WikiScrollAnchor {
  tag: string;
  text: string;
  offsetTop: number;
  scrollTop: number;
}

export function replaceCurrentWikiPage<T extends WikiPageRevision>(
  pages: readonly T[],
  currentPageId: string,
  incoming: T,
): readonly T[] {
  if (incoming.id !== currentPageId) return pages;
  const current = pages.find((page) => page.id === currentPageId);
  if (!current || incoming.updatedAt <= current.updatedAt) return pages;
  return pages.map((page) => page.id === currentPageId ? incoming : page);
}

export function captureWikiScrollAnchor(
  candidates: readonly WikiScrollCandidate[],
  viewportHeight: number,
  scrollTop: number,
): WikiScrollAnchor | null {
  const candidate = candidates.find((item) => item.bottom > 0 && item.top < viewportHeight && item.text);
  return candidate ? {
    tag: candidate.tag,
    text: candidate.text,
    offsetTop: candidate.top,
    scrollTop,
  } : null;
}

export function restoredWikiScrollTop(
  anchor: WikiScrollAnchor,
  candidates: readonly WikiScrollCandidate[],
  currentScrollTop: number,
) {
  const match = candidates
    .filter((candidate) => candidate.tag === anchor.tag && candidate.text === anchor.text)
    .sort((left, right) => Math.abs(left.top - anchor.offsetTop) - Math.abs(right.top - anchor.offsetTop))[0];
  if (!match) return Math.max(0, anchor.scrollTop);
  return Math.max(0, currentScrollTop + match.top - anchor.offsetTop);
}

export function normalizeWikiAnchorText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
}
