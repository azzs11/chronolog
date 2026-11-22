import AppRoutes from './app/AppRoutes';
import { demoBackend } from './demo/instance';
import { installDemoBackend } from './demo/install';

// Before the first view mounts, so its first request already goes to the in-browser backend.
installDemoBackend(demoBackend);

/**
 * The static demo (built with VITE_DEMO=true): the full app, with every API call answered in the
 * visitor's browser by the engine running over simulated logs (see src/demo). No backend, no socket.
 */
export default function DemoApp() {
  return <AppRoutes />;
}
