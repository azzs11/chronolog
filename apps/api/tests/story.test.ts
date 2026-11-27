import request from 'supertest';
import app from '../src/app';
import { incidentStory } from '../src/services/story';
import { providerFromEnv, type StoryProvider } from '../src/services/storyProvider';

process.env.ADMIN_API_KEY = 'test-admin-key';

async function firstIncidentId(): Promise<string> {
  const list = await request(app).get('/api/incidents');
  return (list.body.data as { id: string }[])[0]?.id as string;
}

describe('incident stories', () => {
  beforeAll(async () => {
    const injected = await request(app).post('/api/rca/incident').set({ 'X-API-Key': 'test-admin-key' }).send({ service: 'catalog', fault: 'disk', seed: 3 });
    expect(injected.status).toBe(201);
  });

  it('are off by default: status says so and the endpoint answers 503 story_off', async () => {
    expect(providerFromEnv({})).toBeNull();
    const status = await request(app).get('/api/incidents/story/status');
    expect(status.body.data).toEqual({ isEnabled: false, provider: null });
    const res = await request(app).post(`/api/incidents/${await firstIncidentId()}/story`);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('story_off');
  });

  it('keep only checked sentences, with real log ids, from a provider reply', async () => {
    const fake: StoryProvider = {
      id: 'fake',
      generate: async (_system, user) => {
        const fact = /E1 \[([a-z]+)\]/.exec(user);
        const service = fact?.[1] ?? 'catalog';
        const text = JSON.stringify({
          sentences: [
            { text: `${service} is the likely root cause.`, cites: ['E1'] },
            { text: 'Everything broke because of a bad deploy.', cites: ['E1'] },
          ],
        });
        return { text, seconds: 0.1, promptTokens: 10, outputTokens: 10 };
      },
    };
    const story = await incidentStory(await firstIncidentId(), fake);
    expect(story.kept).toHaveLength(1);
    expect(story.kept[0]?.logIds.length).toBeGreaterThan(0);
    expect(story.dropped).toHaveLength(1);
  });

  it('reads the Ollama provider from the environment', () => {
    expect(providerFromEnv({ STORY_PROVIDER: 'ollama' })?.id).toBe('ollama:qwen2.5:3b');
  });
});
