import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Server, HardDrive, Database, ExternalLink, CheckCircle, XCircle, Monitor, Cpu } from 'lucide-react';
import StatusBadge from '../components/common/StatusBadge';
import { getBackupServers, getProxyServers, getRepositories } from '../api/infrastructure';

function UsageBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const color = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{used.toFixed(0)} GB 사용</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function InfrastructurePage() {
  const { t } = useTranslation();

  const { data: backupServers = [], isLoading: loadingBS } = useQuery({
    queryKey: ['backup-servers'],
    queryFn: getBackupServers,
    refetchInterval: 120000,
  });

  const { data: proxyServers = [], isLoading: loadingPS } = useQuery({
    queryKey: ['proxy-servers'],
    queryFn: getProxyServers,
    refetchInterval: 120000,
  });

  const { data: repositories = [], isLoading: loadingRepo } = useQuery({
    queryKey: ['repositories'],
    queryFn: getRepositories,
    refetchInterval: 120000,
  });

  const grafanaUrl = import.meta.env.VITE_GRAFANA_URL;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('infrastructure.title')}</h1>

      {/* Backup Servers */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Server size={16} className="text-[#1B6CA8]" />
          <h2 className="text-sm font-semibold text-gray-700">{t('infrastructure.backupServers')}</h2>
        </div>
        {loadingBS ? (
          <div className="h-32 rounded-xl bg-gray-200 animate-pulse" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {backupServers.map((srv) => (
              <div key={srv.id} className="bg-white rounded-xl p-5 border border-gray-100">
                {/* 헤더 */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#1B6CA8]/10 flex items-center justify-center">
                      <Server size={20} className="text-[#1B6CA8]" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{srv.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{srv.description || 'Backup Server'}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    srv.status === 'Online'
                      ? 'bg-green-50 text-green-600'
                      : 'bg-red-50 text-red-500'
                  }`}>
                    {srv.status === 'Online'
                      ? <CheckCircle size={11} />
                      : <XCircle size={11} />}
                    {srv.status === 'Online' ? '서비스 정상' : '서비스 중단'}
                  </span>
                </div>

                {/* 상세 정보 */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-xs">
                    <Monitor size={13} className="text-gray-400 flex-shrink-0" />
                    <span className="text-gray-500 w-16 flex-shrink-0">IP 주소</span>
                    <span className="font-mono text-gray-800 font-medium">{srv.host}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Cpu size={13} className="text-gray-400 flex-shrink-0" />
                    <span className="text-gray-500 w-16 flex-shrink-0">OS</span>
                    <span className="text-gray-800">{srv.osType}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-[13px] h-[13px] rounded bg-[#1B6CA8] flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-[7px] font-bold">V</span>
                    </div>
                    <span className="text-gray-500 w-16 flex-shrink-0">버전</span>
                    <span className="text-gray-800 font-medium">{srv.veeamVersion}</span>
                  </div>
                </div>
              </div>
            ))}
            {!backupServers.length && (
              <p className="text-sm text-gray-400 col-span-3">{t('common.noData')}</p>
            )}
          </div>
        )}
      </section>

      {/* Proxy Servers */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <HardDrive size={16} className="text-purple-600" />
          <h2 className="text-sm font-semibold text-gray-700">{t('infrastructure.proxyServers')}</h2>
        </div>
        {loadingPS ? (
          <div className="h-24 rounded-xl bg-gray-200 animate-pulse" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {proxyServers.map((proxy) => (
              <div key={proxy.id} className="bg-white rounded-xl p-4 border border-gray-100">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{proxy.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{proxy.host} · {proxy.type}</p>
                  </div>
                  <StatusBadge status={proxy.status} />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Task 사용</span>
                    <span>{proxy.currentTasks} / {proxy.maxTasks}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-purple-500"
                      style={{ width: `${proxy.maxTasks > 0 ? (proxy.currentTasks / proxy.maxTasks) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {!proxyServers.length && (
              <p className="text-sm text-gray-400 col-span-3">{t('common.noData')}</p>
            )}
          </div>
        )}
      </section>

      {/* Repositories */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Database size={16} className="text-orange-500" />
          <h2 className="text-sm font-semibold text-gray-700">{t('infrastructure.repositories')}</h2>
        </div>
        {loadingRepo ? (
          <div className="h-24 rounded-xl bg-gray-200 animate-pulse" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {repositories.map((repo) => (
              <div key={repo.id} className="bg-white rounded-xl p-4 border border-gray-100">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{repo.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{repo.host} · {repo.path}</p>
                  </div>
                  <StatusBadge status={repo.status} />
                </div>
                <UsageBar used={repo.usedGB} total={repo.capacityGB} />
                <p className="text-xs text-gray-400 mt-2">{t('infrastructure.free')}: {repo.freeGB.toFixed(0)} GB</p>
              </div>
            ))}
            {!repositories.length && (
              <p className="text-sm text-gray-400 col-span-3">{t('common.noData')}</p>
            )}
          </div>
        )}
      </section>

      {/* Grafana Monitoring */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-orange-500 flex items-center justify-center">
              <span className="text-white text-[8px] font-bold">G</span>
            </div>
            <h2 className="text-sm font-semibold text-gray-700">{t('infrastructure.monitoring')}</h2>
          </div>
          {grafanaUrl && (
            <a
              href={grafanaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-[#1B6CA8] hover:underline"
            >
              <ExternalLink size={12} /> Grafana 열기
            </a>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          {grafanaUrl ? (
            <iframe
              src={`${grafanaUrl}/d/veeam-infra?kiosk=tv`}
              className="w-full"
              style={{ height: '500px', border: 'none' }}
              title="Grafana Resource Monitoring"
            />
          ) : (
            <div className="p-10 text-center">
              <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center mx-auto mb-3">
                <span className="text-orange-500 text-xl font-bold">G</span>
              </div>
              <p className="text-sm font-medium text-gray-700">Grafana 연동 필요</p>
              <p className="text-xs text-gray-400 mt-1">
                환경변수 <code className="bg-gray-100 px-1 rounded">VITE_GRAFANA_URL</code>을 설정하세요
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
