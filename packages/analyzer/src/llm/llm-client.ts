/**
 * Common interface for LLM providers (Anthropic, OpenAI-compatible local models).
 */
export interface LlmGenerateOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Anthropic-only: cache the system prompt across calls. Ignored by other providers. */
  cacheSystemPrompt?: boolean;
}

export interface LlmClient {
  /** Generate a completion given system + user messages. */
  generate(system: string, user: string, options?: LlmGenerateOptions): Promise<string>;

  /** Whether this client is ready to use (API key set, endpoint reachable, etc.). */
  isAvailable(): boolean;

  /** The model name to use for synthesis (AG4). */
  get synthesisModel(): string;
}
