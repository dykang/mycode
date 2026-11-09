import { $ } from "bun"
import { cp, mkdir, rm } from "node:fs/promises"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
process.chdir(root)
await rm("dist", { recursive: true, force: true })
await mkdir("dist/src", { recursive: true })
const result = await Bun.build({
  entrypoints: ["src/plugin.ts"],
  outdir: "dist/src",
  naming: "plugin.js",
  target: "bun",
  external: ["@opencode/plugin", "@opencode/plugin/*"],
  minify: true,
})
if (!result.success) throw new AggregateError(result.logs, "MyCode server bundle failed")
await $`bun x --bun vite build`
await cp("skills", "dist/skills", { recursive: true })
await cp("third-party", "dist/third-party", { recursive: true })
await cp("sources.json", "dist/sources.json")
await Bun.write(
  "dist/package.json",
  JSON.stringify(
    {
      name: "@mycode/runtime",
      version: "0.1.0",
      type: "module",
      license: "MIT",
      exports: {
        ".": "./src/plugin.js",
        "./server": "./src/plugin.js",
        "./gui-experimental": "./gui-experimental.cjs",
      },
    },
    null,
    2,
  ),
)
