import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import PlaygroundPage from '../features/playground/PlaygroundPage';
import RootRankView from '../features/rootrank/RootRankView';
import Shell from './Shell';

// The previous UI is loaded only if someone opens it, so it costs the new UI nothing.
const LegacyApp = lazy(() => import('../LegacyApp'));

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/root-cause" replace />} />
        <Route path="root-cause" element={<RootRankView />} />
        <Route path="playground" element={<PlaygroundPage />} />
      </Route>
      <Route
        path="legacy"
        element={
          <Suspense fallback={<p className="p-6 text-text-muted">Loading…</p>}>
            <LegacyApp />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
