import { motion } from 'framer-motion'
import { Clock3, Film, Gauge } from 'lucide-react'

import type { JobMetrics } from '@/types/job'

interface ProgressIndicatorProps {
  metrics: JobMetrics
}

function formatEta(seconds?: number | null) {
  if (seconds === null || seconds === undefined) {
    return '--'
  }

  const safe = Math.max(0, Math.round(seconds))
  const min = Math.floor(safe / 60)
  const sec = safe % 60
  return `${min}m ${sec}s`
}

export function ProgressIndicator({ metrics }: ProgressIndicatorProps) {
  const progress = Math.max(0, Math.min(1, metrics.progress || 0))
  const percentage = Math.round(progress * 100)

  const radius = 66
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - progress)

  const cards = [
    {
      label: 'Tempo restante',
      value: formatEta(metrics.eta_seconds),
      icon: Clock3,
    },
    {
      label: 'Frames',
      value: `${metrics.frames_processed}/${metrics.total_frames || '--'}`,
      icon: Film,
    },
    {
      label: 'Velocidade',
      value: `${metrics.speed_fps.toFixed(2)} fps`,
      icon: Gauge,
    },
  ]

  return (
    <div className='glass rounded-[28px] border border-border/80 p-5 md:p-6'>
      <div className='grid gap-5 md:grid-cols-[200px_1fr] md:items-center'>
        <div className='mx-auto'>
          <div className='relative flex size-[164px] items-center justify-center'>
            <svg className='size-[164px] -rotate-90' viewBox='0 0 160 160'>
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
              <p className='font-space text-4xl font-semibold'>{percentage}%</p>
              <p className='text-xs text-muted'>Progresso geral</p>
            </div>
          </div>
        </div>

        <div className='grid gap-3 sm:grid-cols-3'>
          {cards.map((card) => {
            const Icon = card.icon
            return (
              <div key={card.label} className='rounded-2xl border border-border bg-card/80 p-3'>
                <div className='mb-2 flex items-center gap-2 text-muted'>
                  <Icon className='size-4' />
                  <span className='text-xs'>{card.label}</span>
                </div>
                <p className='font-space text-base font-semibold'>{card.value}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
