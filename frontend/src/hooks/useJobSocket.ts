import { useEffect } from 'react'

import { getWsUrl } from '@/services/config'
import { useJobStore } from '@/store/jobStore'
import type { WebSocketPayload } from '@/types/job'

export function useJobSocket(jobId: string | null) {
  const addLog = useJobStore((state) => state.addLog)
  const setStatus = useJobStore((state) => state.setStatus)
  const setConnection = useJobStore((state) => state.setConnection)

  useEffect(() => {
    if (!jobId) {
      return
    }

    const ws = new WebSocket(getWsUrl(jobId))
    setConnection('connecting')

    ws.onopen = () => {
      setConnection('connected')
    }

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as WebSocketPayload

        if (payload.type === 'log') {
          addLog(payload.data)
        }

        if (payload.type === 'status') {
          setStatus(payload.data)
        }

        if (payload.type === 'done') {
          setConnection('disconnected')
        }
      } catch {
        // Ignore malformed payloads
      }
    }

    ws.onerror = () => {
      setConnection('disconnected')
    }

    ws.onclose = () => {
      setConnection('disconnected')
    }

    return () => {
      ws.close()
    }
  }, [addLog, jobId, setConnection, setStatus])
}
