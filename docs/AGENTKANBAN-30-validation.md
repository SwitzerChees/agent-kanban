# AGENTKANBAN-30: Collaborative TODO lists

Implemented on 2026-09-11.

Project-scoped TODO invalidations share the existing Wiki collaboration stream after committed list/item creation, editing, completion, reordering, and deletion. There is no separate TODO SSE connection. Reconnection reloads the current snapshot; disconnected clients and failed snapshot requests retry every five seconds while visible. Requests are cancelled and guarded against late responses on project changes and unmount. Snapshot updates preserve mounted item drafts and each list's local filter/collapse state.

All UI event streams use `PageEventSource`, which closes the underlying connection on pagehide/freeze and restores its listeners on pageshow/resume. Explicitly closed components stay closed. Chat reconnection uses its latest received event cursor. This prevents cached documents from retaining scarce HTTP/1 connections after navigation.

The default **Aktuell / Current** filter includes all open items and items completed on the browser's local calendar day. It refreshes at midnight and when tab visibility changes, including daylight-saving transitions. Existing filters remain available. Repeated completion and edits preserve the original completion date; reopening clears it.

Editing captures the item's original revision. A changed or deleted remote item keeps the local draft visible and disables saving/deleting against the stale revision. The current text is shown for comparison and can explicitly replace the draft. Independent rows remain editable concurrently. Server revisions advance even when writes occur within the same millisecond.

## Verification

- Full Vitest suite: 50 files, 261 tests passed.
- Nuxt typecheck and production build passed.
- Regression tests cover local midnight, both daylight-saving transitions, completion dates, same-millisecond conflicts, project-scoped committed events, late snapshot responses, navigation/unmount cleanup, reconnect, disconnected polling, and retry after snapshot failure.
- Built Node server tested on port 3107 with an isolated SQLite database and two separate browser sessions (admin and project member).
- Both users edited different rows simultaneously; the other user's changes arrived without losing the open draft.
- Same-row conflict preserved the draft, displayed the latest text, and disabled stale saving. Remote deletion also retained the draft for copying.
- Creation, completion, reordering, and deletion synchronized across two different Wiki pages referencing the same list, including during page editing.
- Current hid yesterday's completed item and retained today's completed item; All restored the older item. German and English labels checked.
- Project scoping, authorization, cross-page TODO invalidations, unsubscribe, and room disposal are covered by server tests.
- Test server restart plus blocked network requests verified missed changes were recovered after reconnection without reloading the page.
- Desktop and 390px mobile browser inspection; no horizontal document overflow. Browser console checks were clean before the intentional connection interruption.
- Removed an existing unsupported aria-expanded attribute from TODO textareas found during the accessibility check. The final TODO accessibility scan passed with zero violations.

Production continues to use the existing single Node service. The event bus is process-local, matching that deployment. No database migration is required.


## Follow-up: same-browser connection exhaustion

The initial browser check used two separate browser sessions and did not cover tabs sharing one connection pool. The reported freeze was reproduced on commit `853cef6` using two tabs in one Chromium session over HTTP/1.1. Six long-lived connections were open. A TODO PATCH stayed pending and the database text stayed unchanged; closing the first tab immediately released the save.

The repeatable regression script `scripts/test-wiki-todo-tabs.mjs` fails against that original built version at “save in second tab” after five seconds. Against the correction it keeps both tabs open and verifies:

- Repeated saves in both directions, with the other tab updating live.
- Independent drafts, same-item conflicts, and preservation of unsaved text.
- Navigation to another Wiki page sharing the same list, including page edit mode.
- Create, complete, reopen, reorder, and delete synchronization.
- Browser Back navigation followed by both sending and receiving updates.

The expanded test also reproduced retained event-stream connections after navigation; page lifecycle cleanup fixed that case. Successful saves in the corrected run completed in under 200 ms on the local QA server. All browser assertions use a five-second limit.

Run against an isolated built QA server (the script rejects port 3000 and non-loopback URLs):

```sh
KANBAN_QA_URL=http://127.0.0.1:3107 \
KANBAN_QA_EMAIL=your-qa-admin@example.com \
KANBAN_QA_PASSWORD=your-qa-password \
node scripts/test-wiki-todo-tabs.mjs
```

The script creates disposable fixtures and requires `agent-browser`. The [documented EventSource connection limit](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) and [browser page lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api) explain the observed behavior. The fix changes application connection management; it does not depend on enabling HTTP/2 in a proxy.
