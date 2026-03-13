import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { AlertTriangle, FileText, RefreshCw, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { GeneratedShortsScreen } from '@/components/GeneratedShortsScreen'
import { LogsScreen } from '@/components/LogsScreen'
import { ProgressIndicator } from '@/components/ProgressIndicator'
import { ProcessingTimeline } from '@/components/ProcessingTimeline'
import { SettingsModal } from '@/components/SettingsModal'
import { VideoPreview } from '@/components/VideoPreview'
import { YoutubeInputCard } from '@/components/YoutubeInputCard'
import { Button } from '@/components/ui/button'
import { useGenerateShorts } from '@/hooks/useGenerateShorts'
import { useJobSocket } from '@/hooks/useJobSocket'
import { useJobStatusPolling } from '@/hooks/useJobStatusPolling'
import { cancelJob, getResultVideoUrl } from '@/services/api'
import { useJobStore } from '@/store/jobStore'
import { useToastStore } from '@/store/toastStore'
import { getBaseTimeline } from '@/types/defaults'
import type { GenerationSettings, StepStatus } from '@/types/job'

interface GeneratorPageProps {
  settings: GenerationSettings
  settingsOpen: boolean
  onSettingChange: <K extends keyof GenerationSettings>(key: K, value: GenerationSettings[K]) => void
  onSettingsOpenChange: (open: boolean) => void
  onResetSettings: () => void
  showLogsScreen: boolean
  onShowLogsScreenChange: (open: boolean) => void
  showGeneratedShortsScreen: boolean
  onShowGeneratedShortsScreenChange: (open: boolean) => void
}

const settingKeys: Array<keyof GenerationSettings> = [
  'detector_backend',
  'youtube_quality',
  'detect_every_frames',
  'smooth_factor',
  'min_detection_confidence',
  'retina_threshold',
  'codec',
  'audio_codec',
  'bitrate',
  'threads',
  'preset',
  'cut_seconds',
  'output_name',
]

function pickRuntimeSettings(runtimeSettings: Record<string, unknown> | null | undefined, fallback: GenerationSettings) {
  const next = { ...fallback }
  if (!runtimeSettings) {
    return next
  }

  settingKeys.forEach((key) => {
    const value = runtimeSettings[key]
    if (value !== undefined) {
      ;(next as Record<string, unknown>)[key] = value
    }
  })

  return next
}

export function GeneratorPage({
  settings,
  settingsOpen,
  onSettingChange,
  onSettingsOpenChange,
  onResetSettings,
  showLogsScreen,
  onShowLogsScreenChange,
  showGeneratedShortsScreen,
  onShowGeneratedShortsScreenChange,
}: GeneratorPageProps) {
  const [url, setUrl] = useState('')

  const mutation = useGenerateShorts()
  const cancelMutation = useMutation({
    mutationFn: (targetJobId: string) => cancelJob(targetJobId),
  })

  const jobId = useJobStore((state) => state.jobId)
  const status = useJobStore((state) => state.status)
  const logs = useJobStore((state) => state.logs)
  const reset = useJobStore((state) => state.reset)

  const pushToast = useToastStore((state) => state.push)

  useJobSocket(jobId)
  useJobStatusPolling(jobId)

  const timeline = status?.timeline ?? getBaseTimeline()
  const metrics =
    status?.metrics ?? {
      progress: 0,
      frames_processed: 0,
      total_frames: 0,
      speed_fps: 0,
      eta_seconds: null,
      phase: 'queued',
    }

  const screen = useMemo(() => {
    if (showLogsScreen) return 'logs'
    if (showGeneratedShortsScreen) return 'shorts'
    if (status?.status === 'completed') return 'done'
    if (jobId) return 'processing'
    return 'idle'
  }, [jobId, showGeneratedShortsScreen, showLogsScreen, status?.status])

  const runtimeSettings = useMemo(() => (status?.settings ?? {}) as Record<string, unknown>, [status?.settings])
  const retrySettings = useMemo(() => pickRuntimeSettings(runtimeSettings, settings), [runtimeSettings, settings])

  const retryUrl = useMemo(() => {
    const fromRuntime = runtimeSettings.url
    if (typeof fromRuntime === 'string' && fromRuntime.length > 0) {
      return fromRuntime
    }
    return url
  }, [runtimeSettings, url])

  const generationTimeSeconds =
    status?.started_at && status?.finished_at
      ? Math.max(
          0,
          Math.floor((new Date(status.finished_at).getTime() - new Date(status.started_at).getTime()) / 1000),
        )
      : null

  const resultUrl = jobId ? getResultVideoUrl(jobId) : ''

  const previousStatusRef = useRef<string | null>(null)
  const previousStepsRef = useRef<Record<string, StepStatus>>({})

  useEffect(() => {
    const current = status?.status
    if (!current) {
      return
    }

    const previous = previousStatusRef.current
    if (!previous) {
      previousStatusRef.current = current
      return
    }

    if (previous === current) {
      return
    }

    if (current === 'running') {
      pushToast({
        tone: 'info',
        title: 'Processamento iniciado',
        description: 'A timeline esta acompanhando as etapas em tempo real.',
      })
    }

    if (current === 'completed') {
      pushToast({
        tone: 'success',
        title: 'Video pronto',
        description: 'Seu Shorts foi gerado com sucesso.',
      })
    }

    if (current === 'error') {
      pushToast({
        tone: 'error',
        title: 'Falha na geracao',
        description: 'Confira a tela de logs para mais detalhes.',
      })
    }

    if (current === 'cancelled') {
      pushToast({
        tone: 'warning',
        title: 'Processamento cancelado',
        description: 'Voce pode iniciar novamente com um clique.',
      })
    }

    previousStatusRef.current = current
  }, [pushToast, status?.status])

  useEffect(() => {
    if (!status?.timeline?.length) {
      previousStepsRef.current = {}
      return
    }

    const previous = previousStepsRef.current
    const next: Record<string, StepStatus> = {}

    status.timeline.forEach((step) => {
      next[step.id] = step.status

      const previousStatus = previous[step.id]
      if (!previousStatus || previousStatus === step.status) {
        return
      }

      if (step.status === 'completed') {
        pushToast({
          tone: 'success',
          title: `Etapa concluida: ${step.title}`,
        })
      }

      if (step.status === 'error') {
        pushToast({
          tone: 'error',
          title: `Etapa com erro: ${step.title}`,
          description: step.detail ?? 'O processamento foi interrompido.',
        })
      }
    })

    previousStepsRef.current = next
  }, [pushToast, status?.timeline])

  const startGeneration = (nextUrl: string, nextSettings: GenerationSettings) => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    onShowLogsScreenChange(false)
    onShowGeneratedShortsScreenChange(false)
    previousStatusRef.current = null
    previousStepsRef.current = {}
    reset()
    setUrl(nextUrl)
    mutation.mutate({ url: nextUrl, settings: nextSettings })
  }

  const onGenerate = () => {
    startGeneration(url, settings)
  }

  const onRetry = () => {
    if (!retryUrl) {
      pushToast({
        tone: 'warning',
        title: 'URL indisponivel',
        description: 'Nao encontramos a URL para repetir o processamento.',
      })
      return
    }
    startGeneration(retryUrl, retrySettings)
  }

  const handleGenerateAgain = () => {
    onShowLogsScreenChange(false)
    onShowGeneratedShortsScreenChange(false)
    previousStatusRef.current = null
    previousStepsRef.current = {}
    reset()
    setUrl('')
  }

  const handleCancel = () => {
    if (!jobId) {
      return
    }

    cancelMutation.mutate(jobId, {
      onSuccess: (response) => {
        if (response.accepted) {
          pushToast({
            tone: 'warning',
            title: 'Cancelamento solicitado',
            description: 'O backend vai interromper o job em andamento.',
          })
          return
        }

        pushToast({
          tone: 'info',
          title: 'Job ja finalizado',
          description: response.message,
        })
      },
      onError: () => {
        pushToast({
          tone: 'error',
          title: 'Falha ao cancelar',
          description: 'Nao foi possivel enviar a solicitacao de cancelamento.',
        })
      },
    })
  }

  return (
    <>
      <LayoutGroup id='generator-flow'>
        <AnimatePresence mode='wait'>
          {screen === 'idle' ? (
            <motion.section
              key='idle'
              className='flex min-h-[72vh] flex-col items-center justify-center gap-4 px-4 py-4'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <YoutubeInputCard
                url={url}
                loading={mutation.isPending}
                settings={settings}
                onUrlChange={setUrl}
                onGenerate={onGenerate}
                onOpenSettings={() => onSettingsOpenChange(true)}
              />

              {mutation.isError ? (
                <p className='rounded-full border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger'>
                  Nao foi possivel iniciar a geracao. Verifique se o backend esta online.
                </p>
              ) : null}
            </motion.section>
          ) : null}

          {screen === 'processing' ? (
            <motion.section
              key='processing'
              className='mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 md:px-8'
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <motion.div layout layoutId='primary-flow-panel' className='space-y-4'>
                <ProgressIndicator metrics={metrics} />

                {status?.status === 'running' || status?.status === 'queued' ? (
                  <div className='flex justify-end'>
                    <Button variant='outline' onClick={handleCancel} disabled={cancelMutation.isPending}>
                      <Square className='size-4' />
                      {cancelMutation.isPending ? 'Cancelando...' : 'Cancelar processamento'}
                    </Button>
                  </div>
                ) : null}

                {status?.status === 'error' || status?.status === 'cancelled' ? (
                  <div className='rounded-2xl border border-danger/40 bg-danger/10 p-4'>
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                      <div className='flex items-start gap-2'>
                        <AlertTriangle className='mt-0.5 size-4 text-danger' />
                        <div>
                          <p className='text-sm font-medium text-danger'>
                            {status.status === 'cancelled'
                              ? 'Processamento cancelado. Confira os logs.'
                              : 'Problemas ao gerar video. Check logs.'}
                          </p>
                          <p className='text-xs text-muted'>
                            {status.error || 'O processamento foi interrompido para evitar inconsistencias.'}
                          </p>
                        </div>
                      </div>

                      <div className='flex flex-wrap gap-2'>
                        <Button variant='outline' onClick={onRetry}>
                          <RefreshCw className='size-4' />
                          Tentar novamente
                        </Button>
                        <Button variant='outline' onClick={() => onShowLogsScreenChange(true)}>
                          <FileText className='size-4' />
                          Abrir Logs
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <ProcessingTimeline
                  steps={timeline}
                  overallProgress={metrics.progress}
                  startedAt={status?.started_at}
                  finishedAt={status?.finished_at}
                />
              </motion.div>
            </motion.section>
          ) : null}

          {screen === 'done' ? (
            <motion.section
              key='done'
              className='px-4 py-6 md:px-8'
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <VideoPreview
                videoUrl={resultUrl}
                onGenerateAgain={handleGenerateAgain}
                metadata={status?.result_metadata}
                metrics={metrics}
                settings={runtimeSettings}
                generationTimeSeconds={generationTimeSeconds}
              />
            </motion.section>
          ) : null}

          {screen === 'logs' ? (
            <motion.section key='logs'>
              <LogsScreen logs={logs} onBack={() => onShowLogsScreenChange(false)} />
            </motion.section>
          ) : null}

          {screen === 'shorts' ? (
            <motion.section key='shorts'>
              <GeneratedShortsScreen onBack={() => onShowGeneratedShortsScreenChange(false)} />
            </motion.section>
          ) : null}
        </AnimatePresence>
      </LayoutGroup>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        onOpenChange={onSettingsOpenChange}
        onChange={onSettingChange}
        onReset={onResetSettings}
      />
    </>
  )
}
