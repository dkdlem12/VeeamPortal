export type JobStatus = 'Success' | 'Failed' | 'Running' | 'Warning' | 'None';
export type JobType = 'VMBackup' | 'AgentBackup' | 'NASBackup' | 'BackupCopy' | 'Replication' | 'RMANPlugin';
export type NodeStatus = 'Online' | 'Offline' | 'Unknown';
export type BackupMode = 'Incremental' | 'SyntheticFull' | 'ActiveFull';

export interface BackupJob {
  id: string;
  name: string;
  type: JobType;
  status: JobStatus;
  startTime: string;
  endTime: string | null;
  duration: number | null;
  /** Processed (처리된 원본 데이터, GB) */
  dataSize: number | null;
  /** Read (소스에서 읽은 변경 블록, GB) */
  readSize: number | null;
  /** Transferred (저장소로 전송된 데이터, 압축/중복제거 후, GB) */
  transferSize: number | null;
  backupMode: BackupMode;
  server: string;
  description?: string;
}

export interface DashboardSummary {
  totalJobs: number;
  success: number;
  failed: number;
  running: number;
  warning: number;
  successRate: number;
  dataProtected: number;
  lastUpdated: string;
}

export interface BackupServer {
  id: string;
  name: string;
  host: string;
  status: NodeStatus;
  veeamVersion: string;
  osType: string;
  description: string;
}

export interface ProxyServer {
  id: string;
  name: string;
  host: string;
  status: NodeStatus;
  type: string;
  maxTasks: number;
  currentTasks: number;
}

export interface Repository {
  id: string;
  name: string;
  host: string;
  path: string;
  type: string;
  capacityGB: number;
  usedGB: number;
  freeGB: number;
  status: NodeStatus;
}

export interface HistoryFilter {
  startDate: Date | null;
  endDate: Date | null;
  jobType: JobType | '';
  status: JobStatus | '';
  jobName: string;
  server: string;
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Alert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  source: string;
  timestamp: string;
  acknowledged: boolean;
}
