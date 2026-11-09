import type { SessionContext } from "@opencode/plugin/promise/session"

/** Prune only repeated successful text results. Keep tool calls, IDs, errors and the recent window. */
export function pruneContext(messages: SessionContext["messages"], protectRecent = 6) {
  const seen = new Map<string, string>()
  const replacements = new Map<string, string>()
  const cutoff = Math.max(0, messages.length - protectRecent)
  for (let index = messages.length - 1; index >= 0; index--) {
    for (const part of messages[index].content) {
      if (part.type !== "tool-result" || part.providerExecuted || part.result.type !== "text") continue
      if (typeof part.result.value !== "string" || part.result.value.length < 256) continue
      const key = JSON.stringify([part.namespace, part.name, part.result.value])
      const newer = seen.get(key)
      if (newer && index < cutoff) replacements.set(part.id, newer)
      if (!newer) seen.set(key, part.id)
    }
  }
  return {
    count: replacements.size,
    messages: messages.map((message) => ({
      ...message,
      content: message.content.map((part) => {
        if (part.type !== "tool-result" || !replacements.has(part.id)) return part
        return {
          ...part,
          result: {
            type: "text" as const,
            value: `[Duplicate output; same as tool call ${replacements.get(part.id)}]`,
          },
        }
      }),
    })) as SessionContext["messages"],
  }
}
