import { motion } from 'framer-motion'
import { Clock3, Download, FolderClock, PlayCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useJobsHistory } from '@/hooks/useJobsHistory'
import { cn } from '@/lib/utils'
import { getResultVideoUrl } from '@/services/api'
import type { JobHistoryItem, JobStatus } from '@/types/job'

interface HistoryPanelProps {
  currentJobId: string | null
  onOpenJob: (jobId: string) => void
}

const statusLabel: Record<JobStatus, string> = {
  queued: 'Na fila',
  running: 'Executando',
  completed: 'Concluido',
  error: 'Erro',
  cancelled: 'Cancelado',
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return '--'
  }
}

function formatDuration(seconds?: number | null) {
  if (seconds === undefined || seconds === null || seconds < 0) {
    return '--'
  }
  const min = Math.floor(seconds / 60)
  const sec = Math.round(seconds % 60)
  return `${min}:${String(sec).padStart(2, '0')}`
}

function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px]',
        status === 'completed' && 'border-success/35 bg-success/10 text-success',
        status === 'running' && 'border-accent/35 bg-accent/10 text-foreground',
        status === 'error' && 'border-danger/45 bg-danger/10 text-danger',
        status === 'cancelled' && 'border-amber-500/35 bg-amber-500/10 text-amber-300 dark:text-amber-200',
        status === 'queued' && 'border-border bg-surface text-muted',
      )}
    >
      {statusLabel[status]}
    </span>
  )
}

function HistoryRow({ item, active, onOpen }: { item: JobHistoryItem; active: boolean; onOpen: (id: string) => void }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card/80 p-3 transition',
        active && 'border-accent/45 bg-accent/10',
      )}
    >
      <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
        <div>
          <p className='font-space text-sm font-semibold'>Job #{item.job_id.slice(0, 8)}</p>
          <p className='text-xs text-muted'>{formatDate(item.created_at)}</p>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <div className='mb-3 grid grid-cols-2 gap-2 text-xs'>
        <div className='rounded-xl border border-border bg-surface/70 px-2 py-1.5'>
          <p className='text-muted'>Duracao</p>
          <p className='font-medium'>{formatDuration(item.duration_seconds)}</p>
        </div>
        <div className='rounded-xl border border-border bg-surface/70 px-2 py-1.5'>
          <p className='text-muted'>Resolucao</p>
          <p className='font-medium'>{item.result_metadata?.resolution || '--'}</p>
        </div>
      </div>

      <div className='flex flex-wrap gap-2'>
        <Button size='sm' variant='outline' onClick={() => onOpen(item.job_id)}>
          <PlayCircle className='size-4' />
          Abrir
        </Button>

        {item.status === 'completed' ? (
          <a href={getResultVideoUrl(item.job_id)} download={`short_${item.job_id}.mp4`}>
            <Button size='sm' variant='outline'>
              <Download className='size-4' />
              Download
            </Button>
          </a>
        ) : null}
      </div>
    </div>
  )
}

export function HistoryPanel({ currentJobId, onOpenJob }: HistoryPanelProps) {
  const { data, isLoading, isError } = useJobsHistory(10)
  const jobs = Array.isArray(data) ? data : []

  return (
    <motion.section
      className='glass rounded-[28px] border border-border p-5 md:p-6'
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className='mb-4 flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <FolderClock className='size-5 text-muted' />
          <h3 className='font-space text-lg font-semibold'>Historico de Jobs</h3>
        </div>
        <div className='flex items-center gap-1 text-xs text-muted'>
          <Clock3 className='size-3.5' />
          Atualiza automaticamente
        </div>
      </div>

      {isLoading ? <p className='text-sm text-muted'>Carregando historico...</p> : null}
      {isError ? <p className='text-sm text-danger'>Nao foi possivel carregar o historico.</p> : null}

      {!isLoading && !isError && jobs.length === 0 ? (
        <p className='text-sm text-muted'>Nenhum job gerado ainda.</p>
      ) : null}

      <div className='hide-scrollbar grid max-h-[48vh] gap-3 overflow-y-auto pr-1 md:grid-cols-2'>
        {jobs.map((item) => (
          <HistoryRow
            key={item.job_id}
            item={item}
            active={currentJobId === item.job_id}
            onOpen={onOpenJob}
          />
        ))}
      </div>
    </motion.section>
  )
}
