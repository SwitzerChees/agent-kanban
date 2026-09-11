# AGENTKANBAN-30: Collaborative TODO lists

Implemented on 2026-09-11.

Project-scoped server-sent events invalidate TODO snapshots after committed list/item creation, editing, completion, reordering, and deletion. Reconnection reloads the current snapshot; disconnected clients and failed snapshot requests retry every five seconds while visible. Requests are cancelled and guarded against late responses on project changes and unmount. Snapshot updates preserve mounted item drafts and each list's local filter/collapse state.

The default **Aktuell / Current** filter includes all open items and items completed on the browser's local calendar day. It refreshes at midnight and when tab visibility changes, including daylight-saving transitions. Existing filters remain available. Repeated completion and edits preserve the original completion date; reopening clears it.

Editing captures the item's original revision. A changed or deleted remote item keeps the local draft visible and disables saving/deleting against the stale revision. The current text is shown for comparison and can explicitly replace the draft. Independent rows remain editable concurrently. Server revisions advance even when writes occur within the same millisecond.

## Verification

- Full Vitest suite: 49 files, 256 tests passed.
- Nuxt typecheck and production build passed.
- Regression tests cover local midnight, both daylight-saving transitions, completion dates, same-millisecond conflicts, project-scoped committed events, late snapshot responses, navigation/unmount cleanup, reconnect, disconnected polling, and retry after snapshot failure.
- Built Node server tested on port 3107 with an isolated SQLite database and two separate browser sessions (admin and project member).
- Both users edited different rows simultaneously; the other user's changes arrived without losing the open draft.
- Same-row conflict preserved the draft, displayed the latest text, and disabled stale saving. Remote deletion also retained the draft for copying.
- Creation, completion, reordering, and deletion synchronized across two different Wiki pages referencing the same list, including during page editing.
- Current hid yesterday's completed item and retained today's completed item; All restored the older item. German and English labels checked.
- Real HTTP stream checks: anonymous access returned 401, non-member access returned 403, member received ready and changed events after another user's mutation.
- Test server restart plus blocked network requests verified missed changes were recovered after reconnection without reloading the page.
- Desktop and 390px mobile browser inspection; no horizontal document overflow. Browser console checks were clean before the intentional connection interruption.
- Removed an existing unsupported aria-expanded attribute from TODO textareas found during the accessibility check. The final TODO accessibility scan passed with zero violations.

Production continues to use the existing single Node service. The event bus is process-local, matching that deployment. No database migration is required.
