import { z } from 'zod';

import { LlmProviderError, type LlmGenerateRequest, type LlmGenerateResult, type LlmProvider } from '../provider';

/**
 * Covers every provider that speaks the OpenAI chat-completions wire format:
 * OpenAI itself, NVIDIA NIM, Groq, DeepSeek, Together, OpenRouter, Mistral.
 * Only `baseUrl` + `model` + `apiKey` differ between them.
 */
const openAiCompatibleResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable().optional() })
      })
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional()
    })
    .optional()
});

export interface OpenAiCompatibleAdapterOptions {
  /** Distinguishes this instance in fallback logs — e.g. "nvidia-nim", "groq", "deepseek". */
  providerId: string;
  apiKey: string;
  model: string;
  /** Base URL up to and including the version segment, e.g. "https://integrate.api.nvidia.com/v1". */
  baseUrl: string;
  fetcher?: typeof fetch;
}

/** ~4 characters per token; used only when the response omits a usage block. */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export class OpenAiCompatibleAdapter implements LlmProvider {
  readonly id: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: OpenAiCompatibleAdapterOptions) {
    this.id = options.providerId;
    this.fetcher = options.fetcher ?? fetch;
  }

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResult> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`
        },
        body: JSON.stringify({
          model: this.options.model,
          max_tokens: request.maxOutputTokens,
          messages: request.messages
        })
      });
    } catch (error) {
      throw new LlmProviderError(
        this.id,
        'REQUEST_FAILED',
        true,
        `${this.id} request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (response.status === 429) {
      throw new LlmProviderError(this.id, 'RATE_LIMITED', true, `${this.id} returned HTTP 429.`);
    }
    if (!response.ok) {
      throw new LlmProviderError(this.id, 'REQUEST_FAILED', true, `${this.id} returned HTTP ${response.status}.`);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new LlmProviderError(this.id, 'INVALID_RESPONSE', true, `${this.id} response body was not valid JSON.`);
    }

    const parsed = openAiCompatibleResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new LlmProviderError(this.id, 'INVALID_RESPONSE', true, `${this.id} response did not match the expected shape.`);
    }

    const text = parsed.data.choices[0]?.message.content;
    if (!text) {
      throw new LlmProviderError(this.id, 'INVALID_RESPONSE', true, `${this.id} response contained no message content.`);
    }

    const inputTokens =
      parsed.data.usage?.prompt_tokens ?? estimateTokens(request.messages.map((message) => message.content).join('\n'));
    const outputTokens = parsed.data.usage?.completion_tokens ?? estimateTokens(text);

    return {
      providerId: this.id,
      text,
      usage: { inputTokens, outputTokens }
    };
  }
}
