import { motion } from 'framer-motion'
import { Clapperboard, FileText, Moon, SlidersHorizontal, SunMedium } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface HeaderProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  onOpenSettings: () => void
  onOpenShorts: () => void
  onOpenLogs: () => void
  canOpenLogs: boolean
}

export function Header({ theme, onToggleTheme, onOpenSettings, onOpenShorts, onOpenLogs, canOpenLogs }: HeaderProps) {
  return (
    <motion.header
      className='sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl'
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className='mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 md:px-8'>
        <div>
          <p className='font-space text-lg font-semibold'>AI Shorts Generator</p>
          <p className='text-xs text-muted'>YouTube para Shorts com recorte inteligente</p>
        </div>

        <div className='flex items-center gap-2'>
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

          <Button variant='outline' size='icon' onClick={onToggleTheme} aria-label='Alternar tema'>
            {theme === 'dark' ? <SunMedium className='size-4' /> : <Moon className='size-4' />}
          </Button>
        </div>
      </div>
    </motion.header>
  )
}
