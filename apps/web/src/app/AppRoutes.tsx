import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import InboxView from '../features/incidents/InboxView';
import LiveView from '../features/live/LiveView';
import Shell from './Shell';

// Each view is loaded when it is opened, so the Arcade (simulator, pixel font) and the other views cost
// nothing until someone opens them.
const ArcadePage = lazy(() => import('../features/arcade/ArcadePage'));
const Drills = lazy(() => import('../features/arcade/modes/Drills'));
const RootRankView = lazy(() => import('../features/rootrank/RootRankView'));
const TownPage = lazy(() => import('../features/town/TownPage'));
const ReportCardPage = lazy(() => import('../features/report/ReportCardPage'));

const loading = <p className="p-6 text-text-muted">Loading…</p>;

/** Re-mounts the Arcade when ?mode= changes, so a palette command can switch games while it is open. */
function ArcadeRoute() {
  const { search } = useLocation();
  const navigate = useNavigate();
  return <ArcadePage key={search} onOpenApp={(path) => navigate(path)} Team={Drills} />;
}

/** The Arcade used to be at /playground; old links (and their ?tab=) still work. */
function OldPlayground() {
  const { search } = useLocation();
  return <Navigate to={`/arcade${search}`} replace />;
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
        <Route path="arcade" element={<Suspense fallback={loading}><ArcadeRoute /></Suspense>} />
        <Route path="playground" element={<OldPlayground />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
