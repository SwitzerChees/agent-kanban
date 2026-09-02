# Agent Kanban HTTP API

## Connection

Generate a personal token in the Agent Kanban UI, then configure the bundled helper once. It verifies the token with `GET /api/projects` before saving it:

```sh
python3 scripts/agent_kanban.py configure --base-url https://kanban.example.com
python3 scripts/agent_kanban.py status
python3 scripts/agent_kanban.py request GET /api/projects
```

The default shared config is `~/.config/agent-kanban/config.json` on Unix-like systems, with `XDG_CONFIG_HOME` respected when set, and `%APPDATA%/agent-kanban/config.json` on Windows. Set `AGENT_KANBAN_CONFIG` to choose another shared file. `AGENT_KANBAN_URL` and `AGENT_KANBAN_TOKEN` override individual stored values for a session.

The token authenticates as its active owner and inherits the owner's `admin` or `member` role plus project memberships. The helper never prints the token and only sends it to relative paths on the configured base URL. The server exposes a machine-readable contract at `/openapi.yaml`.

Pass JSON inline or from a file:

```sh
python3 scripts/agent_kanban.py request POST /api/tasks/<task-id>/comments \
  --json '{"body":"Acceptance checks passed."}'

python3 scripts/agent_kanban.py request PATCH /api/tasks/<task-id> \
  --json-file /path/to/task-update.json
```

For multipart attachment uploads, use a harness HTTP client that reads the same config without logging its token. Do not put the token directly in a `curl` command.

## Discovery and project operations

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/projects` | List projects visible to the user. |
| `GET` | `/api/projects/{projectId}/board` | Get project, columns, hierarchy, swimlanes, members, tags, and tasks. |
| `GET` | `/api/command-palette` | Get an authorized cross-project task/topic search index. |
| `POST` | `/api/projects` | Create a project; admin only. |
| `PATCH` | `/api/projects/{projectId}` | Update project details, full membership, or tags; admin only. |
| `POST` | `/api/projects/{projectId}/users` | Add one user to a project; admin only. |

Create a project with `name`, `key`, and `folderPath`. Optional fields are `description`, `userIds`, and `tags`. A project update accepts the same fields as a partial object; when supplied, `userIds` and `tags` replace the corresponding complete sets.

## Project Wiki

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/projects/{projectId}/wiki/pages` | Read the complete page tree with full Markdown content. |
| `POST` | `/api/projects/{projectId}/wiki/pages` | Create a root page or child page. |
| `GET` | `/api/wiki-pages/{pageId}` | Read one complete page and its current revision. |
| `PATCH` | `/api/wiki-pages/{pageId}` | Update title, Markdown content, parent, or raw position. |
| `POST` | `/api/wiki-pages/{pageId}/move` | Atomically reorder or reparent a page by zero-based sibling position. |
| `DELETE` | `/api/wiki-pages/{pageId}` | Delete a page only when it has no children. |
| `GET` | `/api/projects/{projectId}/wiki/todo-lists` | List reusable TODO lists with their ordered items. |
| `POST` | `/api/projects/{projectId}/wiki/todo-lists` | Create a project-local list with a case-insensitively unique `name`. |
| `POST` | `/api/wiki-todo-lists/{listId}/items` | Append an item with `text`. |
| `PATCH` | `/api/wiki-todo-items/{itemId}` | Update `text` and/or `completed`, optionally guarded by `expectedUpdatedAt`. |
| `GET` | `/api/wiki-pages/{pageId}/images` | List page-scoped image metadata, editable strokes, and comment pins. |
| `POST` | `/api/wiki-pages/{pageId}/images` | Upload one JPEG/PNG/WebP as multipart field `file`. |
| `GET` | `/api/wiki-images/{imageId}` | Stream the rendered image; add `?variant=source` for the preserved source. |
| `PATCH` | `/api/wiki-images/{imageId}/annotation` | Replace annotation data and rendered PNG with optimistic revision checking. |

