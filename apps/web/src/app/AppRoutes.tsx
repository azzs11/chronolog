import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import InboxView from '../features/incidents/InboxView';
import LiveView from '../features/live/LiveView';
import Shell from './Shell';

// Each view is loaded when it is opened. Live is the first screen, so it stays in the main chunk; the
// Playground (simulator, replay data) and the previous UI cost nothing until someone opens them.
const PlaygroundPage = lazy(() => import('../features/playground/PlaygroundPage'));
const RootRankView = lazy(() => import('../features/rootrank/RootRankView'));
const LegacyApp = lazy(() => import('../LegacyApp'));
const TownPage = lazy(() => import('../features/town/TownPage'));
const ReportCardPage = lazy(() => import('../features/report/ReportCardPage'));

const loading = <p className="p-6 text-text-muted">Loading…</p>;

/** Re-mounts the Arcade when ?tab= changes, so a palette command can switch games while it is open. */
function ArcadeRoute() {
  const { search } = useLocation();
  return <PlaygroundPage key={search} />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/incidents" replace />} />
        <Route path="incidents/:id?" element={<InboxView />} />
        <Route path="live" element={<LiveView />} />
        <Route path="town" element={<Suspense fallback={loading}><TownPage /></Suspense>} />
        <Route path="report" element={<Suspense fallback={loading}><ReportCardPage /></Suspense>} />
        <Route path="root-cause" element={<Suspense fallback={loading}><RootRankView /></Suspense>} />
        <Route path="playground" element={<Suspense fallback={loading}><ArcadeRoute /></Suspense>} />
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
