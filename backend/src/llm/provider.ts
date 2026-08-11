export type LlmTaskType = 'daily_content' | 'deep_reading' | 'chat_consultation' | 'compatibility';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmGenerateRequest {
  taskType: LlmTaskType;
  messages: LlmMessage[];
  maxOutputTokens: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmGenerateResult {
  providerId: string;
  text: string;
  usage: LlmUsage;
}

export type LlmProviderErrorCode = 'REQUEST_FAILED' | 'INVALID_RESPONSE' | 'RATE_LIMITED' | 'TIMEOUT';

export class LlmProviderError extends Error {
  constructor(
    readonly providerId: string,
    readonly code: LlmProviderErrorCode,
    /** Whether the router should try the next provider in the fallback chain. */
    readonly retryable: boolean,
    message: string
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}

export interface LlmProvider {
  readonly id: string;
  generate(request: LlmGenerateRequest): Promise<LlmGenerateResult>;
}
