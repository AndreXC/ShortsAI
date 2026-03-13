import { motion } from 'framer-motion'
import { Download, Pause, Play, Share2, Sparkles } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { JobMetrics, ResultMetadata } from '@/types/job'

interface VideoPreviewProps {
  videoUrl: string
  onGenerateAgain: () => void
  metadata?: ResultMetadata | null
  metrics: JobMetrics
  settings: Record<string, unknown>
  generationTimeSeconds?: number | null
}

function formatDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) {
    return '--'
  }
  const total = Math.round(seconds)
  const min = Math.floor(total / 60)
  const sec = total % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}

function formatSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) {
    return '--'
  }
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(2)} MB`
}

export function VideoPreview({
  videoUrl,
  onGenerateAgain,
  metadata,
  metrics,
  settings,
  generationTimeSeconds,
}: VideoPreviewProps) {
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const fallbackDuration = useMemo(() => {
    if (metrics.total_frames > 0 && metrics.speed_fps > 0) {
      return metrics.total_frames / metrics.speed_fps
    }
    return undefined
  }, [metrics.speed_fps, metrics.total_frames])

  const exportInfo = [
    { label: 'Tempo de geracao', value: formatDuration(generationTimeSeconds) },
    { label: 'Duracao', value: formatDuration(metadata?.duration_seconds ?? fallbackDuration) },
    { label: 'Resolucao', value: metadata?.resolution || '1080x1920' },
    { label: 'Codec', value: metadata?.codec || String(settings.codec ?? 'libx264') },
    { label: 'Tamanho estimado', value: formatSize(metadata?.size_bytes) },
  ]

  const handleTogglePlay = () => {
    const element = videoRef.current
    if (!element) {
      return
    }

    if (element.paused) {
      element.play().catch(() => undefined)
      return
    }

    element.pause()
  }

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'AI Shorts Generator',
          text: 'Confira o short gerado com IA.',
          url: videoUrl,
        })
        return
      }
      await navigator.clipboard.writeText(videoUrl)
      window.alert('Link copiado para a area de transferencia.')
    } catch {
      // no-op
    }
  }

  return (
    <motion.section
      className='mx-auto w-full max-w-5xl'
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42 }}
      layout
      layoutId='primary-flow-panel'
    >
      <div className='grid gap-6 lg:grid-cols-[320px_1fr]'>
        <div className='mx-auto w-full max-w-[320px]'>
          <div className='glass overflow-hidden rounded-[2.2rem] border border-border p-3'>
            <div className='overflow-hidden rounded-[1.8rem] bg-black'>
              <video
                ref={videoRef}
                className='aspect-[9/16] h-auto w-full object-cover'
                src={videoUrl}
                controls
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              />
            </div>
          </div>
        </div>

        <div className='space-y-4'>
          <div className='glass rounded-[28px] border border-border p-6'>
            <h3 className='font-space text-2xl font-semibold'>Preview Final 9:16</h3>
            <p className='mt-1 text-sm text-muted'>Pronto para publicar em Shorts, Reels ou TikTok.</p>

            <div className='mt-5 grid gap-3 sm:grid-cols-2'>
              {exportInfo.map((item) => (
                <div key={item.label} className='rounded-2xl border border-border bg-surface/80 p-3'>
                  <p className='text-xs text-muted'>{item.label}</p>
                  <p className='mt-1 font-space text-lg font-semibold'>{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className='glass rounded-[28px] border border-border p-4'>
            <div className='grid gap-3 sm:grid-cols-2'>
              <Button variant='outline' onClick={handleTogglePlay}>
                {playing ? <Pause className='size-4' /> : <Play className='size-4' />}
                {playing ? 'Pausar' : 'Reproduzir'}
              </Button>

              <a href={videoUrl} download='shorts-generated.mp4'>
                <Button className='w-full' variant='default'>
                  <Download className='size-4' />
                  Download
                </Button>
              </a>

              <Button variant='outline' onClick={onGenerateAgain}>
                <Sparkles className='size-4' />
                Gerar novamente
              </Button>

              <Button variant='outline' onClick={handleShare}>
                <Share2 className='size-4' />
                Compartilhar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  )
}
