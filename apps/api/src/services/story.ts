/**
 * An evidence-locked story for one incident: the engine builds numbered facts from the RootRank
 * result, the provider writes sentences, and the engine's checker keeps only verifiable ones.
 */
import { buildStoryInput, checkStory, type StoryCheck, storyPrompt } from '@chronolog/engine';
import { incidentDetail } from './incidents';
import { providerFromEnv, type StoryProvider } from './storyProvider';

export class StoriesOffError extends Error {}

export interface StoryResult extends Pick<StoryCheck, 'kept' | 'dropped' | 'isWellFormed'> {
  provider: string;
  seconds: number;
}

export function storyStatus(provider: StoryProvider | null = providerFromEnv()): { isEnabled: boolean; provider: string | null } {
  return { isEnabled: provider !== null, provider: provider?.id ?? null };
}

export async function incidentStory(id: string, provider: StoryProvider | null = providerFromEnv()): Promise<StoryResult> {
  if (!provider) throw new StoriesOffError('Stories are off. Set STORY_PROVIDER=ollama to turn them on.');
  const detail = await incidentDetail(id);
  const input = buildStoryInput(detail.ranking);
  const { system, user } = storyPrompt(input);
  const reply = await provider.generate(system, user);
  const check = checkStory(reply.text, input);
  return { provider: provider.id, seconds: reply.seconds, kept: check.kept, dropped: check.dropped, isWellFormed: check.isWellFormed };
}
