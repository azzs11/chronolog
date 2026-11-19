#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsageError = void 0;
exports.parseArgs = parseArgs;
exports.loadLines = loadLines;
exports.formatReport = formatReport;
exports.run = run;
/**
 * chronolog analyze <log files...> [--start <time>] [--json] [--top N]
 *
 * Ranks which service most likely caused an incident, from log files. Give one file per service
 * (the file name is the service) or JSON-lines files that carry a service field. Everything runs
 * on this machine; nothing is sent anywhere.
 */
const node_fs_1 = require("node:fs");
const engine_1 = require("@chronolog/engine");
const parse_1 = require("./parse");
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
class UsageError extends Error {
}
exports.UsageError = UsageError;
function parseArgs(argv) {
    const options = { files: [], top: DEFAULT_TOP, json: false };
    const args = [...argv];
    if (args[0] === 'analyze')
        args.shift();
    while (args.length > 0) {
        const arg = args.shift();
        if (arg === '--help' || arg === '-h')
            return 'help';
        if (arg === '--json')
            options.json = true;
        else if (arg === '--start' || arg === '--top') {
            const value = args.shift();
            if (value === undefined)
                throw new UsageError(`${arg} needs a value`);
            if (arg === '--top') {
                options.top = Number(value);
                if (!Number.isInteger(options.top) || options.top < 1)
                    throw new UsageError('--top must be a whole number of at least 1');
            }
            else {
                const start = (0, parse_1.toUnixSeconds)(value);
                if (start === null)
                    throw new UsageError(`--start is not a time: ${value}`);
                options.start = start;
            }
        }
        else if (arg.startsWith('--')) {
            throw new UsageError(`Unknown option ${arg}`);
        }
        else {
            options.files.push(arg);
        }
    }
    if (options.files.length === 0)
        throw new UsageError('Give at least one log file');
    return options;
}
function loadLines(files, read = (p) => (0, node_fs_1.readFileSync)(p, 'utf8')) {
    const lines = [];
    let skipped = 0;
    for (const file of files) {
        const parsed = (0, parse_1.parseLog)(read(file), (0, parse_1.serviceFromPath)(file));
        lines.push(...parsed.lines);
        skipped += parsed.skipped;
    }
    return { lines, skipped };
}
function formatReport(result, top, skipped) {
    const out = [];
    const when = new Date(result.incidentStart * 1000).toISOString();
    out.push(`Incident start: ${when} (${result.startSource === 'given' ? 'given' : 'estimated from the logs; pass --start for better accuracy'})`);
    out.push(`Compared ${result.incidentLines.toLocaleString('en-US')} lines after the start with ${result.baselineLines.toLocaleString('en-US')} before it.`);
    if (skipped > 0)
        out.push(`Skipped ${skipped} lines that were not log lines.`);
    out.push('');
    for (const cause of result.candidates.slice(0, top)) {
        out.push(`${cause.rank}. ${cause.service}   ${(0, engine_1.confidenceWord)(cause.weight)}, ${cause.weight.toFixed(2)}`);
        for (const sentence of (0, engine_1.evidenceSentences)(cause))
            out.push(`     - ${sentence}`);
    }
    if (result.candidates.length > top)
        out.push(`\n(${result.candidates.length - top} more services not shown; use --top)`);
    out.push('\nWeights compare services with each other and are not probabilities.');
    return out.join('\n');
}
/** Run the CLI; returns the process exit code. `write` receives what would be printed. */
function run(argv, write, read) {
    try {
        const options = parseArgs(argv);
        if (options === 'help') {
            write(USAGE);
            return 0;
        }
        const { lines, skipped } = loadLines(options.files, read);
        if (lines.length === 0)
            throw new UsageError('No log lines found. Each line needs a time at its start, or be a JSON object.');
        const result = (0, engine_1.rankRootCauses)(lines, options.start, engine_1.ROOTRANK_V1);
        write(options.json ? JSON.stringify(result, null, 2) : formatReport(result, options.top, skipped));
        return 0;
    }
    catch (err) {
        if (err instanceof UsageError || err instanceof engine_1.WindowTooShortError) {
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
