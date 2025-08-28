import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import HomePage from '../screens/HomePage';
import ExportPage from '../screens/ExportPage';
import SettingsPage from '../screens/SettingsPage';

export default function App() {
  const loc = useLocation();
  return (
    <div className="min-h-screen pb-24 px-3 pt-6 safe-area-inset">

      <main>
        <Routes location={loc}>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/export" element={<ExportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      <nav className="fixed bottom-2 left-2 right-2 h-16 rounded-3xl flex justify-around items-center backdrop-blur-md bg-white/70 dark:bg-black/30 border-t border-black/10 dark:border-white/10 safe-area-inset-bottom">
        <Link
          to="/home"
          className="flex flex-col items-center text-sm font-medium"
        >
          🏠 <span className="text-xs">Сегодня</span>
        </Link>
        <Link
          to="/export"
          className="flex flex-col items-center text-sm font-medium"
        >
          📤 <span className="text-xs">Экспорт</span>
        </Link>
        <Link
          to="/settings"
          className="flex flex-col items-center text-sm font-medium"
        >
          ⚙️ <span className="text-xs">Настройки</span>
        </Link>
      </nav>
    </div>
  );
}
