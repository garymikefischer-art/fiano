import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useApp } from './stores/appStore';
import { useAuth, hasActiveAccess } from './stores/authStore';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { LoadingScreen } from './components/LoadingScreen';
import { OnboardingTutorial, hasSeenOnboarding } from './components/OnboardingTutorial';
import { UpdateToast } from './components/UpdateToast';
import { UpgradeModal } from './components/UpgradeModal';
import { HomePage } from './pages/HomePage';
import { LibraryPage } from './pages/LibraryPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { ThumbnailPage } from './pages/ThumbnailPage';
import { HelpPage } from './pages/HelpPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { PricingPage } from './pages/PricingPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { LegalPage } from './pages/LegalPage';
import * as sounds from './lib/sounds';

const SPLASH_MS = 1200;

export default function App() {
  const loadProjects = useApp((s) => s.loadProjects);
  const refreshHealth = useApp((s) => s.refreshHealth);
  const loadAppDefaults = useApp((s) => s.loadAppDefaults);
  const initAuth = useAuth((s) => s.init);
  const [splash, setSplash] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Auth-Init: Session aus safeStorage hydraten — direkt beim App-Start, parallel zum Splash
  useEffect(() => { initAuth(); }, [initAuth]);

  useEffect(() => {
    loadProjects();
    refreshHealth();
    loadAppDefaults();
    const t = setTimeout(() => {
      setSplash(false);
      try { sounds.appStart(); } catch {}
      if (!hasSeenOnboarding()) setShowOnboarding(true);
    }, SPLASH_MS);
    return () => clearTimeout(t);
  }, [loadProjects, refreshHealth, loadAppDefaults]);

  if (splash) return <LoadingScreen />;

  return (
    <HashRouter>
      <AuthGate>
        {(state) => {
          if (state === 'login') {
            return (
              <Routes>
                <Route path="/signup"         element={<SignupPage />} />
                <Route path="/login"          element={<LoginPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                {/* Legal-Pages sind ohne Login zugänglich (DSGVO-Pflicht) */}
                <Route path="/legal/:doc"     element={<LegalPage />} />
                <Route path="/legal"          element={<LegalPage />} />
                <Route path="*"               element={<Navigate to="/login" replace />} />
              </Routes>
            );
          }
          if (state === 'pricing') {
            return (
              <Routes>
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/pricing"        element={<PricingPage />} />
                <Route path="/legal/:doc"     element={<LegalPage />} />
                <Route path="/legal"          element={<LegalPage />} />
                <Route path="*"               element={<Navigate to="/pricing" replace />} />
              </Routes>
            );
          }
          // state === 'app' — voller Zugriff (Recovery-URL trotzdem zugänglich)
          return (
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
              <UpgradeModal />
            </div>
          );
        }}
      </AuthGate>
    </HashRouter>
  );
}

/**
 * AuthGate: entscheidet welcher View basierend auf Auth + Subscription state gerendert wird.
 *  - initializing → LoadingScreen (Splash ist eh schon weg, das ist nur die Auth-Hydration)
 *  - kein User → 'login'
 *  - User aber kein active plan → 'pricing'
 *  - User + active plan → 'app'
 */
function AuthGate({ children }: { children: (state: 'login' | 'pricing' | 'app') => React.ReactNode }) {
  const initializing = useAuth((s) => s.initializing);
  const user = useAuth((s) => s.user);
  const subscription = useAuth((s) => s.subscription);

  if (initializing) return <LoadingScreen />;

  let state: 'login' | 'pricing' | 'app';
  if (!user) state = 'login';
  else if (!hasActiveAccess(subscription)) state = 'pricing';
  else state = 'app';

  return <>{children(state)}</>;
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
        <Route path="/"               element={<HomePage />} />
        <Route path="/projects"       element={<LibraryPage />} />
        <Route path="/project/:id"    element={<ProjectDetailPage />} />
        <Route path="/thumbnail"      element={<ThumbnailPage />} />
        <Route path="/settings"       element={<SettingsPage />} />
        <Route path="/help"           element={<HelpPage />} />
        <Route path="/pricing"        element={<PricingPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/legal/:doc"     element={<LegalPage />} />
        <Route path="/legal"          element={<LegalPage />} />
        <Route path="*"               element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
