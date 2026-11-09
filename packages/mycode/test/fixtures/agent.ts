// Deterministic OpenCode JSON protocol fixture. No model/network calls.
import { appendFile } from "node:fs/promises"
await appendFile("fixture-argv.jsonl", `${JSON.stringify(process.argv.slice(2))}\n`)
const prompt = process.argv.at(-1) ?? ""
console.log(
  JSON.stringify({
    type: "text",
    part: { text: prompt.includes("review-marker") ? "Reviewed\n<promise>APPROVED</promise>" : "Implemented the task" },
  }),
)
console.log(JSON.stringify({ type: "step_finish", part: {} }))
