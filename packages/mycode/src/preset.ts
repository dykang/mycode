import { Workflow } from "./config"

export function developmentWorkflow(command = ["bun", "run", "check"]) {
  return Workflow.parse({
    version: 1,
    name: "verified-development",
    start: "plan",
    maxSteps: 20,
    steps: [
      {
        id: "plan",
        type: "agent",
        agent: "plan",
        prompt:
          "Inspect the project and produce a concise implementation plan with acceptance criteria. Do not change files.",
        onSuccess: "implement",
      },
      {
        id: "implement",
        type: "agent",
        agent: "build",
        prompt:
          "Implement the task. Read previous verification and review failures, fix their root cause, and run relevant tests. Preserve unrelated user changes.",
        onSuccess: "verify",
      },
      { id: "verify", type: "command", command, onSuccess: "review", onFailure: "implement" },
      {
        id: "review",
        type: "agent",
        agent: "plan",
        prompt:
          "Review the actual working diff against the task and acceptance criteria. Check correctness, permissions and regression risks. Do not edit files. If no actionable issues remain, end with exactly <promise>APPROVED</promise>. Otherwise describe the issues and do not emit that marker.",
        promise: "APPROVED",
        onSuccess: "final-verify",
        onFailure: "implement",
      },
      { id: "final-verify", type: "command", command, onFailure: "implement" },
    ],
  })
}
