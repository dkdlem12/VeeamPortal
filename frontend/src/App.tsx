import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/layout/Layout';
import DashboardPage from './pages/DashboardPage';
import InfrastructurePage from './pages/InfrastructurePage';
import HistoryPage from './pages/HistoryPage';
import BackupWindowPage from './pages/BackupWindowPage';
import SettingsPage from './pages/SettingsPage';
import './i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/infrastructure" element={<InfrastructurePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/backup-window" element={<BackupWindowPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
