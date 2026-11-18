import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { FamilyDashboard } from './pages/FamilyDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { InstitutionDashboard } from './pages/InstitutionDashboard';

function AppRouter() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<'landing' | 'auth' | 'portal'>('landing');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  useEffect(() => {
    if (user) {
      setView('portal');
    } else if (view === 'portal') {
      setView('landing');
    }
  }, [user, view]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-600">Loading Virasat Setu...</div>
      </div>
    );
  }

  if (view === 'portal' && user) {
    if (user.role === 'admin') {
      return <AdminDashboard onBackHome={() => setView('landing')} />;
    }
    if (user.role === 'institution') {
      return <InstitutionDashboard onBackHome={() => setView('landing')} />;
    }
    return <FamilyDashboard onBackHome={() => setView('landing')} />;
  }

  if (view === 'auth' && !user) {
    return <AuthPage initialMode={authMode} onBackHome={() => setView('landing')} />;
  }

  return (
    <LandingPage
      isAuthenticated={Boolean(user)}
      onEnterPortal={() => setView('portal')}
      onNavigateAuth={(mode = 'login') => {
        setAuthMode(mode);
        setView('auth');
      }}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
