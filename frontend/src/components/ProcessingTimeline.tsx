import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Check,
  Circle,
  Clock3,
  Download,
  Film,
  LoaderCircle,
  ScanFace,
  Wrench,
  Workflow,
} from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { TimelineStep } from '@/types/job'

interface ProcessingTimelineProps {
  steps: TimelineStep[]
  overallProgress?: number
  startedAt?: string | null
  finishedAt?: string | null
}

type SegmentTone = 'waiting' | 'completed' | 'active' | 'error'

const iconMap = {
  download: Download,
  prepare: Wrench,
  processing: Workflow,
  detecting: ScanFace,
  vertical: Film,
}

const statusLabel: Record<TimelineStep['status'], string> = {
  waiting: 'Aguardando',
  running: 'Executando',
  completed: 'Concluido',
  error: 'Erro',
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value))
}

function formatElapsed(seconds: number | null) {
  if (seconds === null || Number.isNaN(seconds) || seconds < 0) {
    return '--'
  }

  const safe = Math.floor(seconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secs = safe % 60

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
  }

  return `${minutes}m ${String(secs).padStart(2, '0')}s`
}

function deriveProgress(steps: TimelineStep[]) {
  if (!steps.length) {
    return 0
  }

  const total = steps.reduce((acc, step) => {
    if (step.status === 'completed') {
      return acc + 1
    }
    if (step.status === 'running') {
      return acc + Math.max(0.06, clamp(step.progress || 0))
    }
    if (step.status === 'error') {
      return acc + Math.max(0.05, clamp(step.progress || 0))
    }
    return acc
  }, 0)

  return clamp(total / steps.length)
}

function getSegmentToneFromStatus(status: TimelineStep['status']): SegmentTone {
  if (status === 'completed') return 'completed'
  if (status === 'running') return 'active'
  if (status === 'error') return 'error'
  return 'waiting'
}

function TimelineSegment({ tone, style }: { tone: SegmentTone; style: CSSProperties }) {
  return (
    <span
      className={cn(
        'absolute left-1/2 w-px -translate-x-1/2 rounded-full',
        tone === 'waiting' && 'bg-border/70',
        tone === 'completed' && 'bg-success/65',
        tone === 'error' && 'bg-danger/70',
        tone === 'active' && 'bg-accent/30',
      )}
      style={style}
    >
      {tone === 'active' ? (
        <motion.span
          className='absolute inset-0 w-px bg-accent'
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        />
      ) : null}
    </span>
  )
}

