import { motion } from 'framer-motion'
import { AlertTriangle, Check, Circle, LoaderCircle } from 'lucide-react'
import { useMemo, type CSSProperties } from 'react'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  deriveVoiceOverallProgress,
  deriveVoiceSubtaskProgress,
  getCurrentVoiceStageLabel,
  getSegmentToneFromStatus,
  type SegmentTone,
  type SubtaskState,
} from '@/lib/voice-pipeline-progress'
import type { TimelineStep } from '@/types/job'

interface VoicePipelineFlowProps {
  steps: TimelineStep[]
  startedAt?: string | null
  finishedAt?: string | null
}

const statusLabel: Record<TimelineStep['status'], string> = {
  waiting: 'Aguardando',
  running: 'Executando',
  completed: 'Concluido',
  error: 'Erro',
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
      <div className='relative grid size-8 place-items-center sm:size-9'>
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
        <span className='size-2 rounded-full bg-accent sm:size-2.5' />
      </div>
    )
  }

  if (status === 'completed') {
    return (
      <motion.div
        className='grid size-8 place-items-center rounded-full border border-success/40 bg-success/12 text-success sm:size-9'
        initial={false}
        animate={{ scale: [0.96, 1.03, 1] }}
        transition={{ duration: 0.22 }}
      >
        <Check className='size-3.5 sm:size-4' />
      </motion.div>
    )
  }

  if (status === 'error') {
    return (
      <div className='relative grid size-8 place-items-center rounded-full border border-danger/40 bg-danger/12 text-danger sm:size-9'>
        <motion.span
          className='absolute inset-0 rounded-full border border-danger/50'
          animate={{ scale: [1, 1.3], opacity: [0.55, 0] }}
          transition={{ duration: 1.1, repeat: Number.POSITIVE_INFINITY, ease: 'easeOut' }}
        />
        <AlertTriangle className='size-3.5 sm:size-4' />
      </div>
    )
  }

  return (
    <div className='grid size-8 place-items-center rounded-full border border-border bg-card text-muted sm:size-9'>
      <Circle className='size-3.5 sm:size-4' />
    </div>
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
  const nodeGap = '18px'

  return (
    <div className='relative z-10 flex h-full min-h-[96px] w-full items-center justify-center sm:min-h-[112px]'>
      {upperTone ? <TimelineSegment tone={upperTone} style={{ top: 0, bottom: `calc(50% + ${nodeGap})` }} /> : null}
      {lowerTone ? <TimelineSegment tone={lowerTone} style={{ top: `calc(50% + ${nodeGap})`, bottom: 0 }} /> : null}
      <div className='relative z-10'>
        <TimelineNode status={status} />
      </div>
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

function StepProgressBar({ ratio, status }: { ratio: number; status: TimelineStep['status'] }) {
  const pct = status === 'running' ? Math.min(Math.round(ratio * 100), 99) : Math.round(ratio * 100)
  const indeterminate = status === 'running' && pct <= 5

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

function StepProgressCircle({ ratio, status }: { ratio: number; status: TimelineStep['status'] }) {
  const percentage = Math.round(ratio * 100)
  const radius = 24
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - ratio)

  return (
    <div className='relative flex size-[56px] items-center justify-center sm:size-[62px]'>
      <svg className='size-[56px] -rotate-90 sm:size-[62px]' viewBox='0 0 62 62'>
        <circle cx='31' cy='31' r={radius} fill='none' stroke='rgb(var(--color-border))' strokeWidth='5' />
        <motion.circle
          cx='31'
          cy='31'
          r={radius}
          fill='none'
          stroke={
            status === 'completed'
              ? 'rgb(var(--color-success))'
              : status === 'error'
                ? 'rgb(var(--color-danger))'
                : 'rgb(var(--color-accent))'
          }
          strokeWidth='5'
          strokeLinecap='round'
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.35 }}
        />
      </svg>

      <div className='absolute text-center'>
        {status === 'running' ? (
          <LoaderCircle className='mx-auto size-3.5 animate-spin text-foreground sm:size-4' />
        ) : status === 'completed' ? (
          <Check className='mx-auto size-3.5 text-success sm:size-4' />
        ) : status === 'error' ? (
          <AlertTriangle className='mx-auto size-3.5 text-danger sm:size-4' />
        ) : (
          <p className='text-[10px] font-semibold text-foreground sm:text-[11px]'>{percentage}%</p>
        )}
      </div>
    </div>
  )
}

function OverallProgressCircle({ progress }: { progress: number }) {
  const percentage = Math.round(progress * 100)
  const radius = 66
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - progress)

  return (
    <div className='mx-auto'>
      <div className='relative flex size-[128px] items-center justify-center sm:size-[148px] md:size-[164px]'>
        <svg className='size-[128px] -rotate-90 sm:size-[148px] md:size-[164px]' viewBox='0 0 160 160'>
          <circle cx='80' cy='80' r={radius} fill='none' stroke='rgb(var(--color-border))' strokeWidth='10' />
          <motion.circle
            cx='80'
            cy='80'
            r={radius}
            fill='none'
            stroke='rgb(var(--color-accent))'
            strokeWidth='10'
            strokeLinecap='round'
            strokeDasharray={circumference}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.5 }}
          />
        </svg>

        <div className='absolute text-center'>
          <p className='font-space text-3xl font-semibold sm:text-[2rem] md:text-4xl'>{percentage}%</p>
          <p className='text-xs text-muted'>Progresso geral</p>
        </div>
      </div>
    </div>
  )
}

