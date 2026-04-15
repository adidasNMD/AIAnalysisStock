import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CommandCenter } from './pages/CommandCenter';
import { OpportunityWorkbench } from './pages/OpportunityWorkbench';
import { MissionTimeline } from './pages/MissionTimeline';
import { MissionViewer } from './pages/MissionViewer';
import { TrendRadarHub } from './pages/TrendRadarHub';
import { TrendRadarRaw } from './pages/TrendRadarRaw';
import { Watchlist } from './pages/Watchlist';
import { Settings } from './pages/Settings';
import './index.css';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<OpportunityWorkbench />} />
          <Route path="/command-center" element={<CommandCenter />} />
          <Route path="/missions" element={<MissionTimeline />} />
          <Route path="/radar" element={<TrendRadarHub />} />
          <Route path="/radar-raw" element={<TrendRadarRaw />} />
          <Route path="/missions/:id" element={<MissionViewer />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
