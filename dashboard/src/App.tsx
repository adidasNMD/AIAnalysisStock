import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import './styles/app-shell.css';

const CommandCenter = lazy(() => import('./pages/CommandCenter').then((module) => ({ default: module.CommandCenter })));
const OpportunityWorkbench = lazy(() => import('./pages/OpportunityWorkbench').then((module) => ({ default: module.OpportunityWorkbench })));
const MissionTimeline = lazy(() => import('./pages/MissionTimeline').then((module) => ({ default: module.MissionTimeline })));
const MissionViewer = lazy(() => import('./pages/MissionViewer').then((module) => ({ default: module.MissionViewer })));
const TrendRadarHub = lazy(() => import('./pages/TrendRadarHub').then((module) => ({ default: module.TrendRadarHub })));
const TrendRadarRaw = lazy(() => import('./pages/TrendRadarRaw').then((module) => ({ default: module.TrendRadarRaw })));
const EvidenceCenter = lazy(() => import('./pages/EvidenceCenter').then((module) => ({ default: module.EvidenceCenter })));
const CatalystReminders = lazy(() => import('./pages/CatalystReminders').then((module) => ({ default: module.CatalystReminders })));
const PreTradeAudit = lazy(() => import('./pages/PreTradeAudit').then((module) => ({ default: module.PreTradeAudit })));
const ReviewPlayback = lazy(() => import('./pages/ReviewPlayback').then((module) => ({ default: module.ReviewPlayback })));
const FieldRegistry = lazy(() => import('./pages/FieldRegistry').then((module) => ({ default: module.FieldRegistry })));
const Watchlist = lazy(() => import('./pages/Watchlist').then((module) => ({ default: module.Watchlist })));
const Settings = lazy(() => import('./pages/Settings').then((module) => ({ default: module.Settings })));

function LazyPage({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="page loading-state">加载页面...</div>}>
      {children}
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<LazyPage><OpportunityWorkbench /></LazyPage>} />
          <Route path="/command-center" element={<LazyPage><CommandCenter /></LazyPage>} />
          <Route path="/missions" element={<LazyPage><MissionTimeline /></LazyPage>} />
          <Route path="/radar" element={<LazyPage><TrendRadarHub /></LazyPage>} />
          <Route path="/radar-raw" element={<LazyPage><TrendRadarRaw /></LazyPage>} />
          <Route path="/evidence" element={<LazyPage><EvidenceCenter /></LazyPage>} />
          <Route path="/catalysts" element={<LazyPage><CatalystReminders /></LazyPage>} />
          <Route path="/pretrade" element={<LazyPage><PreTradeAudit /></LazyPage>} />
          <Route path="/review-playback" element={<LazyPage><ReviewPlayback /></LazyPage>} />
          <Route path="/field-registry" element={<LazyPage><FieldRegistry /></LazyPage>} />
          <Route path="/missions/:id" element={<LazyPage><MissionViewer /></LazyPage>} />
          <Route path="/watchlist" element={<LazyPage><Watchlist /></LazyPage>} />
          <Route path="/settings" element={<LazyPage><Settings /></LazyPage>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
