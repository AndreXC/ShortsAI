import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useEffect } from 'react'

import { cn } from '@/lib/utils'
import { useToastStore, type ToastTone } from '@/store/toastStore'

const toneIcon: Record<ToastTone, typeof CheckCircle2> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
}

const toneStyles: Record<ToastTone, string> = {
  info: 'bg-slate-500/70',
  success: 'bg-emerald-500/70',
  warning: 'bg-amber-500/70',
  error: 'bg-rose-500/70',
}

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts)
  const remove = useToastStore((state) => state.remove)

  useEffect(() => {
    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        remove(toast.id)
      }, toast.durationMs),
    )

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [remove, toasts])

  return (
    <div className='pointer-events-none fixed right-4 top-20 z-[60] flex w-[calc(100%-2rem)] max-w-[360px] flex-col gap-3 md:right-6'>
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = toneIcon[toast.tone]
          return (
            <motion.div
              key={toast.id}
              className='pointer-events-auto overflow-hidden rounded-[18px] border border-white/45 bg-white/75 shadow-[0_20px_45px_rgba(0,0,0,0.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#1b1b1dcc]/90'
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              layout
            >
              <div className='relative px-4 py-3'>
                <div className='mb-1.5 flex items-start justify-between gap-3'>
                  <div className='flex min-w-0 items-start gap-2.5'>
                    <div className='mt-0.5 rounded-full border border-black/5 bg-black/5 p-1.5 dark:border-white/10 dark:bg-white/10'>
                      <Icon className='size-3.5 text-foreground' />
                    </div>
                    <div className='min-w-0'>
                      <p className='truncate text-[13px] font-semibold text-foreground'>{toast.title}</p>
                      {toast.description ? (
                        <p className='line-clamp-2 pt-0.5 text-[12px] leading-4 text-muted'>{toast.description}</p>
                      ) : null}
                    </div>
                  </div>

                  <button
                    type='button'
                    onClick={() => remove(toast.id)}
                    className='rounded-full p-1 text-muted transition hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10'
                    aria-label='Fechar notificacao'
                  >
                    <X className='size-3.5' />
                  </button>
                </div>

                <div className='relative h-[2px] w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10'>
                  <motion.div
                    className={cn('absolute inset-y-0 left-0 rounded-full', toneStyles[toast.tone])}
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: toast.durationMs / 1000, ease: 'linear' }}
                  />
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
