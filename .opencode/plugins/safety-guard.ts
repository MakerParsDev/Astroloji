import type { Plugin } from "@opencode-ai/plugin"

const normalizedPath = (raw: unknown) =>
  String(raw ?? "").replaceAll("\\", "/").toLowerCase()

const safeTemplatePath = (value: string) =>
  /(^|\/)(?:google-services|firebase-auth-config)\.example\.json$/.test(value) ||
  /(^|\/)(?:\.env|\.dev\.vars)\.example$/.test(value) ||
  value.endsWith(".template")

const sensitivePath = (raw: unknown) => {
  const value = normalizedPath(raw)
  if (!value) return false
  if (safeTemplatePath(value)) return false

  return [
    /(^|\/)\.env(?:\.|$)/,
    /(^|\/)\.dev\.vars(?:\.|$)/,
    /(^|\/)google-services\.json$/,
    /(^|\/)firebase-auth-config(?:-backup)?\.json$/,
    /(^|\/)(?:auth|mcp-auth)\.json$/,
    /service-account/,
    /play-service-account/,
    /upload-keystore/,
    /\.jks$/,
    /\.keystore$/,
    /doppler-secrets/,
  ].some((rule) => rule.test(value))
}

const blockedCommands: RegExp[] = [
  /\bgit\s+(?:push|commit|add|checkout|switch|reset|clean|merge|rebase|cherry-pick|tag|stash|restore|apply)\b/i,
  /\bgit\s+difftool\b/i,
  /\bgit\s+(?:diff|show|log)\b.*(?:--ext-diff|--textconv)\b/i,
  /\bgit\s+grep\b.*(?:--no-index|--untracked|--no-exclude-standard)\b/i,
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

const grepOutputContainsSensitivePath = (raw: unknown) => {
  for (const line of String(raw ?? "").split(/\r?\n/)) {
    if (!line || /^\s/.test(line) || !line.endsWith(":")) continue
    const candidate = line.slice(0, -1)
    if (sensitivePath(candidate)) return true
  }
  return false
}

export const AstrolojiSafetyGuard: Plugin = async ({ client }) => ({
  "tool.execute.before": async (input, output) => {
    const args = (output as any).args ?? {}
    const tool = String((input as any).tool ?? "")

    if (tool === "read" && sensitivePath(args.filePath ?? args.path)) {
      throw new Error("Blocked: secret-bearing file is outside the AI trust boundary.")
    }

    if (tool === "grep" && [args.path, args.include].some(sensitivePath)) {
      throw new Error("Blocked: grep may not target a secret-bearing path or include pattern.")
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
  "tool.execute.after": async (input, output) => {
    if (String((input as any).tool ?? "") !== "grep") return
    if (!grepOutputContainsSensitivePath((output as any).output)) return

    ;(output as any).title = "Blocked sensitive grep result"
    ;(output as any).output = "Blocked: grep matched a secret-bearing path outside the AI trust boundary."
    ;(output as any).metadata = {
      ...((output as any).metadata ?? {}),
      matches: 0,
      truncated: false,
      blockedSensitivePath: true,
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
