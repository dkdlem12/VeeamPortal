import type { JobStatus, NodeStatus } from '../../types';

const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  Success:  { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500',  label: '성공' },
  Failed:   { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500',    label: '실패' },
  Running:  { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500',   label: '진행중' },
  Warning:  { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500', label: '경고' },
  None:     { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400',   label: '-' },
  Online:   { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500',  label: 'Online' },
  Offline:  { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500',    label: 'Offline' },
  Unknown:  { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400',   label: 'Unknown' },
};

interface Props {
  status: JobStatus | NodeStatus;
  label?: string;
}

export default function StatusBadge({ status, label }: Props) {
  const c = config[status] ?? config.None;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {label ?? c.label}
    </span>
  );
}
