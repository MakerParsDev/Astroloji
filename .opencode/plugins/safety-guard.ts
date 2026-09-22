import type { Plugin } from "@opencode-ai/plugin"
const sensitivePath = (raw: unknown) => {
  const value = String(raw ?? "").replaceAll("\\", "/").toLowerCase()
  if (!value) return false
  if (value.includes("example") || value.endsWith(".template")) return false
  return [
    "/.env",
    ".dev.vars",
    "google-services.json",
    "service-account",
    "play-service-account",
    "upload-keystore",
    ".jks",
    ".keystore",
    "/auth.json",
    "/mcp-auth.json",
    "doppler-secrets",
  ].some((part) => value.includes(part))
}
const blockedCommands: RegExp[] = [
  /\bgit\s+push\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\b/i,
  /\bgh\s+(secret|variable)\b/i,
  /\bgh\s+workflow\s+run\b.*(production|release|deploy|metadata)/i,
  /\bdoppler\b/i,
  /\bwrangler\s+deploy\b/i,
  /\bwrangler\b.*\bd1\b.*--remote\b/i,
  /\bnpm\s+run\s+deploy(?::doppler)?\b/i,
  /publishReleaseBundle/i,
  /promoteReleaseArtifact/i,
]
export const AstrolojiSafetyGuard: Plugin = async ({ client }) => ({
  "tool.execute.before": async (input, output) => {
    const args = (output as any).args ?? {}
    const tool = String((input as any).tool ?? "")
    if (tool === "read" && sensitivePath(args.filePath ?? args.path)) {
      throw new Error("Blocked: secret-bearing file is outside the AI trust boundary.")
    }
    if (["write", "edit", "apply_patch"].includes(tool) && sensitivePath(args.filePath ?? args.path)) {
      throw new Error("Blocked: AI may not create or edit secret-bearing files.")
    }
    if (tool === "bash") {
      const command = String(args.command ?? "")
      const match = blockedCommands.find((rule) => rule.test(command))
      if (match) throw new Error("Blocked: production/credential/VCS mutation is reserved for guarded repository workflows.")
    }
  },
  event: async ({ event }) => {
    if ((event as any).type === "session.error") {
      await client.app.log({
        body: {
          service: "astroloji-safety-guard",
          level: "warn",
          message: "OpenCode session error; production safety boundaries remain enforced.",
        },
      })
    }
  },
})
