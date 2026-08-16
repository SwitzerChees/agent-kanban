# Agent Kanban HTTP API

## Connection

Set a base URL without a trailing slash and supply a personal token generated in the Agent Kanban UI.

```sh
export AGENT_KANBAN_URL="https://kanban.example.com"
export AGENT_KANBAN_TOKEN="<secret>"
curl --fail-with-body \
  -H "Authorization: Bearer ${AGENT_KANBAN_TOKEN}" \
  -H "Accept: application/json" \
  "${AGENT_KANBAN_URL}/api/projects"
```

The token authenticates as its active owner and inherits the owner's `admin` or `member` role plus project memberships. The server exposes a machine-readable contract at `/openapi.yaml`.

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

Examples:

```sh
curl --fail-with-body -X POST \
  -H "Authorization: Bearer ${AGENT_KANBAN_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"body":"Acceptance checks passed."}' \
  "${AGENT_KANBAN_URL}/api/tasks/<task-id>/comments"

curl --fail-with-body -X POST \
  -H "Authorization: Bearer ${AGENT_KANBAN_TOKEN}" \
  -F "file=@./evidence.png" \
  "${AGENT_KANBAN_URL}/api/tasks/<task-id>/attachments"
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

On `409`, fetch the task or board again before deciding whether a retry still represents the user's intent.
