import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Search, Download, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import StatusBadge from '../components/common/StatusBadge';
import SessionDetailModal from '../components/common/SessionDetailModal';
import { getJobHistory, exportJobHistory } from '../api/history';
import type { HistoryFilter, JobType, JobStatus } from '../types';
import { format, subDays } from 'date-fns';

const JOB_TYPES: { value: JobType | ''; label: string }[] = [
  { value: '',           label: '전체 유형' },
  { value: 'VMBackup',   label: 'VM Backup' },
  { value: 'AgentBackup',label: 'Agent Backup' },
  { value: 'NASBackup',  label: 'NAS Backup' },
  { value: 'BackupCopy', label: 'Backup Copy' },
  { value: 'RMANPlugin', label: 'Oracle RMAN Plugin' },
];

const STATUSES: { value: JobStatus | ''; labelKey: string }[] = [
  { value: '', labelKey: 'history.allStatus' },
  { value: 'Success', labelKey: 'dashboard.success' },
  { value: 'Failed', labelKey: 'dashboard.failed' },
  { value: 'Warning', labelKey: 'dashboard.warning' },
];

function formatDuration(sec: number | null) {
  if (!sec) return '-';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${sec % 60}s`;
}

function formatBytes(gb: number | null) {
  if (!gb || gb < 0.001) return '-';
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  if (gb < 1) return `${(gb * 1024).toFixed(0)} MB`;
  return `${gb.toFixed(1)} GB`;
}

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

const defaultFilter: HistoryFilter = {
  startDate: subDays(new Date(), 7),
  endDate: new Date(),
  jobType: '',
  status: '',
  jobName: '',
  server: '',
  page: 1,
  pageSize: 20,
};

export default function HistoryPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<HistoryFilter>(defaultFilter);
  const [applied, setApplied] = useState<HistoryFilter>(defaultFilter);
  const [exporting, setExporting] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['job-history', applied],
    queryFn: () => getJobHistory(applied),
  });

  const handleSearch = () => setApplied({ ...filter, page: 1 });
  const handleReset = () => { setFilter(defaultFilter); setApplied({ ...defaultFilter, page: 1 }); };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportJobHistory(applied);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `veeam_backup_history_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const totalPages = data?.totalPages ?? 1;

  return (
    <>
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('history.title')}</h1>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          <Download size={14} />
          {exporting ? '내보내는 중...' : t('history.export')}
        </button>
      </div>

      {/* Filter Panel */}
      <div className="bg-white rounded-xl p-5 border border-gray-100 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">{t('common.filter')}</h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Date Range */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('history.startDate')}</label>
            <DatePicker
              selected={filter.startDate}
              onChange={(d: Date | null) => setFilter((f) => ({ ...f, startDate: d }))}
              dateFormat="yyyy-MM-dd"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholderText="YYYY-MM-DD"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('history.endDate')}</label>
            <DatePicker
              selected={filter.endDate}
              onChange={(d: Date | null) => setFilter((f) => ({ ...f, endDate: d }))}
              dateFormat="yyyy-MM-dd"
              minDate={filter.startDate ?? undefined}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholderText="YYYY-MM-DD"
            />
          </div>

          {/* Job Type */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('history.jobType')}</label>
            <select
              value={filter.jobType}
              onChange={(e) => setFilter((f) => ({ ...f, jobType: e.target.value as JobType | '' }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {JOB_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('history.status')}</label>
            <select
              value={filter.status}
              onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value as JobStatus | '' }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUSES.map((opt) => (
                <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
              ))}
            </select>
          </div>

          {/* Job Name */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('history.jobName')}</label>
            <input
              type="text"
              value={filter.jobName}
              onChange={(e) => setFilter((f) => ({ ...f, jobName: e.target.value }))}
              placeholder="Job 이름 검색..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Server */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('history.server')}</label>
            <input
              type="text"
              value={filter.server}
              onChange={(e) => setFilter((f) => ({ ...f, server: e.target.value }))}
              placeholder="서버 이름 검색..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors"
          >
            <RotateCcw size={13} /> {t('history.reset')}
          </button>
          <button
            onClick={handleSearch}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1B6CA8] text-white text-sm hover:bg-[#145090] transition-colors"
          >
            <Search size={13} /> {t('history.search')}
          </button>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-xl border border-gray-100">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {t('common.total')} <span className="font-bold text-gray-900">{data?.total ?? 0}</span>{t('common.items')}
          </p>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-gray-400 text-sm">{t('common.loading')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{t('history.jobName')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">대상 서버</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{t('history.jobType')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">백업 모드</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{t('history.startTime')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{t('history.duration')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap text-right">Processed</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap text-right">Read</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap text-right">Transferred</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{t('history.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {!data?.items?.length ? (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400">{t('common.noData')}</td></tr>
                ) : (
                  data.items.map((job) => (
                    <tr key={job.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelectedSessionId(job.id)}>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-[180px] truncate" title={job.name}>{job.name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap font-mono">{job.server || '-'}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{job.type}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><BackupModeBadge mode={job.backupMode} /></td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {format(new Date(job.startTime), 'MM-dd HH:mm')}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDuration(job.duration)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-right tabular-nums">{formatBytes(job.dataSize)}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-right tabular-nums">{formatBytes(job.readSize)}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-right tabular-nums">{formatBytes(job.transferSize)}</td>
                      <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {t('common.page')} {applied.page} / {totalPages}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setApplied((f) => ({ ...f, page: f.page - 1 }))}
              disabled={applied.page <= 1}
              className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setApplied((f) => ({ ...f, page: f.page + 1 }))}
              disabled={applied.page >= totalPages}
              className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
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
