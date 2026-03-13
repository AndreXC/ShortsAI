import { useQuery } from '@tanstack/react-query'

import { getJobsHistory } from '@/services/api'

export function useJobsHistory(limit = 20) {
  return useQuery({
    queryKey: ['jobs-history', limit],
    queryFn: () => getJobsHistory(limit),
    refetchInterval: 4000,
  })
}