Create with `title`, optional `content`, and optional `parentId`. Update only requested fields and pass the latest `updatedAt` as `expectedUpdatedAt`; a concurrent edit returns `409 wiki_page_stale`. For structural changes prefer the move endpoint:

```json
{
  "parentId": "<parent-page-uuid-or-null>",
  "position": 2,
  "expectedUpdatedAt": "2026-09-01T10:15:30.000Z"
}
```

`position` is zero-based among the target parent's children. The move is cycle-safe and returns both the moved `page` and the normalized complete `pages` tree. Preserve Markdown tables and task lists. Stored member references have the form `[@ id="<user-id>" label="<fallback-name>"]`; stored task references use `[@ id="<task-id>" label="<KEY · fallback-title>" char="#"]`; stored page references use `[@ id="<page-id>" label="<fallback-title>" char="page:"]` or the equivalent `char="seite:"`. IDs are stable and the UI resolves current names and titles. Use this markup everywhere a person, task, or Wiki page should be linked; raw `@Name`, `**Name:**`, `#KEY`, plain task keys, and Markdown links are not Wiki references. A linked checklist owner belongs on the same line, for example `- [ ] [@ id="<user-id>" label="<fallback-name>"]: Prepare the release`.

Reusable TODO lists are referenced from page Markdown as `:::todo-list {#<list-uuid> label="<fallback-name>"} :::`. The page stores only this stable list ID; items remain project-level records so a change appears in every page reference. Read the collection before an item mutation, send that item's current `updatedAt` as `expectedUpdatedAt`, and re-read it afterward. A completion update controls `completedAt`, which supports all/open/completed and recent-completion filters in the Wiki UI.

To generate tasks from a page, read that page and the board first, create each task with a unique stable `clientRequestId`, verify returned task keys, and update the source page only when explicitly requested.

Page Markdown stores a Wiki image only as `:::wiki-image {#<image-uuid> alt="<fallback-alt-text>"} :::`. The image record owns its current rendered URL, original source, editable drawing strokes, and comment pins, so never embed binary/base64 data in page Markdown. Annotation updates require `annotationData` (`version: 1`, normalized `strokes`, and non-empty `pins`) plus a rendered PNG data URL; pass the image's current `updatedAt` as `expectedUpdatedAt`.

## Task operations

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/projects/{projectId}/tasks` | Create a task with JSON or multipart data. |
| `GET` | `/api/tasks/{taskId}` | Get complete task detail and activity. |
| `PATCH` | `/api/tasks/{taskId}` | Update content, placement, responsibility, tags, or priority. |
| `DELETE` | `/api/tasks/{taskId}` | Permanently delete a non-running task. |

Create payload:

```json
{
  "title": "Verify the release",
  "description": "Run the acceptance checks and record evidence.",
  "columnId": "<column-uuid>",
  "oberthemaId": "<parent-topic-uuid>",
  "unterthemaId": "<sub-topic-uuid-or-null>",
  "swimlaneId": "<swimlane-uuid-or-null>",
  "assigneeId": "<user-uuid-or-null>",
  "agentEnabled": false,
  "priority": "high",
  "tags": ["release"],
  "clientRequestId": "harness-run-2026-08-16-001"
}
```

`title` is required. `priority` is one of `low`, `normal`, `high`, or `urgent`. If `columnId` is omitted, the task starts in Backlog. An agent-enabled task created in the To Do column is queued. Generate a stable, unique `clientRequestId` of 16–128 characters for every logical creation and reuse it only when retrying that same request.

Patch accepts: `title`, `description`, `columnId`, `oberthemaId`, `unterthemaId`, `swimlaneId`, `assigneeId`, `agentEnabled`, `priority`, `tags`, and `position`. It never accepts `agentStatus`.

## Agent lifecycle

| Method | Path | Result |
| --- | --- | --- |
| `POST` | `/api/tasks/{taskId}/agent/queue` | Enable the agent, move to To Do, and set status to `queued`. |
| `POST` | `/api/tasks/{taskId}/agent/cancel` | Stop a queued/running task, disable the agent, and return it to To Do as `idle`. |
| `POST` | `/api/tasks/{taskId}/agent/retry` | Requeue a failed or completed task. |

Agent statuses are `idle`, `queued`, `running`, `failed`, and `done`. Queue is idempotent for an already queued task. Queue/retry returns `409 task_agent_already_running` for a running task. Cancel returns `409 task_agent_not_cancelable` for completed or failed work.

## Collaboration and files

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/tasks/{taskId}/comments` | Add a team comment; body supports `mentionUserIds`. |
| `POST` | `/api/tasks/{taskId}/messages` | Send steering text while status is queued/running. |
| `POST` | `/api/tasks/{taskId}/attachments` | Add one or more multipart file parts. |
| `GET` | `/api/tasks/{taskId}/attachments/{attachmentId}` | Read a file; use `?download=1` or `?variant=annotated`. |
| `DELETE` | `/api/tasks/{taskId}/attachments/{attachmentId}` | Delete a non-locked attachment. |

