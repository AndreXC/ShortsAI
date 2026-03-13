import { motion } from 'framer-motion'
import { Cpu, Link2, LoaderCircle, Settings2, Sparkles, Video } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { GenerationSettings } from '@/types/job'

interface YoutubeInputCardProps {
  url: string
  loading: boolean
  settings: GenerationSettings
  onUrlChange: (value: string) => void
  onGenerate: () => void
  onOpenSettings: () => void
}

export function YoutubeInputCard({
  url,
  loading,
  settings,
  onUrlChange,
  onGenerate,
  onOpenSettings,
}: YoutubeInputCardProps) {
  const isValid = /youtube\.com|youtu\.be/.test(url)

  const summaryItems = [
    { label: 'Detector', value: settings.detector_backend === 'blaze' ? 'BlazeFace' : 'RetinaFace', icon: Cpu },
    { label: 'Qualidade', value: settings.youtube_quality.toUpperCase(), icon: Video },
    { label: 'Detectar a cada', value: `${settings.detect_every_frames} frames`, icon: Sparkles },
    { label: 'Codec video', value: settings.codec, icon: Video },
    { label: 'Threads', value: `${settings.threads} CPU`, icon: Cpu },
  ]

  return (
    <motion.div
      className='mx-auto w-full max-w-3xl'
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38 }}
      layout
      layoutId='primary-flow-panel'
    >
      <Card>
        <CardHeader className='text-center'>
          <CardTitle className='text-3xl md:text-4xl'>AI Shorts Generator</CardTitle>
          <CardDescription>
            Transforme videos do YouTube em Shorts automaticamente usando Inteligencia Artificial.
          </CardDescription>
        </CardHeader>

        <CardContent className='space-y-5'>
          <div className='relative'>
            <Link2 className='pointer-events-none absolute left-4 top-4 size-4 text-muted' />
            <Input
              className='h-14 rounded-2xl pl-11 text-base'
              placeholder='Cole aqui o link do YouTube'
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
            />
          </div>

          <div className='grid gap-3 sm:grid-cols-2'>
            {summaryItems.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className='rounded-2xl border border-border bg-surface/80 p-3'>
                  <div className='mb-1 flex items-center gap-2 text-muted'>
                    <Icon className='size-4' />
                    <p className='text-xs'>{item.label}</p>
                  </div>
                  <p className='text-sm font-medium'>{item.value}</p>
                </div>
              )
            })}
          </div>

          <div className='flex items-center justify-between gap-3'>
            <Button variant='outline' onClick={onOpenSettings}>
              <Settings2 className='size-4' />
              Ajustar configuracoes
            </Button>

            <Button
              className='hidden h-12 min-w-[170px] text-base font-semibold md:inline-flex'
              disabled={loading || !isValid}
              onClick={onGenerate}
            >
              {loading ? (
                <>
                  <LoaderCircle className='size-4 animate-spin' />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className='size-4' />
                  Gerar Shorts
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className='fixed inset-x-4 bottom-4 z-40 md:hidden'>
        <Button className='h-12 w-full text-base font-semibold shadow-card' disabled={loading || !isValid} onClick={onGenerate}>
          {loading ? (
            <>
              <LoaderCircle className='size-4 animate-spin' />
              Gerando...
            </>
          ) : (
            <>
              <Sparkles className='size-4' />
              Gerar Shorts
            </>
          )}
        </Button>
      </div>
    </motion.div>
  )
}
