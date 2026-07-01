import { useQuery } from '@tanstack/react-query';
import { X, CheckCircle, XCircle, AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { getSessionDetail } from '../../api/history';

function formatBytes(gb: number | null) {
  if (!gb || gb < 0.001) return '-';
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  if (gb < 1) return `${(gb * 1024).toFixed(0)} MB`;
  return `${gb.toFixed(1)} GB`;
}

function formatDuration(sec: number | null) {
  if (!sec) return '-';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const BACKUP_MODE_STYLES: Record<string, { label: string; cls: string }> = {
  Incremental:   { label: '증분',      cls: 'bg-blue-50 text-blue-600' },
  SyntheticFull: { label: '합성 풀',   cls: 'bg-purple-50 text-purple-600' },
  ActiveFull:    { label: '액티브 풀', cls: 'bg-orange-50 text-orange-600' },
};

const TASK_STATUS_CONFIG: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
  Success: { icon: <CheckCircle size={13} />, cls: 'text-green-600', label: '성공' },
  Warning: { icon: <AlertTriangle size={13} />, cls: 'text-amber-500', label: '경고' },
  Failed:  { icon: <XCircle size={13} />,      cls: 'text-red-500',   label: '실패' },
  Unknown: { icon: <Clock size={13} />,         cls: 'text-gray-400',  label: '-' },
};

interface Props {
  sessionId: string;
  onClose: () => void;
}

export default function SessionDetailModal({ sessionId, onClose }: Props) {
  const { data: session, isLoading } = useQuery({
    queryKey: ['session-detail', sessionId],
    queryFn: () => getSessionDetail(sessionId),
    staleTime: 30000,
  });

  const modeStyle = session?.backupMode ? BACKUP_MODE_STYLES[session.backupMode] : null;

  const statusColor =
    session?.status === 'Success' ? 'text-green-600 bg-green-50' :
    session?.status === 'Failed'  ? 'text-red-500 bg-red-50' :
    session?.status === 'Warning' ? 'text-amber-500 bg-amber-50' :
    'text-blue-500 bg-blue-50';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900 text-base leading-tight">
              {isLoading ? '로딩 중...' : session?.name}
            </h2>
            {session && (
              <p className="text-xs text-gray-400 mt-0.5">
                {session.server || '-'} &nbsp;·&nbsp; {session.type}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors ml-4">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 size={28} className="text-[#1B6CA8] animate-spin" />
          </div>
        ) : session ? (
          <div className="flex-1 overflow-y-auto">
            {/* Summary cards */}
            <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-gray-50">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">상태</p>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                  {session.status === 'Success' && <CheckCircle size={11} />}
                  {session.status === 'Failed'  && <XCircle size={11} />}
                  {session.status === 'Warning' && <AlertTriangle size={11} />}
                  {session.status === 'Running' && <Loader2 size={11} className="animate-spin" />}
                  {session.status}
                </span>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">백업 모드</p>
                {modeStyle
                  ? <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${modeStyle.cls}`}>{modeStyle.label}</span>
                  : <span className="text-xs text-gray-400">-</span>}
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">시작 시간</p>
                <p className="text-xs font-medium text-gray-800">
                  {session.startTime ? format(new Date(session.startTime), 'MM-dd HH:mm:ss') : '-'}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">소요 시간</p>
                <p className="text-xs font-medium text-gray-800">{formatDuration(session.duration)}</p>
              </div>
            </div>

            {/* Size metrics */}
            <div className="px-6 py-3 grid grid-cols-3 gap-3 border-b border-gray-50">
              {[
                { label: 'Processed', value: session.dataSize },
                { label: 'Read',      value: session.readSize },
                { label: 'Transferred', value: session.transferSize },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{formatBytes(value)}</p>
                </div>
              ))}
            </div>

            {/* Task list */}
            <div className="px-6 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                태스크 목록 ({session.tasks?.length ?? 0}건)
              </p>
              {!session.tasks?.length ? (
                <p className="text-sm text-gray-400 text-center py-6">태스크 정보 없음</p>
              ) : (
                <div className="space-y-2">
                  {session.tasks.map((task: any, i: number) => {
                    const sc = TASK_STATUS_CONFIG[task.status] ?? TASK_STATUS_CONFIG.Unknown;
                    return (
                      <div key={i} className="border border-gray-100 rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`flex-shrink-0 ${sc.cls}`}>{sc.icon}</span>
                            <span className="text-sm font-medium text-gray-800 truncate">{task.objectName || '-'}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0 text-xs text-gray-500">
                            <span>{task.startTime ? format(new Date(task.startTime), 'HH:mm:ss') : '-'}</span>
                            <span>{formatDuration(task.duration)}</span>
                          </div>
                        </div>

                        <div className="mt-2 flex gap-4 text-xs">
                          <span className="text-gray-400">Processed <span className="text-gray-700 font-medium">{formatBytes(task.processedGb)}</span></span>
                          <span className="text-gray-400">Read <span className="text-gray-700 font-medium">{formatBytes(task.readGb)}</span></span>
                          <span className="text-gray-400">Transferred <span className="text-gray-700 font-medium">{formatBytes(task.transferGb)}</span></span>
                          {task.avgSpeedMbs > 0 && (
                            <span className="text-gray-400">Speed <span className="text-gray-700 font-medium">{task.avgSpeedMbs} MB/s</span></span>
                          )}
                        </div>

                        {task.reason && (
                          <p className="mt-1.5 text-xs text-red-500 bg-red-50 rounded px-2 py-1 leading-relaxed">
                            {task.reason}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center py-16 text-gray-400 text-sm">
            데이터를 불러올 수 없습니다
          </div>
        )}
      </div>
    </div>
  );
}
