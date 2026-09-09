type WikiPageInvalidation = (pageId: string) => void;

const listeners = new Set<WikiPageInvalidation>();

export function registerWikiPageInvalidation(listener: WikiPageInvalidation) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishWikiPageInvalidation(pageId: string) {
  for (const listener of listeners) listener(pageId);
}
