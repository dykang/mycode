import { z } from "zod"
import path from "node:path"

const identifier = z.string().regex(/^[a-z][a-z0-9-]*$/)
const common = {
  id: identifier,
  onSuccess: identifier.optional(),
  onFailure: identifier.optional(),
  maxVisits: z.number().int().min(1).max(20).default(3),
  timeoutMs: z.number().int().min(1).max(3_600_000).default(900_000),
}

export const Step = z.discriminatedUnion("type", [
  z.strictObject({
    ...common,
    type: z.literal("agent"),
    agent: z.string().min(1).default("build"),
    model: z
      .string()
      .regex(/^[^/\s]+\/.+/)
      .optional(),
    prompt: z.string().min(1),
    promise: z.string().min(1).optional(),
  }),
  z.strictObject({ ...common, type: z.literal("command"), command: z.array(z.string()).min(1) }),
])
export type Step = z.infer<typeof Step>

export const Workflow = z
  .strictObject({
    version: z.literal(1),
    name: identifier,
    start: identifier,
    maxSteps: z.number().int().min(1).max(100).default(20),
    steps: z.array(Step).min(1),
  })
  .superRefine((workflow, ctx) => {
    const ids = new Set(workflow.steps.map((step) => step.id))
    if (ids.size !== workflow.steps.length) ctx.addIssue({ code: "custom", message: "Duplicate step id" })
    if (!ids.has(workflow.start)) ctx.addIssue({ code: "custom", message: "Unknown start step" })
    workflow.steps.forEach((step) => {
      ;[step.onSuccess, step.onFailure].forEach((target) => {
        if (target && !ids.has(target))
          ctx.addIssue({ code: "custom", message: `${step.id}: unknown target ${target}` })
      })
      if (!step.onSuccess && step.type !== "command")
        ctx.addIssue({ code: "custom", message: `${step.id}: completion must end with a verification command` })
    })
    const reached = new Set<string>()
    const visit = (id: string) => {
      if (reached.has(id)) return
      reached.add(id)
      const step = workflow.steps.find((step) => step.id === id)
      if (step?.onSuccess) visit(step.onSuccess)
      if (step?.onFailure) visit(step.onFailure)
    }
    visit(workflow.start)
    workflow.steps.forEach((step) => {
      if (!reached.has(step.id)) ctx.addIssue({ code: "custom", message: `Unreachable step ${step.id}` })
    })
    if (!workflow.steps.some((step) => step.type === "command" && !step.onSuccess))
      ctx.addIssue({ code: "custom", message: "A terminal verification command is required" })
  })
export type Workflow = z.infer<typeof Workflow>

export async function loadWorkflow(file: string) {
  const text = await Bun.file(file).text()
  return Workflow.parse(file.endsWith(".json") ? JSON.parse(text) : Bun.YAML.parse(text))
}

export const PluginOptions = z.strictObject({
  memory: z.boolean().default(true),
  recallLimit: z.number().int().min(1).max(20).default(5),
  contextChars: z.number().int().min(256).max(32_000).default(6_000),
  prune: z.boolean().default(false),
  protectRecent: z.number().int().min(1).max(100).default(6),
})

export function stateDirectory(root: string) {
  return path.join(root, ".mycode")
}
