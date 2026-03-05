
import './App.css';
import { useAppState } from './hooks/useAppState';
import { useIsMobile } from './hooks/useIsMobile';
import { DesktopLayout } from './layouts/DesktopLayout';
import { MobileLayout } from './layouts/MobileLayout';
import { AdminDashboard } from './components/AdminDashboard';

function App() {
  const app = useAppState();
  const isMobile = useIsMobile();

  // Global error catch bounds or admin overrides can go here
  if (app.currentView === 'admin' && app.isAdminModalOpen) {
    return <AdminDashboard onClose={() => app.setIsAdminModalOpen(false)} />;
  }

  return isMobile ? <MobileLayout app={app} /> : <DesktopLayout app={app} />;
}

export default App;
