import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  getSchedulerJobs, 
  getSchedulerStats, 
  enableJob, 
  disableJob,
} from '@/services/schedulerService'
import { 
  Play, 
  Square, 
  RefreshCcw, 
  Clock, 
  Activity, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react'
import { format } from 'date-fns'

export default function SchedulerPage() {
  const queryClient = useQueryClient()

  const { data: jobs, isLoading: isJobsLoading } = useQuery({
    queryKey: ['schedulerJobs'],
    queryFn: getSchedulerJobs,
    refetchInterval: 10000 // 10초마다 자동 갱신
  })

  const { data: stats } = useQuery({
    queryKey: ['schedulerStats'],
    queryFn: getSchedulerStats,
    refetchInterval: 10000
  })

  const enableMutation = useMutation({
    mutationFn: enableJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedulerJobs'] })
      queryClient.invalidateQueries({ queryKey: ['schedulerStats'] })
    }
  })

  const disableMutation = useMutation({
    mutationFn: disableJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedulerJobs'] })
      queryClient.invalidateQueries({ queryKey: ['schedulerStats'] })
    }
  })

  const formatDateTime = (isoString: string | null) => {
    if (!isoString) return '-'
    try {
      return format(new Date(isoString), 'yyyy-MM-dd HH:mm:ss')
    } catch {
      return isoString
    }
  }

  if (isJobsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">K-스케줄러 설정</h1>
          <p className="text-gray-500">시스템 자동화 작업 관리 및 모니터링</p>
        </div>
        <button 
          onClick={() => queryClient.invalidateQueries({ queryKey: ['schedulerJobs'] })}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
        >
          <RefreshCcw size={18} />
          새로고침
        </button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard 
          title="전체 작업" 
          value={stats?.total_jobs || 0} 
          icon={<Activity className="text-blue-500" />} 
        />
        <StatCard 
          title="활성 작업" 
          value={stats?.enabled_jobs || 0} 
          icon={<Play className="text-green-500" />} 
        />
        <StatCard 
          title="24시간 실행" 
          value={stats?.runs_24h || 0} 
          icon={<CheckCircle2 className="text-purple-500" />} 
        />
        <StatCard 
          title="활성 락" 
          value={stats?.active_locks || 0} 
          icon={<AlertCircle className="text-orange-500" />} 
        />
      </div>

      {/* 작업 목록 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">상태</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">작업명 / 함수</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">스케줄</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">다음 실행</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">마지막 실행</th>
              <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {jobs?.map((job) => (
              <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  {job.enabled ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                      Running
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                      Stopped
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-semibold text-gray-900">{job.name}</div>
                  <div className="text-xs text-gray-500 font-mono">{job.func_name}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5 text-sm text-gray-700">
                    <Clock size={14} className="text-gray-400" />
                    <span className="capitalize">{job.schedule_type}:</span>
                    <span className="font-medium">{job.schedule_expr}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {formatDateTime(job.next_run_at)}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {formatDateTime(job.last_run_at)}
                </td>
                <td className="px-6 py-4 text-right">
                  {job.enabled ? (
                    <button
                      onClick={() => disableMutation.mutate(job.id)}
                      disabled={disableMutation.isPending}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="작업 중지"
                    >
                      <Square size={18} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      onClick={() => enableMutation.mutate(job.id)}
                      disabled={enableMutation.isPending}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="작업 시작"
                    >
                      <Play size={18} fill="currentColor" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon }: { title: string, value: string | number, icon: React.ReactNode }) {
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4">
      <div className="p-3 bg-gray-50 rounded-lg">
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )
}
