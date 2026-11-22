import { DemoBackend } from './backend';

/** The one simulated backend of a visit, shared by the axios adapter and the socket stand-in. */
export const demoBackend = new DemoBackend();
