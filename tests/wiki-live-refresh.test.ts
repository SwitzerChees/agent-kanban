import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { captureWikiScrollAnchor, normalizeWikiAnchorText, replaceCurrentWikiPage, restoredWikiScrollTop } from '../utils/wiki-live-refresh';

describe('Wiki read-mode live refresh', () => {
  test('replaces only a newer current-page revision and preserves identity otherwise', () => {
    const pages = [
      { id: 'page-1', title: 'Current', updatedAt: '2026-09-02T10:00:00.000Z' },
      { id: 'page-2', title: 'Other', updatedAt: '2026-09-02T10:00:00.000Z' },
    ];

    expect(replaceCurrentWikiPage(pages, 'page-1', { ...pages[0]!, title: 'Same', updatedAt: pages[0]!.updatedAt })).toBe(pages);
    expect(replaceCurrentWikiPage(pages, 'page-1', { ...pages[0]!, title: 'Older', updatedAt: '2026-09-02T09:59:00.000Z' })).toBe(pages);
    expect(replaceCurrentWikiPage(pages, 'page-1', { ...pages[1]!, title: 'Wrong target', updatedAt: '2026-09-02T10:01:00.000Z' })).toBe(pages);

    const updated = replaceCurrentWikiPage(pages, 'page-1', {
      ...pages[0]!,
      title: 'Updated',
      updatedAt: '2026-09-02T10:01:00.000Z',
    });
    expect(updated).not.toBe(pages);
    expect(updated[0]).toMatchObject({ title: 'Updated' });
    expect(updated[1]).toBe(pages[1]);
  });

  test('keeps the first visible section at its viewport offset when content above changes', () => {
    const anchor = captureWikiScrollAnchor([
      { tag: 'h2', text: 'Above', top: -180, bottom: -140 },
      { tag: 'p', text: 'Current section', top: 36, bottom: 80 },
      { tag: 'p', text: 'Below', top: 120, bottom: 160 },
    ], 100, 640);

    expect(anchor).toEqual({ tag: 'p', text: 'Current section', offsetTop: 36, scrollTop: 640 });
    expect(restoredWikiScrollTop(anchor!, [
      { tag: 'p', text: 'Current section', top: 156, bottom: 200 },
    ], 640)).toBe(760);
  });

  test('falls back to the exact prior scrollTop when the visible section disappeared', () => {
    const anchor = { tag: 'p', text: 'Removed section', offsetTop: 20, scrollTop: 520 };
    expect(restoredWikiScrollTop(anchor, [{ tag: 'p', text: 'Replacement', top: 20, bottom: 60 }], 620)).toBe(520);
    expect(normalizeWikiAnchorText('  A\n  stable   section  ')).toBe('A stable section');
  });

  test('binds one cancellable polling lifecycle to the selected page and read mode', () => {
    const component = readFileSync(new URL('../components/ProjectWiki.vue', import.meta.url), 'utf8');
    expect(component).toContain('watch([selectedPageId, editing, loading]');
    expect(component).toContain('stopWikiPolling();');
    expect(component).toContain('wikiPollController?.abort()');
    expect(component).toContain('if (nextPages !== pages.value)');
    expect(component).toContain('ref="wikiDocument"');
    expect(component).toContain('/api/wiki-pages/${pageId}');
  });
});
