import axios from 'axios'

import { getApiUrl } from '@/services/config'
import type {
  CancelResponse,
  GenerateRequest,
  GenerateResponse,
  JobHistoryItem,
  JobStatusResponse,
  JobsBatchActionResponse,
} from '@/types/job'

const api = axios.create()

function normalizeHistoryResponse(payload: unknown): JobHistoryItem[] {
  let rawList: unknown[] = []

  if (Array.isArray(payload)) {
    rawList = payload
  } else if (payload && typeof payload === 'object') {
    const bag = payload as Record<string, unknown>

    if (Array.isArray(bag.jobs)) {
      rawList = bag.jobs
    } else if (Array.isArray(bag.items)) {
      rawList = bag.items
    } else if (Array.isArray(bag.data)) {
      rawList = bag.data
    } else if (Array.isArray(bag.history)) {
      rawList = bag.history
    }
  }

  return rawList.filter((item): item is JobHistoryItem => {
    if (!item || typeof item !== 'object') {
      return false
    }
    const row = item as Record<string, unknown>
    return typeof row.job_id === 'string' && typeof row.status === 'string' && typeof row.created_at === 'string'
  })
}

export async function generateShorts(payload: GenerateRequest): Promise<GenerateResponse> {
  const response = await api.post<GenerateResponse>(getApiUrl('/generate'), payload)
  return response.data
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const response = await api.get<JobStatusResponse>(getApiUrl(`/status/${jobId}`))
  return response.data
}

export async function cancelJob(jobId: string): Promise<CancelResponse> {
  const response = await api.post<CancelResponse>(getApiUrl(`/cancel/${jobId}`))
  return response.data
}

export async function getJobsHistory(limit = 20): Promise<JobHistoryItem[]> {
  const response = await api.get<unknown>(getApiUrl('/jobs'), {
    params: { limit },
  })
  return normalizeHistoryResponse(response.data)
}

export async function deleteJobs(jobIds: string[]): Promise<JobsBatchActionResponse> {
  const response = await api.post<JobsBatchActionResponse>(getApiUrl('/jobs/delete'), {
    job_ids: jobIds,
  })
  return response.data
}

export async function downloadJobsZip(jobIds: string[]): Promise<Blob> {
  const response = await api.post(getApiUrl('/jobs/download-zip'), { job_ids: jobIds }, { responseType: 'blob' })
  return response.data as Blob
}

export function getResultVideoUrl(jobId: string): string {
  return getApiUrl(`/result/${jobId}`)
}

export function getSourceVideoUrl(jobId: string): string {
  return getApiUrl(`/source/${jobId}`)
}

export async function pingHealth(): Promise<boolean> {
  try {
    await api.get(getApiUrl('/health'))
    return true
  } catch {
    return false
  }
}

export async function generateVoice(payload: FormData): Promise<GenerateResponse> {
  const response = await api.post<GenerateResponse>(getApiUrl('/voice/generate'), payload, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}

export async function getVoiceStatus(jobId: string): Promise<JobStatusResponse> {
  const response = await api.get<JobStatusResponse>(getApiUrl(`/voice/status/${jobId}`))
  return response.data
}

export function getVoiceResultAudioUrl(jobId: string): string {
  return getApiUrl(`/voice/result/${jobId}`)
}
