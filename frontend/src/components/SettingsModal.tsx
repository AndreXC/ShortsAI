import {
  Aperture,
  AudioLines,
  Boxes,
  Cpu,
  Gauge,
  Info,
  MonitorUp,
  ScanFace,
  SlidersHorizontal,
  Sparkles,
  Timer,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { GenerationSettings } from '@/types/job'

interface SettingsModalProps {
  open: boolean
  settings: GenerationSettings
  onOpenChange: (open: boolean) => void
  onChange: <K extends keyof GenerationSettings>(key: K, value: GenerationSettings[K]) => void
  onReset: () => void
}

interface FieldProps {
  label: string
  description: string
  tooltip: string
  icon: ReactNode
  children: ReactNode
}

function Field({ label, description, tooltip, icon, children }: FieldProps) {
  return (
    <div className='space-y-3 rounded-2xl border border-border bg-surface/80 p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex items-start gap-2'>
          <span className='mt-0.5 text-muted'>{icon}</span>
          <div>
            <p className='text-sm font-medium'>{label}</p>
            <p className='text-xs text-muted'>{description}</p>
          </div>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <button className='text-muted transition hover:text-foreground' type='button'>
              <Info className='size-4' />
            </button>
          </TooltipTrigger>
          <TooltipContent className='max-w-xs'>{tooltip}</TooltipContent>
        </Tooltip>
      </div>
      {children}
    </div>
  )
}

export function SettingsModal({ open, settings, onOpenChange, onChange, onReset }: SettingsModalProps) {
  return (
    <TooltipProvider delayDuration={120}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configuracoes Avancadas</DialogTitle>
            <DialogDescription>
              Ajuste o processamento antes de gerar. Layout otimizado em 2 colunas para edicao rapida.
            </DialogDescription>
          </DialogHeader>

          <div className='hide-scrollbar grid max-h-[65vh] gap-3 overflow-y-auto pr-1 md:grid-cols-2'>
            <Field
              label='Backend de deteccao facial'
              description='Padrao: BlazeFace'
              tooltip='BlazeFace e mais rapido; RetinaFace melhora robustez em cenas complexas.'
              icon={<ScanFace className='size-4' />}
            >
              <select
                className='h-11 w-full rounded-xl border border-border bg-card px-3 text-sm'
                value={settings.detector_backend}
                onChange={(event) => onChange('detector_backend', event.target.value as GenerationSettings['detector_backend'])}
              >
                <option value='blaze'>BlazeFace (mais rapido)</option>
                <option value='retinaface'>RetinaFace (mais preciso)</option>
              </select>
            </Field>

            <Field
              label='Qualidade do video (YouTube)'
              description='Padrao: 1080p'
              tooltip='Controla a qualidade maxima do download. Se nao existir essa resolucao, o backend usa a melhor disponivel.'
              icon={<MonitorUp className='size-4' />}
            >
              <select
                className='h-11 w-full rounded-xl border border-border bg-card px-3 text-sm'
                value={settings.youtube_quality}
                onChange={(event) => onChange('youtube_quality', event.target.value as GenerationSettings['youtube_quality'])}
              >
                <option value='auto'>Auto (melhor disponivel)</option>
                <option value='360p'>360p</option>
                <option value='480p'>480p</option>
                <option value='720p'>720p</option>
                <option value='1080p'>1080p</option>
              </select>
            </Field>

            <Field
              label='Detectar a cada N frames'
              description='Padrao: 3'
              tooltip='Valor maior reduz custo, valor menor aumenta precisao de rastreio.'
              icon={<Timer className='size-4' />}
            >
              <Input
                type='number'
                min={1}
                max={60}
                value={settings.detect_every_frames}
                onChange={(event) => onChange('detect_every_frames', Number(event.target.value))}
              />
            </Field>

            <Field
              label='Smooth factor'
              description='Padrao: 0.08'
              tooltip='Controla a suavidade do movimento horizontal do enquadramento.'
              icon={<Sparkles className='size-4' />}
            >
              <Input
                type='number'
                step='0.01'
                min={0.01}
                max={1}
                value={settings.smooth_factor}
                onChange={(event) => onChange('smooth_factor', Number(event.target.value))}
              />
            </Field>

            <Field
              label='Confianca minima (BlazeFace)'
              description='Padrao: 0.5'
              tooltip='Aumente para reduzir falsos positivos em deteccao de rosto.'
              icon={<Aperture className='size-4' />}
            >
              <Input
                type='number'
                step='0.01'
                min={0}
                max={1}
                value={settings.min_detection_confidence}
                onChange={(event) => onChange('min_detection_confidence', Number(event.target.value))}
              />
            </Field>

            <Field
              label='Confianca minima (RetinaFace)'
              description='Padrao: 0.9'
              tooltip='Score minimo aceito para manter uma face como valida.'
              icon={<Aperture className='size-4' />}
            >
              <Input
                type='number'
                step='0.01'
                min={0}
                max={1}
                value={settings.retina_threshold}
                onChange={(event) => onChange('retina_threshold', Number(event.target.value))}
              />
            </Field>

            <Field
              label='Codec de video'
              description='Padrao: libx264'
              tooltip='Define compatibilidade e eficiencia de compressao.'
              icon={<Boxes className='size-4' />}
            >
              <select
                className='h-11 w-full rounded-xl border border-border bg-card px-3 text-sm'
                value={settings.codec}
                onChange={(event) => onChange('codec', event.target.value as GenerationSettings['codec'])}
              >
                <option value='libx264'>libx264</option>
                <option value='libx265'>libx265</option>
                <option value='mpeg4'>mpeg4</option>
              </select>
            </Field>

            <Field
              label='Codec de audio'
              description='Padrao: aac'
              tooltip='Codec da trilha de audio final no arquivo MP4.'
              icon={<AudioLines className='size-4' />}
            >
              <select
                className='h-11 w-full rounded-xl border border-border bg-card px-3 text-sm'
                value={settings.audio_codec}
                onChange={(event) => onChange('audio_codec', event.target.value as GenerationSettings['audio_codec'])}
              >
                <option value='aac'>aac</option>
                <option value='mp3'>mp3</option>
                <option value='pcm_s16le'>pcm_s16le</option>
              </select>
            </Field>

            <Field
              label='Bitrate'
              description='Padrao: 8000k'
              tooltip='Maior bitrate tende a gerar mais qualidade e arquivo maior.'
              icon={<Gauge className='size-4' />}
            >
              <Input value={settings.bitrate} onChange={(event) => onChange('bitrate', event.target.value)} />
            </Field>

            <Field
              label='Threads de CPU'
              description='Padrao: 4'
              tooltip='Mais threads aceleram render em maquinas com mais nucleos.'
              icon={<Cpu className='size-4' />}
            >
              <Input
                type='number'
                min={1}
                max={64}
                value={settings.threads}
                onChange={(event) => onChange('threads', Number(event.target.value))}
              />
            </Field>

            <Field
              label='Preset de compressao'
              description='Padrao: slow'
              tooltip='Define o equilibrio entre velocidade de encode e tamanho final.'
              icon={<SlidersHorizontal className='size-4' />}
            >
              <select
                className='h-11 w-full rounded-xl border border-border bg-card px-3 text-sm'
                value={settings.preset}
                onChange={(event) => onChange('preset', event.target.value as GenerationSettings['preset'])}
              >
                <option value='ultrafast'>ultrafast</option>
                <option value='superfast'>superfast</option>
                <option value='veryfast'>veryfast</option>
                <option value='faster'>faster</option>
                <option value='fast'>fast</option>
                <option value='medium'>medium</option>
                <option value='slow'>slow</option>
                <option value='slower'>slower</option>
                <option value='veryslow'>veryslow</option>
              </select>
            </Field>
          </div>

          <DialogFooter>
            <Button variant='outline' onClick={onReset}>
              Restaurar padroes
            </Button>
            <Button onClick={() => onOpenChange(false)}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
