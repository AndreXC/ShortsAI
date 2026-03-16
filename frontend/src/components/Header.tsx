import { motion } from 'framer-motion'
import { AudioLines, Clapperboard, FileText, Mic, Moon, SlidersHorizontal, SunMedium } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface HeaderProps {
  theme: 'light' | 'dark'
  mode: 'video' | 'voice'
  onToggleTheme: () => void
  onChangeMode: (mode: 'video' | 'voice') => void
  onOpenSettings: () => void
  onOpenShorts: () => void
  onOpenAudios: () => void
  onOpenLogs: () => void
  canOpenLogs: boolean
}

export function Header({
  theme,
  mode,
  onToggleTheme,
  onChangeMode,
  onOpenSettings,
  onOpenShorts,
  onOpenAudios,
  onOpenLogs,
  canOpenLogs,
}: HeaderProps) {
  return (
    <motion.header
      className='sticky top-0 z-40 border-b border-border bg-background'
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className='mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 md:px-8'>
        <div>
          <p className='font-space text-lg font-semibold'>AI Studio</p>
          <p className='text-xs text-muted'>
            {mode === 'video' ? 'Geracao de Shorts com recorte inteligente' : 'Clonagem de voz com TTS v2'}
          </p>
        </div>

        <div className='flex items-center gap-2'>
          <div className='hidden rounded-full border border-border bg-surface p-1 sm:inline-flex'>
            <button
              type='button'
              onClick={() => onChangeMode('video')}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                mode === 'video' ? 'bg-card text-foreground' : 'text-muted'
              }`}
            >
              Video
            </button>
            <button
              type='button'
              onClick={() => onChangeMode('voice')}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                mode === 'voice' ? 'bg-card text-foreground' : 'text-muted'
              }`}
            >
              Voz IA
            </button>
          </div>

          {mode === 'video' ? (
            <>
              <Button
                variant='outline'
                size='icon'
                onClick={() => onChangeMode('voice')}
                aria-label='Abrir gerador de voz'
                className='sm:hidden'
              >
                <Mic className='size-4' />
              </Button>

              <Button variant='outline' size='sm' onClick={onOpenShorts}>
                <Clapperboard className='size-4' />
                Shorts
              </Button>

              {canOpenLogs ? (
                <Button variant='outline' size='sm' onClick={onOpenLogs}>
                  <FileText className='size-4' />
                  Logs
                </Button>
              ) : null}

              <Button variant='outline' size='icon' onClick={onOpenSettings} aria-label='Abrir configuracoes'>
                <SlidersHorizontal className='size-4' />
              </Button>
            </>
          ) : (
            <>
              <Button variant='outline' size='sm' onClick={onOpenAudios}>
                <AudioLines className='size-4' />
                Audios
              </Button>

              <Button variant='outline' size='sm' onClick={() => onChangeMode('video')} className='sm:hidden'>
                <Mic className='size-4' />
                Voltar ao video
              </Button>

              <Button variant='outline' size='icon' onClick={onOpenSettings} aria-label='Abrir configuracoes de voz'>
                <SlidersHorizontal className='size-4' />
              </Button>
            </>
          )}

          <Button variant='outline' size='icon' onClick={onToggleTheme} aria-label='Alternar tema'>
            {theme === 'dark' ? <SunMedium className='size-4' /> : <Moon className='size-4' />}
          </Button>
        </div>
      </div>
    </motion.header>
  )
}
