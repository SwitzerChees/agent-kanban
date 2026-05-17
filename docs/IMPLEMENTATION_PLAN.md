# Implementation Plan

This project implements the Symphony service from `docs/SPEC.md` as a Nuxt application running on
Bun. Nuxt owns the operator dashboard and REST API. Nitro server code owns the long-running
orchestrator.

## Milestone 1: Runnable Operator Surface

- Add Bun/Nuxt project scaffolding.
- Start the dev server with `nuxt dev --host 0.0.0.0` so the dashboard is reachable on the LAN.
- Add a dashboard at `/`.
- Add JSON endpoints:
  - `GET /api/v1/state`
  - `GET /api/v1/:issue_identifier`
  - `POST /api/v1/refresh`

## Milestone 2: Core Symphony Runtime

- Load `WORKFLOW.md` with YAML front matter and Markdown prompt body.
- Resolve defaults, `$VAR` references, `~`, and relative workspace paths.
- Validate dispatch-critical config before every poll.
- Watch `WORKFLOW.md` and keep the last known good config on invalid reloads.
- Maintain one authoritative in-memory orchestrator state.

## Milestone 3: Tracker, Workspace, and Scheduling

- Implement Linear candidate fetch, terminal-state fetch, and state refresh through GraphQL.
- Normalize issues to the spec domain model.
- Implement workspace sanitization, root containment checks, and lifecycle hooks.
- Implement candidate sorting, active/terminal state checks, blocker checks, concurrency limits,
  retry queue handling, continuation retries, and stall reconciliation.

## Milestone 4: Codex App-Server Runner

- Launch `codex.command` with `bash -lc` in the per-issue workspace.
- Speak the local Codex app-server JSON-RPC line protocol.
- Initialize a thread, start turns, stream notifications, map approvals and unsupported tools, and
  emit structured events back to the orchestrator.
- Use the implementation posture documented in `WORKFLOW.md`: high-trust by default in this sample,
  with `approval_policy: never` and a danger-full-access sandbox. Production deployments should
  harden this.

## Milestone 5: Validation

- Unit-test workflow parsing, config resolution, strict prompt rendering, workspace safety, and
  dispatch helpers.
- Keep real Linear/Codex integration as an explicit operator smoke test because it needs credentials
  and can perform real work.
