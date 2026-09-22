import type { Plugin } from "@opencode-ai/plugin"
export const AstrolojiCompactionMemory: Plugin = async () => ({
  "experimental.session.compacting": async (_input, output) => {
    output.context.push(`
## Astroloji continuation contract
Preserve these facts across compaction:
- exact task objective and current status;
- current git branch/head and whether the working tree was dirty before this task;
- root-cause evidence and hypotheses already rejected;
- files changed and why;
- tests/linters/builds already executed with pass/fail results;
- exact dependency/platform documentation and versions consulted;
- security/privacy/release constraints discovered;
- review findings still unresolved;
- operations intentionally NOT performed (deploy, Play publish, remote D1, secret changes);
- next smallest deterministic verification step.
Never summarize away a known failing test or a production-safety constraint.
`)
  },
})
