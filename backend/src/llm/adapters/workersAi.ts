import { z } from 'zod';

import { LlmProviderError, type LlmGenerateRequest, type LlmGenerateResult, type LlmProvider } from '../provider';

/**
 * Narrow structural subset of Cloudflare's generated `Ai` binding class that
 * this adapter actually calls. `env.AI` satisfies this at the real call
 * site; tests inject a fake without needing the full generated type.
 */
export interface WorkersAiRunner {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

const workersAiOutputSchema = z.object({
  response: z.string(),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional()
    })
    .optional()
});

/** ~4 characters per token; used only when the model response omits a usage block. */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export class WorkersAiAdapter implements LlmProvider {
  readonly id: string;

  constructor(
    private readonly runner: WorkersAiRunner,
    private readonly model: string,
    providerId = 'workers-ai'
  ) {
    this.id = providerId;
  }

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResult> {
    let raw: unknown;
    try {
      raw = await this.runner.run(this.model, {
        messages: request.messages,
        max_tokens: request.maxOutputTokens
      });
    } catch (error) {
      throw new LlmProviderError(
        this.id,
        'REQUEST_FAILED',
        true,
        `Workers AI request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const parsed = workersAiOutputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new LlmProviderError(
        this.id,
        'INVALID_RESPONSE',
        true,
        'Workers AI returned an unexpected response shape.'
      );
    }

    const inputTokens =
      parsed.data.usage?.prompt_tokens ?? estimateTokens(request.messages.map((message) => message.content).join('\n'));
    const outputTokens = parsed.data.usage?.completion_tokens ?? estimateTokens(parsed.data.response);

    return {
      providerId: this.id,
      text: parsed.data.response,
      usage: { inputTokens, outputTokens }
    };
  }
}
