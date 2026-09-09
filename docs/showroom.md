# Showroom

Showroom is the fourth project surface beside Board, Wiki and E2E. Existing projects
initialize their folder when first opened; newly created projects receive
`showroom/.gitkeep` immediately. The project folder is the repository root.

## Working with prototypes

- Direct subfolders of `showroom/` are categories. Nested folders may contain views and assets.
- Both `.html` and `.htm` files appear as views. Root-level HTML is also supported.
- Add files directly in the repository or use **Create view with agent**.
- Refresh discovers repository changes. A view and all its supported assets are
  captured together as an immutable, content-addressed snapshot in SQLite.
- Open a view to interact with its JavaScript, choose viewport width, or give
  whole-view, element-specific or rectangular-region feedback. Element selection
  can expand to a parent section; Escape returns to interaction.
- Feedback records the exact snapshot, HTML hash, author name and, if selected,
  the selector, text, document rectangle and viewport. Internal review can reopen
  the original snapshot after the repository changes.

Prototype JavaScript runs in an opaque-origin iframe. Inline code and local
relative CSS, scripts, ES modules, JSON, images, fonts, audio and video are allowed.
External dependencies, application API access, forms that send network requests,
cookies, persistent browser storage, embedded frames and top-level navigation are
not part of the prototype environment. Bundle dependencies locally and use
in-memory demo data. Category-scoped links can only load assets inside that category.

## External review

Create a named share link with all categories or one category, viewing-only or
comment permission, and a 7/30/90-day expiry (or no expiry). The raw secret link
is displayed **only at creation**; copy it then. The server stores only its SHA-256
hash, never a recoverable copy. Each link can be revoked independently.

Guests see only the showroom gallery and fullscreen prototype viewer at
`/s/:token`. Browsing requires no name. The first feedback submission asks for a
name, remembered locally by the browser; no account or login is created. Names
are self-reported, not verified. Guest feedback is visible only to project members,
not to other guests.

The link is a bearer capability: anyone who receives it can access its scope.
Revocation blocks subsequent gallery, asset and feedback requests, including
already-issued preview tokens. It cannot retract content already downloaded.
The guest gallery rechecks access every 30 seconds while its tab is visible.
Preview capabilities expire after two hours; close and refresh to renew them.

## Agent iterations and publication

Select open feedback for one view and one snapshot, or create a view directly.
Specify a new target such as `Startseite/home-v2.html`, a brief and an agent
harness. Create in Backlog for review or queue in To Do immediately.

The ordinary Kanban dispatcher owns execution, cancellation, retries, task
worktrees and status. A `showroom-source.json` task attachment contains the exact
snapshot as validated repository-relative paths with base64 file contents.
The task brief includes selected feedback and anchors. New versions use new
filenames and version-specific asset folders; older files must remain untouched.

After the agent completes, **Publish in showroom** imports the target HTML and
supporting assets from its task worktree. If the worktree was cleaned up, the
retained task branch is used. Publication:

1. Checks project membership, completed task status and every destination.
2. Imports only the target view and supporting files inside its category.
3. Rejects differing existing files and symlinks; never overwrites older versions.
4. Writes supporting assets before exposing the new HTML.

Files are added to the configured project repository without automatic commits,
merges or pushes. Include them in the project's normal Git workflow. The new view
is immediately discoverable through existing applicable share links.
Review it before marking feedback resolved; task completion does not automatically
resolve customer comments. Failed tasks remain accessible from Iterations for
normal Kanban retry/steering.

## Security and storage

Private endpoints require normal project membership. Share secrets never authenticate
normal project APIs. Preview URLs carry separate read-only capabilities, bound
to a snapshot and to either a share or a currently active project member.
Revocation and membership are checked on every asset request.

The preview response enforces CSP `sandbox allow-scripts` without
`allow-same-origin`, including when opened directly. Its resource CSP is
restricted to that preview capability's path. The host pages restrict frames to
their own origin. Typed, source-window-checked postMessage messages support the
selector; they cannot save feedback or invoke privileged actions. Null-origin
requests cannot access application endpoints.
See the [browser sandbox model](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox).

All preview and share responses are private/no-store with no-referrer and
noindex. Configure reverse-proxy/access logs to redact `/s/:token`,
`/api/showroom-shares/:token` and `/showroom-preview/:token` paths; URLs are secrets.
Application activity logs contain share IDs, never raw share tokens.

Limits: 2,000 supported files / 64 MiB per snapshot, 10 MiB per file, eight nested
folder levels, 512 MiB of deduplicated snapshot blobs per project, 100 active
shares and 10,000 feedback records. Public/API requests are rate-limited; request
bodies are limited by actual streamed byte count. Symlinks, hidden files, unsafe
paths and non-allowlisted file types are excluded.

SQLite backups include snapshots, blobs, feedback and iteration metadata.
Project import restores these records but revokes restored share links, so old
backups cannot resurrect revoked access. Ephemeral preview capabilities are not
restored. Project repository files remain governed by the existing backup policy.

## HTTP API

Project endpoints (normal session or personal token):

| Method | Path under `/api/projects/:id/showroom` | Action |
| --- | --- | --- |
| GET | `/` | Gallery, snapshot and read-only preview capability; optional `?snapshot=:id` |
| POST | `/categories` | Create category, `{name}` |
| GET / POST | `/shares` | List / create named scoped links |
| DELETE | `/shares/:id` | Revoke link; send `{}` body |
| GET / POST | `/feedback` | Internal inbox / add feedback |
| PATCH | `/feedback/:id` | Set `status: open | in_progress | resolved` |
| GET / POST | `/iterations` | List / create agent task |
| POST | `/iterations/:id/publish` | Publish completed result; send `{}` body |

Public endpoints: `GET /api/showroom-shares/:token` and
`POST /api/showroom-shares/:token/feedback`.
Asset endpoint: `GET /showroom-preview/:previewToken/:relativePath`.
Request schemas and shared response types are in `server/lib/showroom.ts` and
`shared/showroom.ts`.

## Validation

`bun run test tests/showroom.test.ts` covers library discovery, immutable assets,
path/symlink boundaries, membership, hash-only tokens, scoped shares, revocation,
expiry, guest identity/anchors, idempotency, real task creation and safe
publication from worktrees and retained branches.

`scripts/test-showroom-http.mjs` runs only against the dedicated local QA server
at 127.0.0.1:4317, with the documented test-only credentials and data directory
in its header. It exercises the built HTTP routes and seeds a separate browser
fixture. It must never point at production.
