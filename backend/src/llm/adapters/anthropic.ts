import { z } from 'zod';

import { LlmProviderError, type LlmGenerateRequest, type LlmGenerateResult, type LlmProvider } from '../provider';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const anthropicResponseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative()
  })
});

export interface AnthropicAdapterOptions {
  apiKey: string;
  model: string;
  fetcher?: typeof fetch;
  baseUrl?: string;
  providerId?: string;
}

export class AnthropicAdapter implements LlmProvider {
  readonly id: string;
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: AnthropicAdapterOptions) {
    this.id = options.providerId ?? 'anthropic';
    this.fetcher = options.fetcher ?? fetch;
    this.baseUrl = options.baseUrl ?? ANTHROPIC_API_URL;
  }

  async generate(request: LlmGenerateRequest): Promise<LlmGenerateResult> {
    const system =
      request.messages
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n\n') || undefined;
    const userMessages = request.messages
      .filter((message) => message.role === 'user')
      .map((message) => ({ role: 'user' as const, content: message.content }));

    let response: Response;
    try {
      response = await this.fetcher(this.baseUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.options.apiKey,
          'anthropic-version': ANTHROPIC_VERSION
        },
        body: JSON.stringify({
          model: this.options.model,
          max_tokens: request.maxOutputTokens,
          system,
          messages: userMessages
        })
      });
    } catch (error) {
      throw new LlmProviderError(
        this.id,
        'REQUEST_FAILED',
        true,
        `Anthropic request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (response.status === 429 || response.status === 529) {
      throw new LlmProviderError(this.id, 'RATE_LIMITED', true, `Anthropic returned HTTP ${response.status}.`);
    }
    if (!response.ok) {
      throw new LlmProviderError(this.id, 'REQUEST_FAILED', true, `Anthropic returned HTTP ${response.status}.`);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new LlmProviderError(this.id, 'INVALID_RESPONSE', true, 'Anthropic response body was not valid JSON.');
    }

    const parsed = anthropicResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new LlmProviderError(this.id, 'INVALID_RESPONSE', true, 'Anthropic response did not match the expected shape.');
    }

    const text = parsed.data.content.find((block) => block.type === 'text')?.text;
    if (!text) {
      throw new LlmProviderError(this.id, 'INVALID_RESPONSE', true, 'Anthropic response contained no text block.');
    }

    return {
      providerId: this.id,
      text,
      usage: {
        inputTokens: parsed.data.usage.input_tokens,
        outputTokens: parsed.data.usage.output_tokens
      }
    };
  }
}
