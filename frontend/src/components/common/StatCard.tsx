import type { ReactNode } from 'react';

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  color: 'blue' | 'green' | 'red' | 'yellow' | 'gray';
  trend?: { value: number; label: string };
}

const colorMap = {
  blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-100 text-blue-600',   value: 'text-blue-700' },
  green:  { bg: 'bg-green-50',  icon: 'bg-green-100 text-green-600',  value: 'text-green-700' },
  red:    { bg: 'bg-red-50',    icon: 'bg-red-100 text-red-600',      value: 'text-red-700' },
  yellow: { bg: 'bg-yellow-50', icon: 'bg-yellow-100 text-yellow-600',value: 'text-yellow-700' },
  gray:   { bg: 'bg-gray-50',   icon: 'bg-gray-100 text-gray-600',    value: 'text-gray-700' },
};

export default function StatCard({ title, value, subtitle, icon, color, trend }: Props) {
  const c = colorMap[color];
  return (
    <div className={`rounded-xl p-5 ${c.bg} border border-white`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className={`text-3xl font-bold mt-1 ${c.value}`}>{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.icon}`}>
          {icon}
        </div>
      </div>
      {trend && (
        <p className={`text-xs mt-3 ${trend.value >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {trend.value >= 0 ? '▲' : '▼'} {Math.abs(trend.value)}% {trend.label}
        </p>
      )}
    </div>
  );
}
