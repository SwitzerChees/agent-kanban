---
name: agent-kanban-control
description: Control an Agent Kanban instance through its HTTP API with a personal Bearer token. Use when an external agent harness needs to inspect boards, create or update tasks, move work through columns and topics, add comments or files, steer/refine tasks, or queue, cancel, and retry agent runs.
---

# Agent Kanban Control

Use Agent Kanban as the source of truth for projects, task placement, collaboration, and agent-run lifecycle. Authenticate as the user who supplied the personal token so every request retains that user's existing role and project access.

## Prepare access

1. Obtain the instance base URL and a personal token generated from **API tokens** in the Agent Kanban user menu.
2. Read `references/api.md` before making requests. Prefer the live OpenAPI document at `<base-url>/openapi.yaml` when available.
3. Send `Authorization: Bearer <token>` and `Accept: application/json` on every API request.
4. Keep the token out of commands that will be printed, task comments, logs, commits, and error messages. Prefer the harness's secret store or an environment variable such as `AGENT_KANBAN_TOKEN`.

## Operate the board

1. Call `GET /api/projects` to discover visible projects.
2. Call `GET /api/projects/{projectId}/board` before mutating work. Resolve column, parent-topic, sub-topic, swimlane, assignee, and tag IDs from this response; never guess identifiers.
3. Re-read `GET /api/tasks/{taskId}` before editing an existing task when stale state could overwrite another user's work.
4. Use `clientRequestId` when creating a task so a network retry cannot create a duplicate.
5. Use `PATCH /api/tasks/{taskId}` for task content and placement. Do not attempt to write `agentStatus` directly.
6. Use the explicit agent actions for lifecycle changes:
   - `POST /api/tasks/{taskId}/agent/queue`
   - `POST /api/tasks/{taskId}/agent/cancel`
   - `POST /api/tasks/{taskId}/agent/retry`
7. Read the returned task detail after every mutation and verify the intended state.

## Choose the right communication action

- Add a durable team comment with `POST /api/tasks/{taskId}/comments`.
- Send live guidance to a queued or running agent with `POST /api/tasks/{taskId}/messages`.
- Upload evidence with multipart `POST /api/tasks/{taskId}/attachments`.
- Use refinement endpoints when the user asks to elaborate a task before execution. Poll the refinement until it is completed or awaiting input, answer questions when needed, and apply only after reviewing the result.

## Apply safety rules

- Treat `401` as missing, invalid, expired, or revoked credentials. Ask for a new token; do not fall back to passwords.
- Treat `403` as a real role or project-membership boundary. Do not search for a bypass.
- Treat `409` as a state conflict. Re-fetch the board or task, explain the conflicting state, and retry only when the requested intent is still valid.
- Do not delete tasks, attachments, topics, users, or project membership unless the user explicitly requested that destructive change.
- Do not queue an agent merely because a task exists. Queue only when execution was requested or is clearly part of the active workflow.
- Do not expose server filesystem paths returned for projects to unrelated systems or users.

## Report results

Return the affected project key, task key, resulting column, and agent status. Mention any skipped or rejected action with the API error code and the state observed after re-fetching.
