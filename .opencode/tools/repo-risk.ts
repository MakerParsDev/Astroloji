import { tool } from "@opencode-ai/plugin"
const HIGH = [
  ".github/workflows/",
  "backend/migrations/",
  "backend/wrangler",
  "subscription",
  "billing",
  "admin",
  "auth",
  "rtdn",
  "ssv",
  "rate-limit",
  "secret",
  "release",
]
export default tool({
  description: "Classify Astroloji changed paths into low, medium, or high engineering risk without changing files.",
  args: {
    paths: tool.schema.array(tool.schema.string()).describe("Repository-relative changed file paths"),
  },
  async execute({ paths }) {
    const normalized = paths.map((p) => p.replaceAll("\\", "/").toLowerCase())
    const reasons: string[] = []
    for (const path of normalized) {
      for (const marker of HIGH) {
        if (path.includes(marker)) reasons.push(`${path}: sensitive marker '${marker}'`)
      }
    }
    const onlyDocs = normalized.length > 0 && normalized.every((p) =>
      p.endsWith(".md") || p.startsWith("docs/")
    )
    const android = normalized.some((p) => p.startsWith("astroloji/"))
    const backend = normalized.some((p) => p.startsWith("backend/"))
    const risk = reasons.length ? "high" : onlyDocs ? "low" : android && backend ? "high" : "medium"
    return JSON.stringify({ risk, android, backend, reasons: [...new Set(reasons)] }, null, 2)
  },
})
