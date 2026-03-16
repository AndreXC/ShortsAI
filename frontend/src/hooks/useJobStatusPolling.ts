import { useQuery } from '@tanstack/react-query'

import { getJobStatus } from '@/services/api'
import { useJobStore } from '@/store/jobStore'

export function useJobStatusPolling(jobId: string | null) {
  const setStatus = useJobStore((state) => state.setStatus)

  return useQuery({
    queryKey: ['job-status', jobId],
    queryFn: async () => {
      if (!jobId) {
        throw new Error('jobId ausente')
      }
      const status = await getJobStatus(jobId)
      setStatus(status)
      return status
    },
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status || status === 'running' || status === 'queued') {
        return 1500
      }
      return false
    },
  })
}
