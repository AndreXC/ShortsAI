import { create } from 'zustand'

import { getBaseTimeline, normalizeTimeline } from '@/types/defaults'
import type { JobLogEntry, JobStatusResponse } from '@/types/job'

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected'

interface JobStore {
  jobId: string | null
  status: JobStatusResponse | null
  logs: JobLogEntry[]
  connection: ConnectionState
  setJob: (jobId: string) => void
  setStatus: (status: JobStatusResponse) => void
  addLog: (log: JobLogEntry) => void
  setConnection: (state: ConnectionState) => void
  reset: () => void
}

const initialState = {
  jobId: null,
  status: null,
  logs: [] as JobLogEntry[],
  connection: 'idle' as ConnectionState,
}

export const useJobStore = create<JobStore>((set) => ({
  ...initialState,
  setJob: (jobId) =>
    set({
      jobId,
      logs: [],
      connection: 'connecting',
      status: {
        job_id: jobId,
        status: 'queued',
        created_at: new Date().toISOString(),
        timeline: getBaseTimeline(),
        metrics: {
          progress: 0,
          frames_processed: 0,
          total_frames: 0,
          speed_fps: 0,
          eta_seconds: null,
          phase: 'queued',
        },
        logs: [],
        settings: {},
        result_metadata: null,
        version: 0,
      },
    }),
  setStatus: (status) =>
    set((state) => {
      const seen = new Set(state.logs.map((entry) => `${entry.timestamp}-${entry.message}`))
      const mergedLogs = [...state.logs]

      status.logs.forEach((entry) => {
        const key = `${entry.timestamp}-${entry.message}`
        if (!seen.has(key)) {
          mergedLogs.push(entry)
          seen.add(key)
        }
      })

      return {
        status: {
          ...status,
          timeline: normalizeTimeline(status.timeline),
        },
        logs: mergedLogs,
      }
    }),
  addLog: (log) =>
    set((state) => {
      const key = `${log.timestamp}-${log.message}`
      const exists = state.logs.some((entry) => `${entry.timestamp}-${entry.message}` === key)
      if (exists) {
        return state
      }
      return { logs: [...state.logs, log] }
    }),
  setConnection: (connection) => set({ connection }),
  reset: () => set(initialState),
}))
