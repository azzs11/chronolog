#!/usr/bin/env node
/**
 * chronolog analyze <log files...> [--start <time>] [--json] [--top N]
 *
 * Ranks which service most likely caused an incident, from log files. Give one file per service
 * (the file name is the service) or JSON-lines files that carry a service field. Everything runs
 * on this machine; nothing is sent anywhere.
 */
import { readFileSync } from 'node:fs';
import {
  confidenceWord,
  evidenceSentences,
  rankRootCauses,
  ROOTRANK_V1,
  type RankResult,
  type RcaLine,
  WindowTooShortError,
} from '@chronolog/engine';
import { parseLog, serviceFromPath, toUnixSeconds } from './parse';

const DEFAULT_TOP = 5;
const USAGE = `Usage: chronolog analyze <log files...> [options]

Ranks which service most likely caused an incident, from log files.

  <log files>     one file per service (the file name is the service), or JSON-lines
                  files with a "service" field
  --start <time>  when the incident began: ISO time or Unix seconds. If left out, it is
                  estimated from the logs (less accurate).
  --top <n>       how many services to show (default ${DEFAULT_TOP})
  --json          print the full result as JSON
  --help          show this text

Times without a zone are read as UTC. Weights compare services with each other; they are
not probabilities.`;

export interface Options {
  files: string[];
  start?: number;
  top: number;
  json: boolean;
}

export class UsageError extends Error {}

export function parseArgs(argv: string[]): Options | 'help' {
  const options: Options = { files: [], top: DEFAULT_TOP, json: false };
  const args = [...argv];
  if (args[0] === 'analyze') args.shift();
  while (args.length > 0) {
    const arg = args.shift() as string;
    if (arg === '--help' || arg === '-h') return 'help';
    if (arg === '--json') options.json = true;
    else if (arg === '--start' || arg === '--top') {
      const value = args.shift();
      if (value === undefined) throw new UsageError(`${arg} needs a value`);
      if (arg === '--top') {
        options.top = Number(value);
        if (!Number.isInteger(options.top) || options.top < 1) throw new UsageError('--top must be a whole number of at least 1');
      } else {
        const start = toUnixSeconds(value);
        if (start === null) throw new UsageError(`--start is not a time: ${value}`);
        options.start = start;
      }
    } else if (arg.startsWith('--')) {
      throw new UsageError(`Unknown option ${arg}`);
    } else {
      options.files.push(arg);
    }
  }
  if (options.files.length === 0) throw new UsageError('Give at least one log file');
  return options;
}

export function loadLines(files: string[], read: (path: string) => string = (p) => readFileSync(p, 'utf8')): { lines: RcaLine[]; skipped: number } {
  const lines: RcaLine[] = [];
  let skipped = 0;
  for (const file of files) {
    const parsed = parseLog(read(file), serviceFromPath(file));
    lines.push(...parsed.lines);
    skipped += parsed.skipped;
  }
  return { lines, skipped };
}

export function formatReport(result: RankResult, top: number, skipped: number): string {
  const out: string[] = [];
  const when = new Date(result.incidentStart * 1000).toISOString();
  out.push(`Incident start: ${when} (${result.startSource === 'given' ? 'given' : 'estimated from the logs; pass --start for better accuracy'})`);
  out.push(`Compared ${result.incidentLines.toLocaleString('en-US')} lines after the start with ${result.baselineLines.toLocaleString('en-US')} before it.`);
  if (skipped > 0) out.push(`Skipped ${skipped} lines that were not log lines.`);
  out.push('');
  for (const cause of result.candidates.slice(0, top)) {
    out.push(`${cause.rank}. ${cause.service}   ${confidenceWord(cause.weight, cause.rank)}, ${cause.weight.toFixed(2)}`);
    for (const sentence of evidenceSentences(cause)) out.push(`     - ${sentence}`);
  }
  if (result.candidates.length > top) out.push(`\n(${result.candidates.length - top} more services not shown; use --top)`);
  out.push('\nWeights compare services with each other and are not probabilities.');
  return out.join('\n');
}

/** Run the CLI; returns the process exit code. `write` receives what would be printed. */
export function run(argv: string[], write: (text: string) => void, read?: (path: string) => string): number {
  try {
    const options = parseArgs(argv);
    if (options === 'help') {
      write(USAGE);
      return 0;
    }
    const { lines, skipped } = loadLines(options.files, read);
    if (lines.length === 0) throw new UsageError('No log lines found. Each line needs a time at its start, or be a JSON object.');
    const result = rankRootCauses(lines, options.start, ROOTRANK_V1);
    write(options.json ? JSON.stringify(result, null, 2) : formatReport(result, options.top, skipped));
    return 0;
  } catch (err) {
    if (err instanceof UsageError || err instanceof WindowTooShortError) {
      write(`${err.message}\n\n${USAGE}`);
      return 2;
    }
    write(`Error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = run(process.argv.slice(2), (text) => process.stdout.write(`${text}\n`));
}