JSON example:

```sh
python3 scripts/agent_kanban.py request POST /api/tasks/<task-id>/messages \
  --json '{"body":"Please verify the migration before continuing."}'
```

## Hierarchy

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/projects/{projectId}/oberthemen` | Create a parent topic. |
| `PATCH`, `DELETE` | `/api/oberthemen/{oberthemaId}` | Update or delete an empty parent topic. |
| `POST` | `/api/oberthemen/{oberthemaId}/unterthemen` | Create a sub-topic. |
| `PATCH`, `DELETE` | `/api/unterthemen/{unterthemaId}` | Move/update or delete an empty sub-topic. |
| `PATCH` | `/api/projects/{projectId}/hierarchy-order` | Replace the complete hierarchy order. |
| `POST` | `/api/projects/{projectId}/swimlanes` | Create a swimlane. |

Read the latest board before sending a full hierarchy order. Parent topic fields are `name`, `description`, `color`, and `position`; colors are `teal`, `coral`, `amber`, `indigo`, or `emerald`. Sub-topic fields are `name`, `description`, `position`, and optional `oberthemaId` when moving it.

## Refinements

| Method | Path | Purpose |
| --- | --- | --- |
| `GET`, `POST` | `/api/tasks/{taskId}/refinements` | List or start refinements. |
| `GET` | `/api/tasks/{taskId}/refinements/{refinementId}` | Poll one refinement. |
| `POST` | `/api/tasks/{taskId}/refinements/{refinementId}/answers` | Submit `{ "answers": { ... } }`. |
| `POST` | `/api/tasks/{taskId}/refinements/{refinementId}/apply` | Apply completed Markdown with `replace` or `append`. |

Creation accepts optional `brief` and `visualMode` (`auto`, `off`, or `force`). Apply accepts `mode`, `expectedTaskUpdatedAt`, optional reviewed `markdown`, and `allowDescriptionOverwrite`.

## User administration

Admin tokens can list/create users at `/api/users` and update/deactivate a user at `/api/users/{userId}`. Creation requires `email`, `name`, and a password of at least eight characters; `role` is `admin` or `member`. Do not manage users unless explicitly requested.

## Error handling

The HTTP status and `statusMessage` form the stable error signal:

- `400`: invalid input or a missing required board column.
- `401 unauthorized`: token missing, invalid, expired, or revoked.
- `403 admin_required` or `project_forbidden`: authorization boundary.
- `404`: referenced resource no longer exists.
- `409`: task lifecycle, stale state, duplicate name, or non-empty hierarchy conflict.

Wiki-specific conflicts include `409 wiki_page_stale` and `409 wiki_page_not_empty`; invalid parents or cycles return `400 invalid_wiki_parent` or `400 wiki_page_cycle`.

On `409`, fetch the task or board again before deciding whether a retry still represents the user's intent.
