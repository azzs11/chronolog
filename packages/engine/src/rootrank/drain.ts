/**
 * Drain log template mining (He et al., ICWS 2017), a port of drain3 0.9.x (MIT) with the
 * settings RootRank was trained with: depth 4, similarity threshold 0.4, 100 children, numeric
 * tokens as parameters, no cluster limit. Kept line-for-line close to the Python so the two
 * produce the same templates; tests/rootrank.parity.test.ts checks that on real logs.
 */

export const PARAM = '<*>';

export interface DrainOptions {
  depth: number;
  simThreshold: number;
  maxChildren: number;
}

/** The settings RootRank's trained model assumes. */
export const ROOTRANK_DRAIN: DrainOptions = { depth: 4, simThreshold: 0.4, maxChildren: 100 };

class Cluster {
  constructor(
    readonly id: number,
    public tokens: string[],
  ) {}
  template(): string {
    return this.tokens.join(' ');
  }
}

class Node {
  readonly children = new Map<string, Node>();
  clusterIds: number[] = [];
}

const hasDigit = (token: string): boolean => /\d/.test(token);

function tokenize(content: string): string[] {
  const trimmed = content.trim();
  return trimmed === '' ? [] : trimmed.split(/\s+/);
}

export class Drain {
  private readonly root = new Node();
  private readonly clusters = new Map<number, Cluster>();
  private readonly maxNodeDepth: number;
  private counter = 0;

  constructor(private readonly options: DrainOptions = ROOTRANK_DRAIN) {
    if (options.depth < 3) throw new Error('depth must be at least 3');
    this.maxNodeDepth = options.depth - 2;
  }

  /** Add a (masked) message; returns the id of the cluster it belongs to. */
  addMessage(content: string): number {
    const tokens = tokenize(content);
    const match = this.treeSearch(tokens);
    if (match === null) {
      const cluster = new Cluster(++this.counter, tokens);
      this.clusters.set(cluster.id, cluster);
      this.addToTree(cluster);
      return cluster.id;
    }
    match.tokens = match.tokens.map((token, i) => (token === tokens[i] ? token : PARAM));
    return match.id;
  }

  /** Final template text per cluster id. */
  templates(): Map<number, string> {
    return new Map([...this.clusters.values()].map((c) => [c.id, c.template()]));
  }

  private treeSearch(tokens: string[]): Cluster | null {
    const count = tokens.length;
    const first = this.root.children.get(String(count));
    if (first === undefined) return null;
    if (count === 0) return this.clusters.get(first.clusterIds[0] as number) ?? null;

    let node: Node = first;
    let depth = 1;
    for (const token of tokens) {
      if (depth >= this.maxNodeDepth || depth === count) break;
      const next = node.children.get(token) ?? node.children.get(PARAM);
      if (next === undefined) return null;
      node = next;
      depth++;
    }
    return this.fastMatch(node.clusterIds, tokens);
  }

  private fastMatch(clusterIds: number[], tokens: string[]): Cluster | null {
    let best: Cluster | null = null;
    let bestSim = -1;
    let bestParams = -1;
    for (const id of clusterIds) {
      const cluster = this.clusters.get(id);
      if (cluster === undefined) continue;
      const [sim, params] = distance(cluster.tokens, tokens);
      if (sim > bestSim || (sim === bestSim && params > bestParams)) {
        bestSim = sim;
        bestParams = params;
        best = cluster;
      }
    }
    return bestSim >= this.options.simThreshold ? best : null;
  }

  private addToTree(cluster: Cluster): void {
    const count = cluster.tokens.length;
    const key = String(count);
    let node: Node = this.root.children.get(key) ?? this.addChild(this.root, key);
    if (count === 0) {
      node.clusterIds = [cluster.id];
      return;
    }
    let depth = 1;
    for (const token of cluster.tokens) {
      if (depth >= this.maxNodeDepth || depth >= count) {
        node.clusterIds.push(cluster.id);
        break;
      }
      node = this.childFor(node, token);
      depth++;
    }
  }

  /** The child to descend into for a template token, creating it (or a wildcard) as Drain does. */
  private childFor(node: Node, token: string): Node {
    const existing = node.children.get(token);
    if (existing !== undefined) return existing;
    const wildcard = node.children.get(PARAM);
    const size = node.children.size;
    const max = this.options.maxChildren;
    if (hasDigit(token)) return wildcard ?? this.addChild(node, PARAM);
    if (wildcard !== undefined) return size < max ? this.addChild(node, token) : wildcard;
    if (size + 1 < max) return this.addChild(node, token);
    return this.addChild(node, PARAM);
  }

  private addChild(node: Node, key: string): Node {
    const child = new Node();
    node.children.set(key, child);
    return child;
  }
}

/** [similarity, wildcard count] of a log's tokens against a template; wildcards are not counted as matches. */
function distance(template: string[], tokens: string[]): [number, number] {
  if (template.length === 0) return [1.0, 0];
  let similar = 0;
  let params = 0;
  for (let i = 0; i < template.length; i++) {
    if (template[i] === PARAM) {
      params++;
    } else if (template[i] === tokens[i]) {
      similar++;
    }
  }
  return [similar / template.length, params];
}
