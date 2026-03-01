import Anthropic from '@anthropic-ai/sdk';
import { logger } from '@screener/shared';
import type { LlmClient, LlmGenerateOptions } from './llm-client.js';

const DEFAULT_MODEL = 'claude-haiku-4-5';
const SYNTHESIS_MODEL = 'claude-sonnet-4-5';

export class AnthropicClient implements LlmClient {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  get synthesisModel(): string {
    return SYNTHESIS_MODEL;
  }

  /**
   * Generate a response with optional prompt caching.
   * System prompt is cached across companies for efficiency.
   */
  async generate(
    system: string,
    user: string,
    options: LlmGenerateOptions = {},
  ): Promise<string> {
    const {
      model = DEFAULT_MODEL,
      maxTokens = 1024,
      temperature = 0.3,
      cacheSystemPrompt = false,
    } = options;

    const systemContent: Anthropic.Messages.TextBlockParam[] = [{
      type: 'text' as const,
      text: system,
      ...(cacheSystemPrompt ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }];

    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemContent,
      messages: [{ role: 'user', content: user }],
    });

    const block = response.content[0];
    if (block?.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic API');
    }
    return block.text;
  }

  /** Simple generate without caching (backwards compatible). */
  async generateSimple(system: string, user: string, model?: string): Promise<string> {
    return this.generate(system, user, { model });
  }

  isAvailable(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  static get SYNTHESIS_MODEL() {
    return SYNTHESIS_MODEL;
  }
}
