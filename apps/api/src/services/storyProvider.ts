/**
 * Language-model providers for incident stories. OFF by default: the app works fully without one.
 * STORY_PROVIDER=ollama turns on a local model (free; nothing leaves the machine). Other providers
 * can implement StoryProvider; none is built in, so no key is ever needed.
 */
export interface StoryReply {
  text: string;
  seconds: number;
  promptTokens: number;
  outputTokens: number;
}

export interface StoryProvider {
  /** e.g. "ollama:qwen2.5:3b", stored with each story. */
  id: string;
  generate(system: string, user: string): Promise<StoryReply>;
}

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
/** Measured in bench/results/RESULTS-stories.md; another model has not been measured. */
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5:3b';
const STORY_TIMEOUT_MS = 60_000;

export function ollamaProvider(url: string, model: string): StoryProvider {
  return {
    id: `ollama:${model}`,
    async generate(system, user) {
      const started = Date.now();
      const res = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(STORY_TIMEOUT_MS),
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          options: { temperature: 0, seed: 0 },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`The story model answered ${res.status}.`);
      const body = (await res.json()) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
      return {
        text: body.message?.content ?? '',
        seconds: (Date.now() - started) / 1000,
        promptTokens: body.prompt_eval_count ?? 0,
        outputTokens: body.eval_count ?? 0,
      };
    },
  };
}

/** The provider named by the environment, or null when stories are off. */
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): StoryProvider | null {
  if ((env.STORY_PROVIDER ?? 'off').toLowerCase() !== 'ollama') return null;
  return ollamaProvider(env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL, env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL);
}
