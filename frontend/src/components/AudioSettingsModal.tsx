import {
  Gauge,
  Info,
  Languages,
  MessageSquareText,
  Sparkles,
  Wand2,
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
import { SPLIT_SENTENCE_OPTIONS, VOICE_EMOTION_OPTIONS, XTTS_LANGUAGE_OPTIONS, XTTS_SPEAKER_OPTIONS } from '@/lib/voice-options'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { AudioGenerationSettings } from '@/types/job'

interface AudioSettingsModalProps {
  open: boolean
  settings: AudioGenerationSettings
  onOpenChange: (open: boolean) => void
  onChange: <K extends keyof AudioGenerationSettings>(key: K, value: AudioGenerationSettings[K]) => void
  onReset: () => void
  onConfirm: () => void
  isSubmitting?: boolean
  confirmLabel?: string
  confirmMode?: 'generate' | 'save'
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

export function AudioSettingsModal({
  open,
  settings,
  onOpenChange,
  onChange,
  onReset,
  onConfirm,
  isSubmitting = false,
  confirmLabel = 'Confirmar e gerar',
  confirmMode = 'generate',
}: AudioSettingsModalProps) {
  const isGenerateMode = confirmMode === 'generate'

  return (
    <TooltipProvider delayDuration={120}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='w-[96vw] max-w-[980px] p-7 md:p-8'>
          <DialogHeader>
            <DialogTitle>Definições de áudio</DialogTitle>
            <DialogDescription>
              {isGenerateMode
                ? 'Revise os parâmetros do XTTS v2 antes de iniciar a geração. Estas opções seguem o fluxo configurável do `app2.py` e mantêm o visual alinhado ao restante da interface.'
                : 'Ajuste os parâmetros do XTTS v2 a qualquer momento. Estas opções seguem o fluxo configurável do `app2.py` e ficam salvas para a próxima geração.'}
            </DialogDescription>
          </DialogHeader>

          <div className='hide-scrollbar grid max-h-[68vh] gap-3 overflow-y-auto pr-1 md:grid-cols-2'>
            <Field
              label='Idioma'
              description='Lista oficial do XTTS v2'
              tooltip='Idiomas documentados oficialmente pelo XTTS v2: ar, zh-cn, cs, nl, en, fr, de, hi, hu, it, ja, ko, pl, pt, ru, es e tr.'
              icon={<Languages className='size-4' />}
            >
              <select
                className='h-11 w-full rounded-xl border border-border bg-card px-3 text-sm'
                value={settings.language}
                onChange={(event) => onChange('language', event.target.value)}
              >
                {XTTS_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.description})
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label='Velocidade da fala'
              description='Valor manual'
              tooltip='Controla a velocidade da fala. Menor que 1.0 fica mais lento; maior que 1.0 fica mais rapido.'
              icon={<Gauge className='size-4' />}
            >
              <Input
                type='number'
                step='0.1'
                min='0.5'
                max='3'
                value={settings.speed}
                onChange={(event) => onChange('speed', Number(event.target.value))}
              />
            </Field>

            <Field
              label='Dividir sentencas'
              description='Comportamento do pipeline'
              tooltip='Quando ativado, o texto e quebrado em sentencas antes da sintese. Pode melhorar estabilidade em textos mais longos.'
              icon={<MessageSquareText className='size-4' />}
            >
              <select
                className='h-11 w-full rounded-xl border border-border bg-card px-3 text-sm'
                value={String(settings.split_sentences)}
                onChange={(event) => onChange('split_sentences', event.target.value === 'true')}
              >
                {SPLIT_SENTENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label='Speaker do modelo'
              description='Modelos de voz padrão do coqui TTS V2'
              tooltip='O XTTS pode usar speakers internos além da clonagem por referencia. A primeira opcao mantem o comportamento padrao do projeto: usar a voz enviada pelo usuario.'
              icon={<Wand2 className='size-4' />}
            >
              <select
                className='h-11 w-full rounded-xl border border-border bg-card px-3 text-sm'
                value={settings.speaker}
                onChange={(event) => onChange('speaker', event.target.value)}
              >
                {XTTS_SPEAKER_OPTIONS.map((option) => (
                  <option key={option.value || 'reference'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label='Emocao'
              description='Emoção Determinada'
              tooltip='Alguns modelos aceitam estilos como calm, happy, sad e angry. Aqui a escolha fica restrita a essas opcoes.'
              icon={<Sparkles className='size-4' />}
            >
              <select
                className='h-11 w-full rounded-xl border border-border bg-card px-3 text-sm'
                value={settings.emotion}
                onChange={(event) => onChange('emotion', event.target.value)}
              >
                <option value=''>Não determinado</option>
                {VOICE_EMOTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <DialogFooter>
            <Button variant='outline' onClick={onReset} disabled={isSubmitting}>
              Restaurar padroes
            </Button>
            <Button variant='outline' onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={onConfirm} disabled={isSubmitting}>
              {isSubmitting ? 'Iniciando...' : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
