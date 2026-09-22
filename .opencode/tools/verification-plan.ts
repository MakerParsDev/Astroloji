import { tool } from "@opencode-ai/plugin"
export default tool({
  description: "Return deterministic Astroloji verification commands for a set of changed repository paths.",
  args: {
    paths: tool.schema.array(tool.schema.string()).describe("Repository-relative changed file paths"),
  },
  async execute({ paths }) {
    const p = paths.map((x) => x.replaceAll("\\", "/"))
    const android = p.some((x) => x.startsWith("Astroloji/"))
    const backend = p.some((x) => x.startsWith("backend/"))
    const workflows = p.some((x) => x.startsWith(".github/workflows/"))
    const ui = p.some((x) => /Astroloji\/.*(ui|screen|compose|theme)/i.test(x))
    const commands = [
      "node scripts/scan-secrets.mjs",
      "node --test scripts/*.test.mjs",
      "git diff --check",
    ]
    if (backend) commands.push(
      "cd backend && npm run build",
      "cd backend && npm test",
      "cd backend && npm run test:runtime",
    )
    if (android) commands.push(
      "cd Astroloji && ./gradlew :app:detekt :app:ktlintCheck :app:lintDebug :app:testDebugUnitTest",
      "cd Astroloji && ./gradlew :app:assembleDebug",
    )
    if (ui) commands.push(
      "cd Astroloji && ./gradlew :app:validateDebugScreenshotTest -Pandroid.experimental.enableScreenshotTest=true -Pandroid.sync.suppressAgpWarnings=UNSUPPORTED_PROJECT_OPTION_USE",
    )
    if (workflows) commands.push("actionlint .github/workflows/*.yml")
    return JSON.stringify({ android, backend, workflows, ui, commands }, null, 2)
  },
})
