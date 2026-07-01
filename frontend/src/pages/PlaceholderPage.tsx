import { useTranslation } from 'react-i18next';
import { Construction } from 'lucide-react';

interface Props { titleKey: string }

export default function PlaceholderPage({ titleKey }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-96 text-gray-400">
      <Construction size={48} className="mb-4 opacity-40" />
      <h2 className="text-lg font-semibold text-gray-600">{t(titleKey)}</h2>
      <p className="text-sm mt-1">준비 중입니다</p>
    </div>
  );
}
