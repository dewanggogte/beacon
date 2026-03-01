import OpenAI from 'openai';
import { config, logger } from '@screener/shared';
import type { LlmClient, LlmGenerateOptions } from './llm-client.js';

/**
 * LLM client for OpenAI-compatible endpoints (SGLang, vLLM, Ollama, etc.).
 * Uses the official `openai` SDK pointed at a custom base URL.
 */
export class OpenAICompatibleClient implements LlmClient {
  private client: OpenAI;
  private modelName: string;

  constructor() {
    this.modelName = config.LOCAL_LLM_MODEL;
    this.client = new OpenAI({
      baseURL: config.LOCAL_LLM_URL + '/v1',
      apiKey: 'not-needed', // Local models don't require an API key
    });
  }

  get synthesisModel(): string {
    // Local endpoint serves a single model — synthesis uses the same one
    return this.modelName;
  }

  async generate(
    system: string,
    user: string,
    options: LlmGenerateOptions = {},
  ): Promise<string> {
    const {
      model: requestedModel,
      maxTokens = 1024,
      temperature = config.LOCAL_LLM_TEMPERATURE,
      // cacheSystemPrompt is Anthropic-only, silently ignored here
    } = options;

    // If caller passes a claude-* model name, remap to the local model.
    // This lets qualitative-analyzer pass model names without knowing the provider.
    const model = requestedModel?.startsWith('claude-')
      ? this.modelName
      : (requestedModel ?? this.modelName);

    // Use chat_template_kwargs to disable thinking for Qwen 3.5 / similar models
    // on SGLang. Without this, the model spends all its output tokens on a
    // "Thinking Process:" chain and never produces the actual JSON response.
    // Servers that don't support this field simply ignore it.
    const response = await this.client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      top_p: 0.8,
      presence_penalty: 1.5,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      // @ts-expect-error — SGLang-specific field, not in OpenAI types
      chat_template_kwargs: { enable_thinking: false },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      throw new Error('Empty response from local LLM');
    }

    // Safety net: if a thinking model still emits <think>...</think> blocks
    // (e.g., server ignores chat_template_kwargs), strip them.
    const thinkEnd = raw.lastIndexOf('</think>');
    if (thinkEnd !== -1) {
      return raw.slice(thinkEnd + '</think>'.length).trim();
    }
    return raw.trim();
  }

  isAvailable(): boolean {
    return config.LLM_PROVIDER === 'local';
  }
}
