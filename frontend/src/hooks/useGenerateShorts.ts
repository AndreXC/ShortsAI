import { useMutation } from '@tanstack/react-query'

import { generateShorts } from '@/services/api'
import { useJobStore } from '@/store/jobStore'
import type { GenerateRequest } from '@/types/job'

export function useGenerateShorts() {
  const setJob = useJobStore((state) => state.setJob)

  return useMutation({
    mutationFn: (payload: GenerateRequest) => generateShorts(payload),
    onSuccess: (data) => {
      setJob(data.job_id)
    },
  })
}
