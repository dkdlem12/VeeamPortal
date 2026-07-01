import apiClient from './client';
import type { BackupServer, ProxyServer, Repository } from '../types';

export const getBackupServers = () =>
  apiClient.get<BackupServer[]>('/infrastructure/backup-servers').then((r) => r.data);

export const getProxyServers = () =>
  apiClient.get<ProxyServer[]>('/infrastructure/proxy-servers').then((r) => r.data);

export const getRepositories = () =>
  apiClient.get<Repository[]>('/infrastructure/repositories').then((r) => r.data);

export const getGrafanaToken = () =>
  apiClient.get<{ url: string; token: string }>('/infrastructure/grafana-token').then((r) => r.data);
