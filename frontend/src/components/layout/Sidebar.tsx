import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Server,
  History,
  GanttChart,
  Settings,
  Shield,
} from 'lucide-react';

const navItems = [
  { key: 'dashboard', path: '/', icon: LayoutDashboard },
  { key: 'infrastructure', path: '/infrastructure', icon: Server },
  { key: 'history', path: '/history', icon: History },
  { key: 'backupWindow', path: '/backup-window', icon: GanttChart },
  { key: 'settings', path: '/settings', icon: Settings },
];

export default function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside className="w-60 min-h-screen bg-[#0D1B2E] flex flex-col">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <div className="w-9 h-9 rounded-lg bg-[#1B6CA8] flex items-center justify-center">
          <Shield size={20} className="text-white" />
        </div>
        <div>
          <p className="text-white font-bold text-sm leading-tight">Veeam Portal</p>
          <p className="text-white/40 text-xs">Backup Management</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ key, path, icon: Icon }) => (
          <NavLink
            key={key}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-[#1B6CA8] text-white font-medium'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            {t(`nav.${key}`)}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-white/10">
        <p className="text-white/30 text-xs text-center">v1.0.0</p>
      </div>
    </aside>
  );
}
