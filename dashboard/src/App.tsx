import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import './index.css';
import './App.css';

const CommandCenter = lazy(() => import('./pages/CommandCenter').then((module) => ({ default: module.CommandCenter })));
const OpportunityWorkbench = lazy(() => import('./pages/OpportunityWorkbench').then((module) => ({ default: module.OpportunityWorkbench })));
const MissionTimeline = lazy(() => import('./pages/MissionTimeline').then((module) => ({ default: module.MissionTimeline })));
const MissionViewer = lazy(() => import('./pages/MissionViewer').then((module) => ({ default: module.MissionViewer })));
const TrendRadarHub = lazy(() => import('./pages/TrendRadarHub').then((module) => ({ default: module.TrendRadarHub })));
const TrendRadarRaw = lazy(() => import('./pages/TrendRadarRaw').then((module) => ({ default: module.TrendRadarRaw })));
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
