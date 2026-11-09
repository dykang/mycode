import { $ } from "bun"
import path from "node:path"

if (process.platform !== "darwin") throw new Error("DMG packaging requires macOS")
if (process.arch !== "arm64" && process.arch !== "x64") throw new Error("Unsupported Mac architecture")
const root = path.resolve(import.meta.dir, "../../..")
process.chdir(root)
process.env.OPENCODE_CHANNEL = "dev"
process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false"
if (!process.argv.includes("--skip-cli")) {
  await $`OPENCODE_TARGET=${process.arch === "x64" ? "darwin-x64-baseline" : "darwin-arm64"} bun run --cwd packages/cli script/build.ts --skip-install --skip-web-ui`
}
await $`bun run --cwd packages/mycode build`
process.env.OPENCODE_TARGET = `darwin-${process.arch}`
process.env.OPENCODE_DESKTOP_ENTRY = path.join(root, "packages/mycode/script/desktop-main.ts")
await $`bun run --cwd packages/desktop build`
await $`cd packages/desktop && bun x --bun electron-builder --mac dmg ${`--${process.arch}`} --publish never --config electron-builder.mycode.config.ts`
console.log(`DMG: ${path.join(root, "packages/desktop/dist", `MyCode-0.1.0-${process.arch}.dmg`)}`)