function TimelineNode({ status }: { status: TimelineStep['status'] }) {
  if (status === 'running') {
    return (
      <div className='relative grid size-9 place-items-center'>
        <motion.span
          className='absolute inset-0 rounded-full border-2 border-accent/25 border-t-accent'
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
        />
        <motion.span
          className='absolute inset-1 rounded-full border border-accent/30'
          animate={{ scale: [1, 1.08, 1], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        />
        <span className='size-2.5 rounded-full bg-accent' />
      </div>
    )
  }

  if (status === 'completed') {
    return (
      <motion.div
        className='grid size-9 place-items-center rounded-full border border-success/40 bg-success/12 text-success'
        initial={false}
        animate={{ scale: [0.96, 1.03, 1] }}
        transition={{ duration: 0.22 }}
      >
        <Check className='size-4' />
      </motion.div>
    )
  }

  if (status === 'error') {
    return (
      <div className='relative grid size-9 place-items-center rounded-full border border-danger/40 bg-danger/12 text-danger'>
        <motion.span
          className='absolute inset-0 rounded-full border border-danger/50'
          animate={{ scale: [1, 1.3], opacity: [0.55, 0] }}
          transition={{ duration: 1.1, repeat: Number.POSITIVE_INFINITY, ease: 'easeOut' }}
        />
        <AlertTriangle className='size-4' />
      </div>
    )
  }

  return (
    <div className='grid size-9 place-items-center rounded-full border border-border bg-card text-muted'>
      <Circle className='size-4' />
    </div>
  )
}

function StatusPill({ status }: { status: TimelineStep['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]',
        status === 'completed' && 'border-success/40 bg-success/10 text-success',
        status === 'running' && 'border-accent/35 bg-accent/10 text-foreground',
        status === 'error' && 'border-danger/45 bg-danger/10 text-danger',
        status === 'waiting' && 'border-border bg-surface text-muted',
      )}
    >
      {status === 'running' ? <LoaderCircle className='size-3 animate-spin' /> : null}
      {statusLabel[status]}
    </span>
  )
}

function StepProgressBar({ step }: { step: TimelineStep }) {
  const rawPct = Math.round(clamp(step.progress || 0) * 100)
  const pct = step.status === 'running' ? Math.min(rawPct, 99) : rawPct
  const indeterminate = step.status === 'running' && pct <= 5

  if (indeterminate) {
    return (
      <div className='relative h-2 overflow-hidden rounded-full bg-surface'>
        <motion.span
          className='absolute inset-y-0 w-1/3 rounded-full bg-accent/75'
          initial={{ x: '-120%' }}
          animate={{ x: ['-120%', '260%'] }}
          transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        />
      </div>
    )
  }

  return <Progress value={pct} />
}

function TimelineCard({ step, index, total }: { step: TimelineStep; index: number; total: number }) {
  const Icon = iconMap[step.id as keyof typeof iconMap] ?? Film
  const rawPct = Math.round(clamp(step.progress || 0) * 100)
  const pct = step.status === 'running' ? Math.min(rawPct, 99) : rawPct
  const isRunning = step.status === 'running'

  return (
    <motion.div
      layout='position'
      transition={{ duration: 0.2 }}
      className={cn(
        'rounded-[20px] border border-border bg-card p-4',
        isRunning && 'border-accent/45 bg-surface',
      )}
    >
      <div className='mb-3 flex flex-wrap items-start justify-between gap-3'>
        <div className='flex items-start gap-3'>
          <div className={cn('rounded-xl border border-border bg-surface p-2 text-muted', isRunning && 'text-foreground')}>
            <Icon className={cn('size-4', isRunning && 'animate-pulse')} />
          </div>

          <div>
            <p className='text-sm font-semibold'>{step.title}</p>
            <p className='text-xs text-muted'>Etapa {index + 1} de {total}</p>
            {isRunning ? <p className='mt-1 text-[11px] text-accent'>Em execucao agora</p> : null}
          </div>
        </div>

        <StatusPill status={step.status} />
      </div>

      {step.detail ? <p className='mb-3 text-xs text-muted'>{step.detail}</p> : null}

      <div className='mb-2 flex items-center justify-between text-[11px] text-muted'>
        <span>Progresso da etapa</span>
        <span>{isRunning && pct <= 5 ? '...' : `${pct}%`}</span>
      </div>
      <StepProgressBar step={step} />
    </motion.div>
  )
}

function CenterNodeColumn({
  upperTone,
  lowerTone,
  status,
}: {
  upperTone: SegmentTone | null
  lowerTone: SegmentTone | null
  status: TimelineStep['status']
}) {
  const nodeGap = '20px'

  return (
    <div className='relative z-10 flex h-full min-h-[112px] w-full items-center justify-center'>
      {upperTone ? <TimelineSegment tone={upperTone} style={{ top: 0, bottom: `calc(50% + ${nodeGap})` }} /> : null}
      {lowerTone ? <TimelineSegment tone={lowerTone} style={{ top: `calc(50% + ${nodeGap})`, bottom: 0 }} /> : null}
      <div className='relative z-10'>
        <TimelineNode status={status} />
      </div>
    </div>
  )
}

export function ProcessingTimeline({ steps, overallProgress, startedAt, finishedAt }: ProcessingTimelineProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!startedAt || finishedAt) {
      return
    }
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [finishedAt, startedAt])

  const progressRatio = overallProgress !== undefined ? clamp(overallProgress) : deriveProgress(steps)
  const progressPct = Math.round(progressRatio * 100)

  const runningStep = steps.find((step) => step.status === 'running')
  const errorStep = steps.find((step) => step.status === 'error')
  const completedCount = steps.filter((step) => step.status === 'completed').length

  const currentStageLabel = useMemo(() => {
    if (errorStep) return `Falha em: ${errorStep.title}`
    if (runningStep) return runningStep.title
    if (steps.length > 0 && completedCount === steps.length) return 'Pipeline concluida'
    return 'Aguardando inicio'
  }, [completedCount, errorStep, runningStep, steps])

  const elapsedSeconds = useMemo(() => {
    if (!startedAt) return null
    const startMs = Date.parse(startedAt)
    if (Number.isNaN(startMs)) return null

    const endMs = finishedAt ? Date.parse(finishedAt) : now
    if (Number.isNaN(endMs)) return null
    return Math.max(0, Math.floor((endMs - startMs) / 1000))
  }, [finishedAt, now, startedAt])

  return (
    <div className='glass rounded-[28px] border border-border/80 p-5 md:p-6'>
      <div className='mb-5 space-y-3'>
        <div>
          <h3 className='font-space text-lg font-semibold'>Pipeline de Processamento</h3>
          <p className='text-xs text-muted'>Timeline detalhada com status e progresso por etapa.</p>
        </div>

        <div className='grid gap-2 rounded-2xl border border-border bg-surface/65 p-3 md:grid-cols-3'>
          <div className='rounded-xl border border-border bg-card/70 px-3 py-2'>
            <p className='text-[11px] text-muted'>Etapa atual</p>
            <p className='truncate text-sm font-semibold'>{currentStageLabel}</p>
          </div>

          <div className='rounded-xl border border-border bg-card/70 px-3 py-2'>
            <p className='text-[11px] text-muted'>Progresso geral</p>
            <p className='text-sm font-semibold'>{progressPct}%</p>
          </div>

          <div className='rounded-xl border border-border bg-card/70 px-3 py-2'>
            <p className='text-[11px] text-muted'>Tempo corrido</p>
            <p className='inline-flex items-center gap-1.5 text-sm font-semibold'>
              <Clock3 className='size-3.5 text-muted' />
              {formatElapsed(elapsedSeconds)}
            </p>
          </div>
        </div>
      </div>

      <div className='space-y-3 md:hidden'>
        {steps.map((step, index) => {
          const upperTone = index > 0 ? getSegmentToneFromStatus(steps[index - 1].status) : null
          const lowerTone = index < steps.length - 1 ? getSegmentToneFromStatus(step.status) : null

          return (
            <motion.div key={step.id} layout='position' transition={{ duration: 0.2 }} className='grid grid-cols-[44px_1fr] gap-3'>
              <CenterNodeColumn upperTone={upperTone} lowerTone={lowerTone} status={step.status} />
              <TimelineCard step={step} index={index} total={steps.length} />
            </motion.div>
          )
        })}
      </div>

      <div className='hidden space-y-5 md:block'>
        {steps.map((step, index) => {
          const left = index % 2 === 0
          const upperTone = index > 0 ? getSegmentToneFromStatus(steps[index - 1].status) : null
          const lowerTone = index < steps.length - 1 ? getSegmentToneFromStatus(step.status) : null
          const card = <TimelineCard step={step} index={index} total={steps.length} />

          return (
            <motion.div
              key={step.id}
              layout='position'
              transition={{ duration: 0.2 }}
              className='grid grid-cols-[1fr_64px_1fr] items-stretch gap-4'
            >
              <div>{left ? card : null}</div>

              <CenterNodeColumn upperTone={upperTone} lowerTone={lowerTone} status={step.status} />

              <div>{!left ? card : null}</div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
