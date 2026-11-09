import { Rpc } from "@opencode/plugin/rpc"
import { z } from "zod"

export const MemoryInput = z.strictObject({
  content: z.string().trim().min(1).max(16_000),
  kind: z.enum(["decision", "convention", "failure", "preference"]).default("decision"),
  source: z.string().max(512).default("manual"),
})
export type MemoryInput = z.input<typeof MemoryInput>
export const MemoryEntry = z.object({
  id: z.string(),
  content: z.string(),
  kind: z.string(),
  source: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
})
export const StepView = z.object({
  id: z.string(),
  type: z.string(),
  agent: z.string().optional(),
  model: z.string().optional(),
  onSuccess: z.string().optional(),
  onFailure: z.string().optional(),
})
export const TraceStep = z.object({ step: z.string(), attempt: z.number(), ok: z.boolean(), exitCode: z.number() })
export const RunView = z.object({
  id: z.string(),
  task: z.string(),
  status: z.string(),
  next: z.string().optional(),
  attempts: z.number(),
  error: z.string().optional(),
  results: z.array(z.object({ step: z.string(), ok: z.boolean(), exitCode: z.number(), output: z.string() })),
  history: z.array(TraceStep),
})
export const Overview = z.object({
  root: z.string(),
  memories: z.array(MemoryEntry),
  workflow: z.object({ name: z.string(), maxSteps: z.number(), steps: z.array(StepView) }).nullable(),
  runs: z.array(RunView),
  prune: z.boolean(),
  skills: z.array(z.string()),
})
export type Overview = z.infer<typeof Overview>

/** Authenticated, location-scoped RPC used by explicit desktop actions; model writes use permission-checked tools. */
export const Control = Rpc.define({
  id: "mycode.runtime.control",
  methods: {
    overview: { input: z.object({ query: z.string().max(4_000).default("") }), output: Overview },
    save: { input: MemoryInput, output: MemoryEntry },
    forget: { input: z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }), output: z.boolean() },
    start: { input: z.object({ task: z.string().trim().min(1).max(16_000) }), output: z.string().uuid() },
    resume: { input: z.object({ id: z.string().uuid() }), output: z.string().uuid() },
    cancel: { input: z.object({ id: z.string().uuid() }), output: z.boolean() },
    pruning: { input: z.object({ enabled: z.boolean() }), output: z.boolean() },
  },
  events: {},
})
