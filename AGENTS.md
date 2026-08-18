# Agent Notes

- The production service is `agent-kanban.service` and listens on port `3000`.
- The service runs the built Nitro server with Node because `better-sqlite3` is not supported by the Bun runtime here.
- Every AI task must run in its own persistent worktree under
  `.data/worktrees/<project-id>/<task-id>/tree`. New task branches start at the
  current `origin/master`; follow-up runs reuse the same task-owned worktree.
  Never execute an AI task in the main project tree.
- When a task is moved to Done, remove its worktree if it is clean and retain
  the local branch as a recovery point. Never force-remove a dirty worktree;
  defer cleanup and record the reason instead.
- Use the low-downtime production flow for normal changes: keep the current
  `agent-kanban.service` running, implement and validate in the task-owned
  worktree, integrate the verified commit into a clean `master`, run
  `bun run build` from `master` while the old Node process is still serving,
  and perform exactly one short `sudo systemctl restart agent-kanban` after a
  successful build. Verify the service and port `3000` immediately afterward.
- Only stop the service before development when `bun dev` is actually needed,
  because the development server must bind the production port:
  `sudo systemctl stop agent-kanban`
- Useful checks:
  `systemctl status agent-kanban --no-pager`
  `journalctl -u agent-kanban -f`
- Never restart production for an unverified or failed build.
- The service is enabled for boot with `systemctl enable agent-kanban`.