function SubtaskList({ items }: { items: Array<{ label: string; state: SubtaskState }> }) {
  return (
    <div className='space-y-1.5'>
      {items.map((item) => (
        <div key={item.label} className='flex items-start gap-2 text-xs text-muted'>
          <span
            className={cn(
              'mt-0.5 inline-flex size-4 items-center justify-center rounded-full border',
              item.state === 'completed' && 'border-success/45 bg-success/10 text-success',
              item.state === 'active' && 'border-accent/35 bg-accent/10 text-foreground',
              item.state === 'error' && 'border-danger/45 bg-danger/10 text-danger',
              item.state === 'waiting' && 'border-border bg-card text-muted',
            )}
          >
            {item.state === 'completed' ? <Check className='size-2.5' /> : null}
            {item.state === 'error' ? <AlertTriangle className='size-2.5' /> : null}
          </span>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

function TimelineCard({ step, index, total }: { step: TimelineStep; index: number; total: number }) {
  const derived = deriveVoiceSubtaskProgress(step)
  const pct = step.status === 'running' ? Math.min(Math.round(derived.ratio * 100), 99) : Math.round(derived.ratio * 100)
  const Icon = derived.icon
  const isRunning = step.status === 'running'

  return (
    <motion.div
      layout='position'
      transition={{ duration: 0.2 }}
      className={cn('rounded-[20px] border border-border bg-card p-3.5 sm:p-4', isRunning && 'border-accent/45 bg-surface')}
    >
      <div className='mb-3 flex flex-wrap items-start justify-between gap-3'>
        <div className='flex min-w-0 items-start gap-3'>
          <StepProgressCircle ratio={derived.ratio} status={step.status} />

          <div className='min-w-0'>
            <div className={cn('mb-2 inline-flex rounded-xl border border-border bg-surface p-2 text-muted', isRunning && 'text-foreground')}>
              <Icon className={cn('size-4', isRunning && 'animate-pulse')} />
            </div>
            <p className='text-sm font-semibold'>{step.title}</p>
            <p className='text-xs text-muted'>Etapa {index + 1} de {total}</p>
          </div>
        </div>

        <StatusPill status={step.status} />
      </div>

      {step.detail ? <p className='mb-3 text-xs text-muted'>{step.detail}</p> : null}

      {derived.items.length ? <div className='mb-3'><SubtaskList items={derived.items} /></div> : null}

      <div className='mb-2 flex items-center justify-between text-[11px] text-muted'>
        <span>Progresso por subtarefas</span>
        <span>{step.status === 'completed' ? '100%' : `${pct}%`}</span>
      </div>
      <StepProgressBar ratio={derived.ratio} status={step.status} />
    </motion.div>
  )
}

export function VoicePipelineFlow({ steps }: VoicePipelineFlowProps) {
  const completedCount = useMemo(() => steps.filter((step) => step.status === 'completed').length, [steps])
  const overallProgress = useMemo(() => deriveVoiceOverallProgress(steps), [steps])
  const currentStageLabel = useMemo(() => getCurrentVoiceStageLabel(steps), [steps])
  const isFinished = useMemo(() => steps.length > 0 && steps.every((step) => step.status === 'completed'), [steps])

  const completionAnimation = useMemo(
    () =>
      isFinished
        ? { borderColor: ['rgb(var(--color-border))', 'rgb(var(--color-success) / 0.55)', 'rgb(var(--color-border))'] }
        : { borderColor: 'rgb(var(--color-border))' },
    [isFinished],
  )

  const completionTransition = useMemo(
    () => (isFinished ? { duration: 1.05, times: [0, 0.55, 1] } : { duration: 0.2 }),
    [isFinished],
  )

  return (
    <motion.div
      className='glass rounded-[28px] border border-border/80 p-4 sm:p-5 md:p-6'
      animate={completionAnimation}
      transition={completionTransition}
    >
      <div className='mb-5 grid gap-5 md:grid-cols-[200px_1fr] md:items-center'>
        <OverallProgressCircle progress={overallProgress} />

        <div className='space-y-3'>
          <div>
            <h3 className='font-space text-lg font-semibold'>Pipeline de Clonagem de Voz</h3>
            <p className='text-xs text-muted'>Timeline detalhada com status e progresso por subtarefa em cada etapa.</p>
          </div>

          <div className='grid gap-2 md:grid-cols-2'>
            <div className='rounded-xl border border-border bg-card/70 px-3 py-2'>
              <p className='text-[11px] text-muted'>Etapa atual</p>
              <p className='truncate text-sm font-semibold'>{currentStageLabel}</p>
            </div>

            <div className='rounded-xl border border-border bg-card/70 px-3 py-2'>
              <p className='text-[11px] text-muted'>Etapas concluidas</p>
              <p className='text-sm font-semibold'>{completedCount}/{steps.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className='space-y-4 md:hidden'>
        {steps.map((step, index) => {
          const upperTone = index > 0 ? getSegmentToneFromStatus(steps[index - 1].status) : null
          const lowerTone = index < steps.length - 1 ? getSegmentToneFromStatus(step.status) : null

          return (
            <motion.div
              key={step.id}
              layout='position'
              transition={{ duration: 0.2 }}
              className='grid grid-cols-[38px_1fr] gap-3 sm:grid-cols-[44px_1fr]'
            >
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
    </motion.div>
  )
}
