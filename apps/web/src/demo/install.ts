/**
 * Point the app's HTTP calls at the in-browser backend. Views keep calling axios exactly as they do
 * against the real API; only the transport changes, so the demo exercises the same view code.
 */
import axios, { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';
import type { DemoBackend } from './backend';

/** The simulator's test-incident button needs no admin key: there is nothing to protect. */
const DEMO_ADMIN_KEY = 'demo';

function parseBody(data: unknown): Record<string, unknown> {
  if (typeof data === 'string' && data !== '') {
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
}

export function demoAdapter(backend: DemoBackend): AxiosAdapter {
  return async (config) => {
    const url = new URL(config.url ?? '/', 'http://demo.invalid');
    for (const [key, value] of Object.entries((config.params ?? {}) as Record<string, unknown>)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const answer = backend.handle({ method: (config.method ?? 'get').toUpperCase(), path: url.pathname, query: url.searchParams, body: parseBody(config.data) });
    const response: AxiosResponse = { data: answer.body, status: answer.status, statusText: String(answer.status), headers: {}, config, request: {} };
    if (answer.status >= 400) {
      const message = (answer.body as { message?: string }).message ?? `Request failed with status ${answer.status}`;
      throw new AxiosError(message, AxiosError.ERR_BAD_REQUEST, config, {}, response);
    }
    return response;
  };
}

export function installDemoBackend(backend: DemoBackend): void {
  axios.defaults.adapter = demoAdapter(backend);
  try {
    sessionStorage.setItem('adminKey', DEMO_ADMIN_KEY);
  } catch {
    // storage blocked: the Root cause view will ask for a key, and any key works
  }
}
