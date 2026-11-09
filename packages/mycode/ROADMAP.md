# Next increments

The initial implementation is local memory + a sequential conditional workflow. This is the backlog, not shipped behavior.

1. Establish a reproducible evaluation set against the pinned upstream: accepted-task rate, verification failures,
   elapsed time, model cost and context size. Compare changes using the same tasks/models and preserve raw traces.
2. Add a model/provider adapter with explicit fallback policy and spend limits. Current roles use per-step models
   but do not estimate tokens or enforce currency budgets.
3. Add isolated worktrees and a dependency graph scheduler for safe parallel read-only work, then controlled write
   lanes. Keep sequential execution until repository mutation ownership is explicit.
4. Add memory revisions, TTL/freshness controls, optional semantic retrieval, export/import and opt-in synchronization.
   Retain project isolation and explicit capture as defaults.
5. Surface workflow graphs, current gate, costs and recovery actions in the TUI using native OpenCode components.
6. Compare the independent pruning policy against the context baseline, then consider additional policies. Any direct
   DCP or OmO integration needs a separately documented distribution/license decision.
7. Add evaluation-backed prompt/model changes with baseline comparison and rollback. The current harness does not
   self-modify its instructions or roll back repository changes automatically.

Before promoting this to a normal OpenCode release, test real provider sessions, plugin hot-reload/cleanup, denied
permissions, process-tree interruption, cross-platform native dependencies, and upstream compatibility.
