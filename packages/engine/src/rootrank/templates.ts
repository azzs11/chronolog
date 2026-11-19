/**
 * Templates: a message with its numbers, ids, addresses and times masked, so that
 * "user 12 logged in" and "user 99 logged in" are the same template. Mirrors bench/templates.py.
 */
import { Drain, ROOTRANK_DRAIN } from './drain';

const WILDCARD = '<*>';

// Spring Boot prefix "<time> LEVEL pid --- [thread]": noise, and severity has its own field.
const SPRING_HEADER = /^\s*\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d[.,]?\d*\s+[A-Z]+\s+\d+\s+---\s+\[[^\]]*\]\s+/;

// Order matters: specific patterns run before the generic number rule.
const MASKS: readonly RegExp[] = [
  /\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:[.,]\d+)?(?:Z|[+-]\d\d:?\d\d)?/g,
  /\d\d\/[A-Za-z]{3}\/\d{4}:\d\d:\d\d:\d\d [+-]\d{4}/g,
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
  /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g,
  /\b0x[0-9a-fA-F]+\b/g,
  /\b[0-9a-fA-F]{12,}\b/g,
  /\d+(?:\.\d+)?/g,
];

/** Very long payloads only differ after their first tokens, so only the first tokens are kept. */
export const MAX_TEMPLATE_TOKENS = 40;

export function maskMessage(message: string): string {
  let text = message.replace(SPRING_HEADER, '');
  for (const pattern of MASKS) text = text.replace(pattern, WILDCARD);
  const tokens = text.split(/\s+/).filter((token) => token.length > 0);
  return tokens.slice(0, MAX_TEMPLATE_TOKENS).join(' ');
}

export interface TemplateTable {
  /** Template id for each input message, in order. */
  ids: number[];
  /** Final template text for every template id. */
  texts: Map<number, string>;
}

/**
 * Mine templates from messages that are already in time order. Each distinct masked message is
 * given to Drain once, in order of first appearance; later copies reuse its id. This is exactly
 * how the benchmark assigns templates, so the ids group lines identically.
 */
export function assignTemplates(messages: readonly string[]): TemplateTable {
  const drain = new Drain(ROOTRANK_DRAIN);
  const idOf = new Map<string, number>();
  const ids = messages.map((message) => {
    const masked = maskMessage(message);
    let id = idOf.get(masked);
    if (id === undefined) {
      id = drain.addMessage(masked);
      idOf.set(masked, id);
    }
    return id;
  });
  return { ids, texts: drain.templates() };
}
