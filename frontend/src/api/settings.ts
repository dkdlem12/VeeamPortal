import apiClient from './client';

export interface DBStatus {
  host: string;
  port: number;
  name: string;
  user: string;
  passwordSet: boolean;
}

export interface SettingsStatus {
  collector: string;
  dbAvailable: boolean;
  db: DBStatus;
  dataDate: string | null;
  checkedAt: string;
}

export interface ConnectionResult {
  success: boolean;
  message: string;
}

export interface SyncResult {
  success: boolean;
  collector: string;
  dbAvailable: boolean;
  syncedAt?: string;
  message: string;
}

export const getSettingsStatus = () =>
  apiClient.get<SettingsStatus>('/settings/status').then((r) => r.data);

export const testConnection = (params: {
  host: string; port: number; name: string; user: string; password: string;
}) =>
  apiClient.post<ConnectionResult>('/settings/test-connection', params).then((r) => r.data);

export const saveConnection = (params: {
  host: string; port: number; name: string; user: string; password?: string;
}) =>
  apiClient.post<ConnectionResult>('/settings/save-connection', params).then((r) => r.data);

export const triggerSync = () =>
  apiClient.post<SyncResult>('/settings/sync').then((r) => r.data);
