import { tool } from "@opencode-ai/plugin"
import { classifyAutonomousChange } from "../../scripts/autonomous-policy.mjs"

export default tool({
  description: "Classify Astroloji changed paths using the same deterministic policy as CI.",
  args: {
    paths: tool.schema.array(tool.schema.string()).describe("Repository-relative changed file paths"),
    totalChanges: tool.schema.number().optional().describe("Total added plus deleted lines when known"),
  },
  async execute({ paths, totalChanges }) {
    const result = classifyAutonomousChange({
      paths,
      totalChanges,
    })
    return JSON.stringify(result, null, 2)
  },
})
