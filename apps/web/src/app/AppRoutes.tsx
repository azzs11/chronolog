import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import InboxView from '../features/incidents/InboxView';
import LiveView from '../features/live/LiveView';
import Shell from './Shell';

// Each view is loaded when it is opened. Live is the first screen, so it stays in the main chunk; the
// Playground (simulator, replay data) and the previous UI cost nothing until someone opens them.
const PlaygroundPage = lazy(() => import('../features/playground/PlaygroundPage'));
const RootRankView = lazy(() => import('../features/rootrank/RootRankView'));
const LegacyApp = lazy(() => import('../LegacyApp'));

const loading = <p className="p-6 text-text-muted">Loading…</p>;

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/incidents" replace />} />
        <Route path="incidents/:id?" element={<InboxView />} />
        <Route path="live" element={<LiveView />} />
        <Route path="root-cause" element={<Suspense fallback={loading}><RootRankView /></Suspense>} />
        <Route path="playground" element={<Suspense fallback={loading}><PlaygroundPage /></Suspense>} />
      </Route>
      <Route
        path="legacy"
        element={
          <Suspense fallback={loading}>
            <LegacyApp />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
