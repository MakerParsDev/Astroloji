import type { Plugin } from "@opencode-ai/plugin"

const sensitivePath = (raw: unknown) => {
  const value = String(raw ?? "").replaceAll("\\", "/").toLowerCase()
  if (!value) return false
  if (value.includes("example") || value.endsWith(".template")) return false
  return [
    "/.env",
    ".dev.vars",
    "google-services.json",
    "firebase-auth-config.json",
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
  /\bgit\s+(?:push|commit|add|checkout|switch|reset|clean|merge|rebase|cherry-pick|tag|stash|restore|apply)\b/i,
  /\bgit\s+difftool\b/i,
  /\bgit\s+(?:diff|show|log)\b.*(?:--ext-diff|--textconv)\b/i,
  /\b--extcmd(?:=|\s)/i,
  /\bgit\s+branch\b(?!\s+--show-current\b)/i,
  /\bgh\s+(?:secret|variable|workflow\s+run|release)\b/i,
  /\bgh\s+pr\s+(?:create|edit|merge|close|reopen)\b/i,
  /\bgh\s+issue\s+(?:create|edit|close|reopen)\b/i,
  /\bgh\s+api\b.*(?:-X|--method)\s*(?:POST|PUT|PATCH|DELETE)\b/i,
  /\bdoppler\b/i,
  /\bwrangler\s+(?:deploy|secret|d1|r2|kv)\b/i,
  /\bnpm\s+run\s+(?:deploy|seed|schema:apply|doppler|transition:)/i,
  /(?:^|\s)(?:bash|sh)\s+-c\b/i,
  /(?:^|\s)(?:pwsh|powershell)\b.*(?:-c|-command)\b/i,
  /(?:^|\s)cmd(?:\.exe)?\s+\/c\b/i,
  /(?:^|\s)node\s+-e\b/i,
  /(?:^|\s)python(?:3)?\s+-c\b/i,
  /(?:gradlew|gradlew\.bat).*\b(?:publish|promote|upload)\w*/i,
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
      if (blockedCommands.some((rule) => rule.test(command))) {
        throw new Error("Blocked: mutation or credential-capable shell command is reserved for guarded workflows.")
      }
    }
  },
  event: async ({ event }) => {
    if ((event as any).type === "session.error") {
      await client.app.log({
        body: {
          service: "astroloji-safety-guard",
          level: "warn",
          message: "OpenCode session error; repository safety boundaries remain enforced.",
        },
      })
    }
  },
})
