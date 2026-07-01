import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Database, RefreshCw, CheckCircle, XCircle, AlertTriangle,
  Eye, EyeOff, Save, Wifi, WifiOff, Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  getSettingsStatus, testConnection, saveConnection, triggerSync,
} from '../api/settings';
import type { SettingsStatus } from '../api/settings';

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`}
    />
  );
}

function CollectorBadge({ name }: { name: string }) {
  const color =
    name === 'DBCollector'   ? 'bg-blue-100 text-blue-700' :
    name === 'APICollector'  ? 'bg-purple-100 text-purple-700' :
    name === 'MockCollector' ? 'bg-amber-100 text-amber-700' :
                               'bg-gray-100 text-gray-600';
  const label =
    name === 'DBCollector'   ? 'PostgreSQL (직접 연결)' :
    name === 'APICollector'  ? 'VBR REST API' :
    name === 'MockCollector' ? 'Mock (데모 데이터)' : name;
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${color}`}>{label}</span>;
}

export default function SettingsPage() {
  const qc = useQueryClient();

  const { data: status, isLoading, refetch: refetchStatus } = useQuery<SettingsStatus>({
    queryKey: ['settings-status'],
    queryFn: getSettingsStatus,
    staleTime: 0,
  });

  // Form state — initialized from current settings once loaded
  const [form, setForm] = useState({
    host: '', port: 5432, name: 'VeeamBackup', user: '', password: '',
  });
  const [formInitialized, setFormInitialized] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (status && !formInitialized) {
    setForm({
      host:     status.db.host,
      port:     status.db.port,
      name:     status.db.name,
      user:     status.db.user,
      password: '',
    });
    setFormInitialized(true);
  }

  // Test connection
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const testMutation = useMutation({
    mutationFn: () => testConnection({ ...form }),
    onSuccess: (data) => setTestResult(data),
  });

  // Save connection
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const saveMutation = useMutation({
    mutationFn: () => saveConnection({
      host: form.host, port: form.port, name: form.name, user: form.user,
      password: form.password || undefined,
    }),
    onSuccess: (data) => {
      setSaveResult(data);
      setTestResult(null);
      refetchStatus();
      qc.invalidateQueries();
    },
  });

  // Sync
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string; syncedAt?: string } | null>(null);
  const syncMutation = useMutation({
    mutationFn: triggerSync,
    onSuccess: (data) => {
      setSyncResult(data);
      refetchStatus();
      qc.invalidateQueries();
    },
  });

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">설정</h1>
        <p className="text-sm text-gray-400 mt-0.5">Veeam 데이터 소스 연결 및 동기화 관리</p>
      </div>

      {/* ── 현재 연결 상태 카드 ───────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Wifi size={16} className="text-[#1B6CA8]" />
            현재 연결 상태
          </h2>
          <button
            onClick={() => refetchStatus()}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="새로 고침"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {isLoading ? (
          <div className="h-20 bg-gray-100 animate-pulse rounded-lg" />
        ) : status ? (
          <div className="grid grid-cols-2 gap-4">
            {/* 데이터 소스 */}
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">데이터 소스</p>
              <div className="flex items-center gap-2">
                <StatusDot ok={status.dbAvailable} />
                <CollectorBadge name={status.collector} />
              </div>
            </div>

            {/* DB 연결 */}
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">PostgreSQL 연결</p>
              <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                {status.dbAvailable
                  ? <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
                  : <XCircle    size={14} className="text-red-400 flex-shrink-0" />
                }
                {status.db.host || '(미설정)'}:{status.db.port}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                DB: {status.db.name} / 사용자: {status.db.user || '(미설정)'}
              </p>
            </div>

            {/* 최신 데이터 날짜 */}
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">최신 백업 데이터</p>
              <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <Clock size={14} className="text-[#1B6CA8]" />
                {status.dataDate ?? '데이터 없음'}
              </div>
            </div>

            {/* 상태 확인 시각 */}
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">상태 확인 시각</p>
              <p className="text-sm font-medium text-gray-700">
                {format(new Date(status.checkedAt), 'yyyy-MM-dd HH:mm:ss')}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">상태를 불러올 수 없습니다.</p>
        )}
      </div>

      {/* ── 수동 Sync 카드 ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
          <RefreshCw size={16} className="text-[#1B6CA8]" />
          수동 데이터 동기화
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          콜렉터 캐시를 초기화하고 Veeam DB에 즉시 재연결합니다.
          대시보드·이력 조회 쿼리 캐시도 함께 초기화됩니다.
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1B6CA8] text-white text-sm hover:bg-[#145090] disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
            {syncMutation.isPending ? 'Sync 중...' : '지금 Sync'}
          </button>

          {syncResult && (
            <div className={`flex items-center gap-1.5 text-sm ${syncResult.success ? 'text-green-600' : 'text-red-500'}`}>
              {syncResult.success
                ? <CheckCircle size={14} />
                : <XCircle size={14} />
              }
              {syncResult.message}
              {syncResult.syncedAt && (
                <span className="text-gray-400 text-xs ml-1">
                  ({format(new Date(syncResult.syncedAt), 'HH:mm:ss')})
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── DB 연결 설정 카드 ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-4">
          <Database size={16} className="text-[#1B6CA8]" />
          PostgreSQL 연결 설정
        </h2>

        <div className="grid grid-cols-4 gap-4">
          {/* Host — 3열 */}
          <div className="col-span-3">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              호스트 (IP / Hostname)
            </label>
            <input
              type="text"
              value={form.host}
              placeholder="172.22.4.21"
              onChange={(e) => { setTestResult(null); setSaveResult(null); setForm((f) => ({ ...f, host: e.target.value })); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]"
            />
          </div>

          {/* Port — 1열 */}
          <div className="col-span-1">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              포트
            </label>
            <input
              type="number"
              value={form.port}
              onChange={(e) => { setTestResult(null); setSaveResult(null); setForm((f) => ({ ...f, port: Number(e.target.value) })); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]"
            />
          </div>

          {/* DB Name */}
          <div className="col-span-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              데이터베이스 이름
            </label>
            <input
              type="text"
              value={form.name}
              placeholder="VeeamBackup"
              onChange={(e) => { setTestResult(null); setSaveResult(null); setForm((f) => ({ ...f, name: e.target.value })); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]"
            />
          </div>

          {/* User */}
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              사용자
            </label>
            <input
              type="text"
              value={form.user}
              placeholder="veeam_readonly"
              onChange={(e) => { setTestResult(null); setSaveResult(null); setForm((f) => ({ ...f, user: e.target.value })); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]"
            />
          </div>

          {/* Password */}
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              비밀번호 {status?.db.passwordSet && <span className="text-gray-400 font-normal normal-case">(기존 값 유지 가능)</span>}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                placeholder={status?.db.passwordSet ? '변경하지 않으려면 비워두세요' : '비밀번호 입력'}
                onChange={(e) => { setTestResult(null); setSaveResult(null); setForm((f) => ({ ...f, password: e.target.value })); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B6CA8]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </div>

        {/* 테스트 / 저장 결과 메시지 */}
        {(testResult || saveResult) && (
          <div className={`mt-4 flex items-start gap-2 p-3 rounded-lg text-sm ${
            (testResult ?? saveResult)!.success
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-600'
          }`}>
            {(testResult ?? saveResult)!.success
              ? <CheckCircle size={15} className="flex-shrink-0 mt-0.5" />
              : <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
            }
            {(testResult ?? saveResult)!.message}
          </div>
        )}

        {/* 버튼 영역 */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending || !form.host || !form.user || !form.password}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#1B6CA8] text-[#1B6CA8] text-sm hover:bg-blue-50 disabled:opacity-40 transition-colors"
          >
            {testMutation.isPending
              ? <RefreshCw size={14} className="animate-spin" />
              : (testResult?.success ? <CheckCircle size={14} /> : <WifiOff size={14} />)
            }
            {testMutation.isPending ? '테스트 중...' : '연결 테스트'}
          </button>

          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !form.host || !form.user}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1B6CA8] text-white text-sm hover:bg-[#145090] disabled:opacity-40 transition-colors"
          >
            {saveMutation.isPending
              ? <RefreshCw size={14} className="animate-spin" />
              : <Save size={14} />
            }
            {saveMutation.isPending ? '저장 중...' : '설정 저장 및 적용'}
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-3">
          저장 시 <code className="bg-gray-100 px-1 rounded">.env</code> 파일이 업데이트되고
          콜렉터가 즉시 재초기화됩니다.
          비밀번호를 비워두면 기존 값이 유지됩니다.
        </p>
      </div>
    </div>
  );
}
