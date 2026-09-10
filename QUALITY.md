# Project quality and external waits

Version `.agent-kanban-quality.json` in each project. Example:

```json
{"version":1,"pullRequest":true,"ciWorkflow":"ci.yml","deploymentWorkflow":"cd-test.yml","deploymentBranch":"master","browser":"on-request"}
```

The completion gate requires a clean task checkout matching the merged PR head,
then successful CI for that head and TEST deployment of its merge commit. A newer
TEST commit is accepted only after GitHub proves ancestry. Missing, cancelled,
failed or unavailable results cannot pass the gate. `browser: "required"` requires
successful structured browser-command evidence; prose and gate errors never count.
Projects without a policy retain the legacy AGENTS.md rules, including opt-in browser checks.

A CI/deployment wait captures its workflow, PR and commit in SQLite. The server
checks waiting workflows every 15 seconds without running an agent. A terminal
result resumes the task and is included in the continuation context and activity
log (`agent_wait_resumed`, `evidence`, `detectionDelayMs`). Pending runs remain
parked. API outages fall back to the requested timer; a 45-minute ceiling returns
control for diagnosis. Manual steering still wakes the task immediately. Observed
targets and results survive service restarts.

The repository CI verifies tests, types and a production build. Deployment retains
the AGENTS.md procedure: validate the task worktree, integrate through the PR,
build master while the old process serves, then restart `agent-kanban.service`
once and verify port 3000.

For That Easy, CI owns deterministic browser/HTTP integration on disposable data;
CD TEST owns deployment smokes and their credentials. Kanban consumes that CI/CD
evidence. Its manual E2E catalog keeps exploratory cases opt-in. Project commands
must call versioned repository scripts, and authenticated manual cases remain
disabled until a dedicated TEST credential channel is configured. Never copy
smoke implementations or put secrets in case definitions or agent prompts.
