import { useTranslation } from 'react-i18next';
import { Bell, RefreshCw } from 'lucide-react';

export default function Header() {
  const { i18n } = useTranslation();

  const toggleLang = () => {
    const next = i18n.language === 'ko' ? 'en' : 'ko';
    i18n.changeLanguage(next);
    localStorage.setItem('veeam-lang', next);
  };

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-xs text-gray-500">Veeam Backup & Replication</span>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>

        <button className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <Bell size={16} />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
        </button>

        <button
          onClick={toggleLang}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
        >
          <span className="text-base">{i18n.language === 'ko' ? '🇰🇷' : '🇺🇸'}</span>
          <span>{i18n.language === 'ko' ? 'KO' : 'EN'}</span>
        </button>
      </div>
    </header>
  );
}
