# Agent Notes

- The production service is `agent-kanban.service` and listens on port `3000`.
- The service runs the built Nitro server with Node because `better-sqlite3` is not supported by the Bun runtime here.
- Before active local development, stop the service if it is running so `bun dev` can bind the port:
  `sudo systemctl stop agent-kanban`
- Useful checks:
  `systemctl status agent-kanban --no-pager`
  `journalctl -u agent-kanban -f`
- After production changes, run `bun run build` and restart the service:
  `sudo systemctl restart agent-kanban`
- The service is enabled for boot with `systemctl enable agent-kanban`.
