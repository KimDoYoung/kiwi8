import api from '@/lib/api'

export interface SchedulerJob {
  id: number
  name: string
  func_name: string
  schedule_type: 'interval' | 'cron' | 'once'
  schedule_expr: string
  timezone: string
  enabled: number
  max_conc: number
  overlap_policy: 'skip' | 'queue' | 'cancel'
  timeout_sec: number
  retry_max: number
  retry_backoff: number
  jitter_sec: number
  next_run_at: string | null
  last_run_at: string | null
  last_status: 'success' | 'error' | 'timeout' | 'cancelled' | null
  last_message: string | null
  created_at: string
  updated_at: string
}

export interface SchedulerRunHistory {
  id: number
  job_name: string
  started_at: string
  finished_at: string | null
  status: 'success' | 'error' | 'cancelled' | 'timeout' | null
  message: string | null
}

export interface SchedulerStats {
  total_jobs: number
  enabled_jobs: number
  interval_jobs?: number
  cron_jobs?: number
  once_jobs?: number
  runs_24h: number
  active_locks: number
  scheduler_running: number
}

export interface SchedulerActionResponse {
  success: boolean
  message?: string
  error_message?: string
}

export const getSchedulerJobs = async (): Promise<SchedulerJob[]> => {
  const response = await api.get('/api/v1/scheduler/jobs')
  return response.data.data.jobs
}

export const getSchedulerHistory = async (limit: number = 50): Promise<SchedulerRunHistory[]> => {
  const response = await api.get(`/api/v1/scheduler/history?limit=${limit}`)
  return response.data.data.history
}

export const getSchedulerStats = async (): Promise<SchedulerStats> => {
  const response = await api.get('/api/v1/scheduler/statistics')
  return response.data.data
}

export const enableJob = async (jobId: number): Promise<SchedulerActionResponse> => {
  const response = await api.post(`/api/v1/scheduler/jobs/${jobId}/enable`)
  return response.data
}

export const disableJob = async (jobId: number): Promise<SchedulerActionResponse> => {
  const response = await api.post(`/api/v1/scheduler/jobs/${jobId}/disable`)
  return response.data
}

export const deleteJob = async (jobId: number): Promise<SchedulerActionResponse> => {
  const response = await api.delete(`/api/v1/scheduler/jobs/${jobId}`)
  return response.data
}
