import apiClient from './client';
import type { HistoryFilter, PaginatedResult, BackupJob } from '../types';
import { format } from 'date-fns';

export const getJobHistory = (filter: HistoryFilter) => {
  const params: Record<string, string | number> = {
    page: filter.page,
    page_size: filter.pageSize,
  };
  if (filter.startDate) params.start_date = format(filter.startDate, 'yyyy-MM-dd');
  if (filter.endDate) params.end_date = format(filter.endDate, 'yyyy-MM-dd');
  if (filter.jobType) params.job_type = filter.jobType;
  if (filter.status) params.status = filter.status;
  if (filter.jobName) params.job_name = filter.jobName;
  if (filter.server) params.server = filter.server;

  return apiClient
    .get<PaginatedResult<BackupJob>>('/history/jobs', { params })
    .then((r) => r.data);
};

export const getSessionDetail = (sessionId: string) =>
  apiClient.get(`/history/jobs/${sessionId}`).then((r) => r.data);

export const exportJobHistory = (filter: Omit<HistoryFilter, 'page' | 'pageSize'>) => {
  const params: Record<string, string> = {};
  if (filter.startDate) params.start_date = format(filter.startDate, 'yyyy-MM-dd');
  if (filter.endDate) params.end_date = format(filter.endDate, 'yyyy-MM-dd');
  if (filter.jobType) params.job_type = filter.jobType;
  if (filter.status) params.status = filter.status;
  if (filter.jobName) params.job_name = filter.jobName;
  if (filter.server) params.server = filter.server;

  return apiClient.get('/history/export', {
    params,
    responseType: 'blob',
  });
};
