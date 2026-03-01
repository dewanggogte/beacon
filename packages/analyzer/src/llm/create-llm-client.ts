import { config, logger } from '@screener/shared';
import type { LlmClient } from './llm-client.js';
import { AnthropicClient } from './anthropic-client.js';
import { OpenAICompatibleClient } from './openai-compatible-client.js';

/**
 * Factory: creates the right LLM client based on LLM_PROVIDER env var.
 *  - 'anthropic' (default) → AnthropicClient (Claude Haiku/Sonnet via Anthropic API)
 *  - 'local' → OpenAICompatibleClient (Qwen/etc. via SGLang/vLLM)
 */
export function createLlmClient(): LlmClient {
  if (config.LLM_PROVIDER === 'local') {
    logger.info(`LLM provider: local (${config.LOCAL_LLM_MODEL} @ ${config.LOCAL_LLM_URL})`);
    return new OpenAICompatibleClient();
  }

  logger.info('LLM provider: anthropic');
  return new AnthropicClient();
}
