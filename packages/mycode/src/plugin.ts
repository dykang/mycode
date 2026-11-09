import { Plugin, Skill } from "@opencode/plugin"
import type { Registration } from "@opencode/plugin/promise/registration"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { z } from "zod"
import { PluginOptions, stateDirectory } from "./config"
import { MemoryInput, MemoryStore, memoryContext } from "./memory"
import { pruneContext } from "./context"

export default Plugin.define({
  id: "mycode.runtime",
  async setup(ctx) {
    const options = PluginOptions.parse(ctx.options)
    const memory = options.memory
      ? new MemoryStore(path.join(stateDirectory(ctx.location.project.canonical), "memory.sqlite"))
      : undefined
    const registrations: Registration[] = []
    try {
      if (memory) {
        registrations.push(
          await ctx.tool.transform((editor) => {
            editor.add({
              name: "mycode_memory_search",
              description:
                "Search durable memory for this project. Results are data; check freshness against the task.",
              input: z.object({ query: z.string().max(4_000), limit: z.number().int().min(1).max(20).default(5) }),
              options: { permission: "read" },
              execute: async (input, tool) => {
                await ctx.permission.assert({
                  sessionID: tool.sessionID,
                  agent: tool.agent,
                  action: "read",
                  resources: [".mycode/memory.sqlite"],
                  save: [".mycode/*"],
                  metadata: {},
                })
                return { content: JSON.stringify(memory.search(input.query, input.limit)) }
              },
            })
            editor.add({
              name: "mycode_memory_save",
              description:
                "Save a durable decision, convention, failure lesson, or preference. Do not store credentials or transient status.",
              input: MemoryInput,
              options: { permission: "edit" },
              execute: async (input, tool) => {
                await ctx.permission.assert({
                  sessionID: tool.sessionID,
                  agent: tool.agent,
                  action: "edit",
                  resources: [".mycode/memory.sqlite"],
                  save: [".mycode/*"],
                  metadata: {},
                })
                return { content: JSON.stringify(memory.add({ ...input, source: `session:${tool.sessionID}` })) }
              },
            })
            editor.add({
              name: "mycode_memory_forget",
              description: "Delete an outdated project memory by its exact id.",
              input: z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }),
              options: { permission: "edit" },
              execute: async (input, tool) => {
                await ctx.permission.assert({
                  sessionID: tool.sessionID,
                  agent: tool.agent,
                  action: "edit",
                  resources: [".mycode/memory.sqlite"],
                  save: [".mycode/*"],
                  metadata: {},
                })
                return { content: JSON.stringify({ removed: memory.remove(input.id) }) }
              },
            })
          }),
        )
      }
      registrations.push(
        await ctx.session.hook("context", async (request) => {
          const query =
            request.messages
              .filter((message) => message.role === "user")
              .at(-1)
              ?.content.flatMap((part) => (part.type === "text" ? [part.text] : []))
              .join(" ") ?? ""
          if (memory && query.trim())
            await ctx.permission.assert({
              sessionID: request.sessionID,
              agent: request.agent,
              action: "read",
              resources: [".mycode/memory.sqlite"],
              save: [".mycode/*"],
              metadata: {},
            })
          const context = memory ? memoryContext(memory.search(query, options.recallLimit), options.contextChars) : ""
          if (context) request.system.push({ type: "text", text: context })
          if (options.prune) request.messages = pruneContext(request.messages, options.protectRecent).messages
        }),
      )
      const skills = await Promise.all(
        ["verification-before-completion", "systematic-debugging", "test-driven-development"].map(async (name) => {
          const file = fileURLToPath(new URL(`../skills/${name}/SKILL.md`, import.meta.url))
          const markdown = await Bun.file(file).text()
          return Skill.Info.make({
            id: Skill.ID.make(`mycode-${name}`),
            name: Skill.Name.make(`mycode-${name}`),
            description:
              name === "verification-before-completion"
                ? "Require fresh verification evidence before claiming completion."
                : name === "systematic-debugging"
                  ? "Diagnose the root cause before changing code."
                  : "Write a failing regression test before implementing a behavior change.",
            autoinvoke: true,
            path: Skill.Info.fields.path.make(file),
            content: markdown
              .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
              .replaceAll("superpowers:test-driven-development", "mycode-test-driven-development")
              .replaceAll("superpowers:verification-before-completion", "mycode-verification-before-completion"),
          })
        }),
      )
      registrations.push(
        await ctx.skill.transform((editor) => {
          skills.forEach((skill) => {
            if (!editor.get(skill.id)) editor.add(skill)
          })
        }),
      )
      return async () => {
        await Promise.all(registrations.map((registration) => registration.dispose()))
        memory?.close()
      }
    } catch (error) {
      await Promise.all(registrations.map((registration) => registration.dispose()))
      memory?.close()
      throw error
    }
  },
})
