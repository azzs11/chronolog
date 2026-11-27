/**
 * A minimal Model Context Protocol server over stdio (newline-delimited JSON-RPC 2.0): initialize,
 * tools/list and tools/call, which is all a tools-only server needs. Written by hand to avoid a
 * dependency for about 60 lines.
 */
import { type Fetcher, TOOLS } from './tools';

export const PROTOCOL_VERSION = '2025-06-18';
export const SERVER_INFO = { name: 'chronolog', version: '2.0.0' };

interface Request {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

type Response = { jsonrpc: '2.0'; id: number | string | null } & ({ result: unknown } | { error: { code: number; message: string } });

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

/** One JSON-RPC message in, at most one out (notifications get no reply). */
export async function handle(message: Request, get: Fetcher): Promise<Response | null> {
  if (message.id === undefined) return null;
  const id = message.id;
  const reply = (result: unknown): Response => ({ jsonrpc: '2.0', id, result });
  const fail = (code: number, text: string): Response => ({ jsonrpc: '2.0', id, error: { code, message: text } });
  switch (message.method) {
    case 'initialize':
      return reply({ protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === message.params?.name);
      if (!tool) return fail(INVALID_PARAMS, `Unknown tool: ${String(message.params?.name)}`);
      try {
        const text = await tool.run((message.params?.arguments as Record<string, unknown>) ?? {}, get);
        return reply({ content: [{ type: 'text', text }], isError: false });
      } catch (err) {
        return reply({ content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }], isError: true });
      }
    }
    default:
      return fail(METHOD_NOT_FOUND, `Method not found: ${message.method}`);
  }
}
