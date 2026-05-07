import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useApp } from './stores/appStore';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { LoadingScreen } from './components/LoadingScreen';
import { OnboardingTutorial, hasSeenOnboarding } from './components/OnboardingTutorial';
import { UpdateToast } from './components/UpdateToast';
import { HomePage } from './pages/HomePage';
import { LibraryPage } from './pages/LibraryPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { ThumbnailPage } from './pages/ThumbnailPage';
import { HelpPage } from './pages/HelpPage';
import * as sounds from './lib/sounds';

const SPLASH_MS = 1200;

export default function App() {
  const loadProjects = useApp((s) => s.loadProjects);
  const refreshHealth = useApp((s) => s.refreshHealth);
  const loadAppDefaults = useApp((s) => s.loadAppDefaults);
  const [splash, setSplash] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    loadProjects();
    refreshHealth();
    loadAppDefaults();
    const t = setTimeout(() => {
      setSplash(false);
      // App-Start-Sound triggern NACH Splash (sonst wird AudioContext evtl. von Browser blockiert)
      try { sounds.appStart(); } catch {}
      // Onboarding nur beim ersten Launch (localStorage-Flag)
      if (!hasSeenOnboarding()) setShowOnboarding(true);
    }, SPLASH_MS);
    return () => clearTimeout(t);
  }, [loadProjects, refreshHealth, loadAppDefaults]);

  if (splash) return <LoadingScreen />;

  return (
    <HashRouter>
      <div className="h-screen flex flex-col bg-fiano-black text-fiano-white">
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <main className="flex-1 overflow-hidden flex flex-col">
            <RouteFader />
          </main>
        </div>
        <StatusBar />
        {showOnboarding && <OnboardingTutorial onClose={() => setShowOnboarding(false)} />}
        <UpdateToast />
      </div>
    </HashRouter>
  );
}

/**
 * Wrapper für Routes, der bei jedem Pfadwechsel ein dezentes fade-in triggert.
 * Key auf pathname → React mounted den Subtree neu → animate-fade-in greift.
 */
function RouteFader() {
  const location = useLocation();
  return (
    <div key={location.pathname} className="flex-1 overflow-hidden flex flex-col animate-fade-in">
      <Routes location={location}>
        <Route path="/"           element={<HomePage />} />
        <Route path="/projects"   element={<LibraryPage />} />
        <Route path="/project/:id" element={<ProjectDetailPage />} />
        <Route path="/thumbnail"  element={<ThumbnailPage />} />
        <Route path="/settings"   element={<SettingsPage />} />
        <Route path="/help"       element={<HelpPage />} />
      </Routes>
    </div>
  );
}
