import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { CheckCircle, XCircle, Clock, Database, RefreshCw } from 'lucide-react';
import StatCard from '../components/common/StatCard';
import StatusBadge from '../components/common/StatusBadge';
import SessionDetailModal from '../components/common/SessionDetailModal';
import { getDashboardSummary, getRecentJobs, getJobTrend } from '../api/dashboard';
import { format } from 'date-fns';
import type { BackupJob } from '../types';

const JOB_TYPE_LABELS: Record<string, string> = {
  VMBackup:    'VM Backup',
  AgentBackup: 'Agent Backup',
  NASBackup:   'NAS Backup',
  BackupCopy:  'Backup Copy',
  Replication: 'Replication',
  RMANPlugin:  'Oracle RMAN',
};

const BACKUP_MODE_STYLES: Record<string, { label: string; cls: string }> = {
  Incremental:   { label: '증분',      cls: 'bg-blue-50 text-blue-600' },
  SyntheticFull: { label: '합성 풀',   cls: 'bg-purple-50 text-purple-600' },
  ActiveFull:    { label: '액티브 풀', cls: 'bg-orange-50 text-orange-600' },
};

function BackupModeBadge({ mode }: { mode?: string }) {
  const m = mode ? BACKUP_MODE_STYLES[mode] : null;
  if (!m) return <span className="text-gray-300 text-xs">-</span>;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

const PIE_COLORS: Record<string, string> = {
  success: '#22c55e',
  failed:  '#ef4444',
  running: '#3b82f6',
  warning: '#f59e0b',
};

function formatBytes(gb: number) {
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  return `${gb.toFixed(0)} GB`;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function DashboardPage() {
  const { t } = useTranslation();

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: getDashboardSummary,
    refetchInterval: 60000,
  });

  const { data: recentJobs = [], isLoading: loadingJobs } = useQuery({
    queryKey: ['recent-jobs'],
    queryFn: () => getRecentJobs(10),
    refetchInterval: 60000,
  });

  const [trendDays, setTrendDays] = useState<1 | 7 | 30>(7);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const { data: trend = [] } = useQuery({
    queryKey: ['job-trend', trendDays],
    queryFn: () => getJobTrend(trendDays),
    refetchInterval: 300000,
  });

  const pieData = summary
    ? [
        { name: t('dashboard.success'), value: summary.success, key: 'success' },
        { name: t('dashboard.failed'),  value: summary.failed,  key: 'failed'  },
        { name: t('dashboard.running'), value: summary.running, key: 'running' },
        { name: t('dashboard.warning'), value: summary.warning, key: 'warning' },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <>
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
          {summary && (
            <p className="text-sm text-gray-400 mt-0.5">
              {t('dashboard.lastUpdated')}: {summary.lastUpdated.length === 10
                ? `${summary.lastUpdated} 기준`
                : format(new Date(summary.lastUpdated), 'yyyy-MM-dd HH:mm:ss')}
            </p>
          )}
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1B6CA8] text-white text-sm hover:bg-[#145090] transition-colors">
          <RefreshCw size={14} />
          {t('common.refresh')}
        </button>
      </div>

      {/* Stat Cards */}
      {loadingSummary ? (
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-gray-200 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title={t('dashboard.success')}
            value={summary?.success ?? 0}
            subtitle={`${t('dashboard.successRate')}: ${summary?.successRate ?? 0}%`}
            icon={<CheckCircle size={20} />}
            color="green"
          />
          <StatCard
            title={t('dashboard.failed')}
            value={summary?.failed ?? 0}
            icon={<XCircle size={20} />}
            color="red"
          />
          <StatCard
            title={t('dashboard.running')}
            value={summary?.running ?? 0}
            icon={<Clock size={20} />}
            color="blue"
          />
          <StatCard
            title={t('dashboard.dataProtected')}
            value={formatBytes(summary?.dataProtected ?? 0)}
            icon={<Database size={20} />}
            color="gray"
          />
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Bar Chart - trend */}
        <div className="col-span-2 bg-white rounded-xl p-5 border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">백업 추이</h2>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {([1, 7, 30] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setTrendDays(d)}
                  className={`px-3 py-1.5 transition-colors ${
                    trendDays === d
                      ? 'bg-[#1B6CA8] text-white font-medium'
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {d === 1 ? '1일' : d === 7 ? '1주' : '1달'}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trend} barSize={18} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="success" fill="#22c55e" radius={[3, 3, 0, 0]} name={t('dashboard.success')} />
              <Bar dataKey="failed" fill="#ef4444" radius={[3, 3, 0, 0]} name={t('dashboard.failed')} />
              <Bar dataKey="warning" fill="#f59e0b" radius={[3, 3, 0, 0]} name={t('dashboard.warning')} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart - today status */}
        <div className="bg-white rounded-xl p-5 border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{t('dashboard.today')} 상태 분포</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="45%"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={2}
                dataKey="value"
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={PIE_COLORS[entry.key] ?? '#8b8b8b'} />
                ))}
              </Pie>
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Jobs Table */}
      <div className="bg-white rounded-xl border border-gray-100">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">최근 Job 현황</h2>
        </div>
        {loadingJobs ? (
          <div className="p-8 text-center text-gray-400 text-sm">{t('common.loading')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Job 이름</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">대상 서버</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">유형</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">백업 모드</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">시작 시간</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">소요 시간</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Processed</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Read</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Transferred</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentJobs.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-400">{t('common.noData')}</td>
                  </tr>
                ) : (
                  recentJobs.map((job: BackupJob) => (
                    <tr key={job.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelectedSessionId(job.id)}>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-[160px] truncate" title={job.name}>{job.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap font-mono">{job.server || '-'}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{JOB_TYPE_LABELS[job.type] ?? job.type}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><BackupModeBadge mode={job.backupMode} /></td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {format(new Date(job.startTime), 'MM-dd HH:mm')}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDuration(job.duration)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-right tabular-nums">
                        {job.dataSize ? formatBytes(job.dataSize) : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-right tabular-nums">
                        {job.readSize ? formatBytes(job.readSize) : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-right tabular-nums">
                        {job.transferSize ? formatBytes(job.transferSize) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={job.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>

      {selectedSessionId && (
        <SessionDetailModal
          sessionId={selectedSessionId}
          onClose={() => setSelectedSessionId(null)}
        />
      )}
    </>
  );
}
