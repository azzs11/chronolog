/**
 * Evidence-locked stories, measured: 30 simulated incidents (6 faults x 5 seeds), RootRank with the
 * true start, then a local model (Ollama) writes a story and the engine's checker verifies it.
 *
 * Usage: node storybench.js <ollama url> <model> <dev|test> [model seed]
 * stdout: one JSON object {model, cases: [...]}. A 'template' story (each fact restated, no model)
 * is checked too: it must pass 100%, which shows the checker does not reject correct sentences.
 *
 * Simulated, not real, incidents: real RCAEval lines carry no ids to cite. The numbers measure how
 * faithfully the model cites the facts it is given, not whether the ranking is right.
 */
import {
  buildStoryInput,
  checkStory,
  FAULT_KINDS,
  isObservable,
  rankRootCauses,
  ROOTRANK_V1,
  SERVICES,
  type StoryInput,
  simulateIncident,
  storyPrompt,
} from '@chronolog/engine';

const SEEDS_PER_FAULT = 5;
/** Seeds 1-5 were looked at while building the checker ('dev'); only 6-10 ('test') are reported. */
const FIRST_SEED = { dev: 1, test: 6 } as const;

interface OllamaReply {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

async function askModel(url: string, model: string, seed: number, input: StoryInput) {
  const { system, user } = storyPrompt(input);
  const started = performance.now();
  const res = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      options: { temperature: 0, seed },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as OllamaReply;
  return {
    reply: body.message?.content ?? '',
    seconds: Math.round(performance.now() - started) / 1000,
    promptTokens: body.prompt_eval_count ?? 0,
    outputTokens: body.eval_count ?? 0,
  };
}

function templateStory(input: StoryInput): string {
  const sentences = input.facts.map((f) => ({ text: `${f.service}: ${f.text}`, cites: [f.key] }));
  return JSON.stringify({ sentences });
}

async function main(): Promise<void> {
  const [url = 'http://localhost:11434', model = 'qwen2.5:3b', split = 'test', seedArg = '0'] = process.argv.slice(2);
  const modelSeed = Number(seedArg);
  const first = split === 'dev' ? FIRST_SEED.dev : FIRST_SEED.test;
  const cases = [];
  for (const fault of FAULT_KINDS) {
    const services = SERVICES.filter((s) => isObservable(s, fault));
    for (let seed = first; seed < first + SEEDS_PER_FAULT; seed++) {
      const service = services[(seed - first) % services.length] as (typeof SERVICES)[number];
      const incident = simulateIncident({ seed, service, fault });
      const ranked = rankRootCauses(incident.lines, incident.incidentStart, ROOTRANK_V1);
      const input = buildStoryInput(ranked);
      const asked = await askModel(url, model, modelSeed, input);
      const check = checkStory(asked.reply, input);
      const template = checkStory(templateStory(input), input);
      cases.push({
        id: `${fault}/${service}/${seed}`,
        facts: input.facts.length,
        reply: asked.reply,
        seconds: asked.seconds,
        promptTokens: asked.promptTokens,
        outputTokens: asked.outputTokens,
        isWellFormed: check.isWellFormed,
        stats: check.stats,
        dropped: check.dropped,
        kept: check.kept,
        template: template.stats,
      });
    }
  }
  process.stdout.write(`${JSON.stringify({ model, modelSeed, split, cases })}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
