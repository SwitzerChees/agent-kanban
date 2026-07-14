---
polling:
  interval_ms: 30000
workspace:
  root: ./symphony_workspaces
agent:
  max_concurrent_agents: 2
  max_turns: 3
  max_retry_backoff_ms: 300000
codex:
  command: codex app-server
  model: gpt-5.6-sol
  reasoning_effort: xhigh
  approval_policy: never
  thread_sandbox: danger-full-access
  turn_sandbox_policy:
    type: dangerFullAccess
  turn_timeout_ms: 3600000
  read_timeout_ms: 5000
  stall_timeout_ms: 300000
server:
  port: 3000
---
# Local Kanban Codex Workflow

You are working on a local Kanban task in a project folder managed by Agent Kanban.

Task: {{ issue.identifier }} - {{ issue.title }}
Column: {{ issue.state }}
Priority: {{ issue.priority | default: "unknown" }}

Description:
{{ issue.description | default: "No description provided." }}

Rules:
- Work only inside the project folder that was supplied as the Codex working directory.
- Keep changes focused on the task.
- Run relevant validation before handing off.
- Do not depend on Linear or any external issue tracker.
- Finish with a concise summary of what changed and what was validated.
