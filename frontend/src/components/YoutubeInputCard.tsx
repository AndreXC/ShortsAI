import { motion } from 'framer-motion'
import { CheckCircle2, Cpu, Link2, LoaderCircle, Settings2, Sparkles, Video } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { GenerationSettings } from '@/types/job'

export type PresetId = 'fast' | 'balanced' | 'quality'

interface YoutubeInputCardProps {
  url: string
  loading: boolean
  settings: GenerationSettings
  onUrlChange: (value: string) => void
  onGenerate: () => void
  onOpenSettings: () => void
  onApplyPreset: (preset: PresetId) => void
}

function validateYouTubeUrl(raw: string) {
  const value = raw.trim()
  if (!value) {
    return { isValid: false, tone: 'muted' as const, message: 'Cole um link do YouTube para iniciar a geracao.' }
  }

  const candidate = value.includes('://') ? value : `https://${value}`

  try {
    const parsed = new URL(candidate)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    const isYouTubeHost = host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')

    if (!isYouTubeHost) {
      return { isValid: false, tone: 'danger' as const, message: 'Use um link valido de youtube.com ou youtu.be.' }
    }

    const hasVideoId = parsed.searchParams.has('v') || parsed.pathname.includes('/shorts/') || host === 'youtu.be'
    if (!hasVideoId) {
      return { isValid: false, tone: 'danger' as const, message: 'Link incompleto. Informe o video especifico do YouTube.' }
    }

    return { isValid: true, tone: 'success' as const, message: 'URL valida. Tudo pronto para gerar o Shorts.' }
  } catch {
    return { isValid: false, tone: 'danger' as const, message: 'Formato de URL invalido. Verifique o link e tente novamente.' }
  }
}

function getActivePreset(settings: GenerationSettings): PresetId | null {
  if (
    settings.detector_backend === 'blaze' &&
    settings.youtube_quality === '720p' &&
    settings.detect_every_frames === 5 &&
    settings.codec === 'libx264' &&
    settings.preset === 'veryfast'
  ) {
    return 'fast'
  }

  if (
    settings.detector_backend === 'blaze' &&
    settings.youtube_quality === '1080p' &&
    settings.detect_every_frames === 3 &&
    settings.codec === 'libx264' &&
    settings.preset === 'medium'
  ) {
    return 'balanced'
  }

  if (
    settings.detector_backend === 'retinaface' &&
    settings.youtube_quality === '1080p' &&
    settings.detect_every_frames === 1 &&
    settings.codec === 'libx265' &&
    settings.preset === 'slow'
  ) {
    return 'quality'
  }

  return null
}

export function YoutubeInputCard({
  url,
  loading,
  settings,
  onUrlChange,
  onGenerate,
  onOpenSettings,
  onApplyPreset,
}: YoutubeInputCardProps) {
  const validation = validateYouTubeUrl(url)
  const isValid = validation.isValid
  const activePreset = getActivePreset(settings)

  const summaryItems = [
    { label: 'Detector', value: settings.detector_backend === 'blaze' ? 'BlazeFace' : 'RetinaFace', icon: Cpu },
    { label: 'Qualidade', value: settings.youtube_quality.toUpperCase(), icon: Video },
    { label: 'Detectar a cada', value: `${settings.detect_every_frames} frames`, icon: Sparkles },
    { label: 'Codec video', value: settings.codec, icon: Video },
    { label: 'Threads', value: `${settings.threads} CPU`, icon: Cpu },
  ]

  const presets: Array<{ id: PresetId; label: string; subtitle: string }> = [
    { id: 'fast', label: 'Rapido', subtitle: 'Entrega mais veloz' },
    { id: 'balanced', label: 'Equilibrado', subtitle: 'Qualidade + desempenho' },
    { id: 'quality', label: 'Qualidade maxima', subtitle: 'Mais precisao e detalhes' },
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

          <div className='flex items-center gap-2 text-xs'>
            {validation.tone === 'success' ? <CheckCircle2 className='size-3.5 text-success' /> : <span className='size-3.5' />}
            <p
              className={cn(
                'text-muted',
                validation.tone === 'success' && 'text-success',
                validation.tone === 'danger' && 'text-danger',
              )}
            >
              {validation.message}
            </p>
          </div>

          <div className='space-y-2'>
            <p className='text-xs font-medium text-muted'>Qualidade do video</p>
            <div className='grid gap-2 md:grid-cols-3'>
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type='button'
                  onClick={() => onApplyPreset(preset.id)}
                  className={cn(
                    'rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-surface',
                    activePreset === preset.id && 'border-accent bg-surface',
                  )}
                >
                  <p className='text-sm font-medium'>{preset.label}</p>
                  <p className='text-xs text-muted'>{preset.subtitle}</p>
                </button>
              ))}
            </div>
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
        <Button className='h-12 w-full text-base font-semibold' disabled={loading || !isValid} onClick={onGenerate}>
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
