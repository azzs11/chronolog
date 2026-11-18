/** Entity extraction and overlap: shared resources hint at a causal relationship. */

export interface Entities {
  services: string[];
  ips: string[];
  ports: string[];
  paths: string[];
  errorCodes: string[];
}

export function extractEntities(message: string | undefined): Entities {
  const m = message || '';
  return {
    services: (
      m.match(/\b(database|redis|postgres|mongodb|mysql|api|auth|cache|payment|queue|elasticsearch|kafka|rabbitmq)\b/gi) || []
    ).map((s) => s.toLowerCase()),
    ips: m.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) || [],
    ports: (m.match(/(?:port\s*:?\s*|:)(\d{2,5})/gi) || []).map((p) => p.replace(/\D/g, '')),
    paths: m.match(/\/[a-zA-Z0-9/_-]{2,}/g) || [],
    errorCodes: m.match(/\b[45]\d{2}\b/g) || [],
  };
}

function entityList(e: Entities): string[] {
  return [...e.services, ...e.ips, ...e.ports, ...e.paths, ...e.errorCodes];
}

/** Jaccard similarity over all extracted entities. */
export function computeEntityOverlap(a: Entities, b: Entities): number {
  const setA = new Set(entityList(a));
  const setB = new Set(entityList(b));
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = [...setA].filter((e) => setB.has(e)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}
