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
- Before active local development, stop the service if it is running so `bun dev` can bind the port:
  `sudo systemctl stop agent-kanban`
- Useful checks:
  `systemctl status agent-kanban --no-pager`
  `journalctl -u agent-kanban -f`
- After production changes, run `bun run build` and restart the service:
  `sudo systemctl restart agent-kanban`
- The service is enabled for boot with `systemctl enable agent-kanban`.
