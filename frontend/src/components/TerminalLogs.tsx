import { useEffect, useMemo, useRef } from 'react'
import { Radio, TerminalSquare } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { JobLogEntry } from '@/types/job'

interface TerminalLogsProps {
  logs: JobLogEntry[]
  connection: 'idle' | 'connecting' | 'connected' | 'disconnected'
}

function formatTimestamp(timestamp: string) {
  try {
    return new Date(timestamp).toLocaleTimeString()
  } catch {
    return '--:--:--'
  }
}

export function TerminalLogs({ logs, connection }: TerminalLogsProps) {
  const terminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = terminalRef.current
    if (!element) {
      return
    }
    element.scrollTop = element.scrollHeight
  }, [logs])

  const connectionClass = useMemo(() => {
    if (connection === 'connected') return 'text-success'
    if (connection === 'connecting') return 'text-yellow-400'
    if (connection === 'disconnected') return 'text-red-400'
    return 'text-muted'
  }, [connection])

  return (
    <div className='glass rounded-3xl border border-border/80 p-5'>
      <Tabs defaultValue='logs'>
        <div className='mb-3 flex items-center justify-between gap-3'>
          <TabsList>
            <TabsTrigger value='logs'>Logs</TabsTrigger>
          </TabsList>

          <div className={`flex items-center gap-1 text-xs ${connectionClass}`}>
            <Radio className='size-3' />
            {connection}
          </div>
        </div>

        <TabsContent value='logs'>
          <div
            ref={terminalRef}
            className='h-[290px] overflow-y-auto rounded-2xl border border-border bg-slate-950/85 p-3 font-mono text-xs leading-6'
          >
            {logs.length === 0 ? (
              <div className='flex items-center gap-2 text-muted'>
                <TerminalSquare className='size-3' />
                aguardando logs...
              </div>
            ) : (
              logs.map((entry, index) => (
                <p key={`${entry.timestamp}-${index}`} className='text-slate-200'>
                  <span className='text-sky-400'>[{formatTimestamp(entry.timestamp)}]</span> {entry.message}
                </p>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
