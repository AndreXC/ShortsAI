import { motion } from 'framer-motion'
import { ArrowLeft, Copy, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { JobLogEntry } from '@/types/job'

interface LogsScreenProps {
  logs: JobLogEntry[]
  onBack: () => void
}

function formatTime(timestamp: string) {
  try {
    return new Date(timestamp).toLocaleTimeString()
  } catch {
    return '--:--:--'
  }
}

export function LogsScreen({ logs, onBack }: LogsScreenProps) {
  const handleCopy = async () => {
    const text = logs.map((entry) => `[${formatTime(entry.timestamp)}] ${entry.message}`).join('\n')
    if (!text) {
      return
    }
    await navigator.clipboard.writeText(text)
  }

  return (
    <motion.section
      className='mx-auto w-full max-w-6xl px-4 py-6 md:px-8'
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className='glass rounded-[28px] border border-border p-5 md:p-6'>
        <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <FileText className='size-5 text-muted' />
            <h2 className='font-space text-xl font-semibold'>Logs do Processamento</h2>
          </div>

          <div className='flex items-center gap-2'>
            <Button variant='outline' onClick={handleCopy}>
              <Copy className='size-4' />
              Copiar
            </Button>
            <Button variant='outline' onClick={onBack}>
              <ArrowLeft className='size-4' />
              Voltar
            </Button>
          </div>
        </div>

        <div className='hide-scrollbar h-[65vh] overflow-y-auto rounded-2xl border border-border bg-background/70 p-4 font-mono text-xs leading-6'>
          {logs.length === 0 ? (
            <p className='text-muted'>Ainda nao ha logs disponiveis para este job.</p>
          ) : (
            logs.map((entry, index) => (
              <p key={`${entry.timestamp}-${index}`}>
                <span className='text-muted'>[{formatTime(entry.timestamp)}]</span> {entry.message}
              </p>
            ))
          )}
        </div>
      </div>
    </motion.section>
  )
}
