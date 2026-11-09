import { getConfig } from "./electron-builder.config"
import type { Configuration } from "electron-builder"

const base = getConfig()

export default {
  ...base,
  appId: "ai.dykang.mycode",
  productName: "MyCode",
  artifactName: "MyCode-${version}-${arch}.${ext}",
  extraMetadata: {
    ...base.extraMetadata,
    version: "0.1.0",
    name: "mycode-desktop",
    homepage: "https://github.com/dykang/mycode",
  },
  protocols: [],
  publish: null,
  extraResources: [
    ...(Array.isArray(base.extraResources) ? base.extraResources : base.extraResources ? [base.extraResources] : []),
    { from: "../mycode/dist", to: "plugins/mycode" },
    { from: "../../LICENSE", to: "licenses/OpenCode-LICENSE" },
    { from: "../mycode/THIRD_PARTY.md", to: "licenses/THIRD_PARTY.md" },
  ],
  mac: { ...base.mac, identity: null },
} satisfies Configuration
