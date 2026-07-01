import apiClient from './client';
import type { DashboardSummary, BackupJob } from '../types';

export const getDashboardSummary = () =>
  apiClient.get<DashboardSummary>('/dashboard/summary').then((r) => r.data);

export const getRecentJobs = (limit = 10) =>
  apiClient.get<BackupJob[]>('/dashboard/recent-jobs', { params: { limit } }).then((r) => r.data);

export const getJobTrend = (days = 7) =>
  apiClient.get('/dashboard/trend', { params: { days } }).then((r) => r.data);
