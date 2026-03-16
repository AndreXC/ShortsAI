import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, AudioLines, CheckCircle2, LoaderCircle, Mic, MicOff, Upload, Wand2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { AudioSettingsModal } from '@/components/AudioSettingsModal'
import { GeneratedVoiceAudiosScreen } from '@/components/GeneratedVoiceAudiosScreen'
import { VoicePipelineFlow } from '@/components/VoicePipelineFlow'
import { Button } from '@/components/ui/button'
import { upsertVoiceHistory } from '@/lib/voice-storage'
import { cn } from '@/lib/utils'
import { generateVoice, getVoiceResultAudioUrl, getVoiceStatus } from '@/services/api'
import { getVoiceWsUrl } from '@/services/config'
import { useToastStore } from '@/store/toastStore'
import { defaultAudioSettings, getVoiceBaseTimeline, normalizeVoiceTimeline } from '@/types/defaults'
import type { AudioGenerationSettings, JobStatusResponse, TimelineStep, WebSocketPayload } from '@/types/job'

type InputMode = 'upload' | 'record'

interface VoiceGeneratorPageProps {
  settings: AudioGenerationSettings
  settingsOpen: boolean
  onSettingsOpenChange: (open: boolean) => void
  onSettingChange: <K extends keyof AudioGenerationSettings>(key: K, value: AudioGenerationSettings[K]) => void
  onResetSettings: () => void
  showGeneratedAudiosScreen: boolean
  onShowGeneratedAudiosScreenChange: (open: boolean) => void
}

function formatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return '--'
  }
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${minutes}m ${String(rest).padStart(2, '0')}s`
}

function formatCompactDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return '--'
  }
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function formatBytes(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--'
  const bytes = Math.max(0, value)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function extensionFromMimeType(mimeType: string) {
  const lower = mimeType.toLowerCase()
  if (lower.includes('ogg')) return 'ogg'
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3'
  if (lower.includes('wav')) return 'wav'
  if (lower.includes('m4a') || lower.includes('mp4')) return 'm4a'
  if (lower.includes('webm')) return 'webm'
  return 'webm'
}

function initialVoiceStatus(jobId: string, settings: AudioGenerationSettings): JobStatusResponse {
  return {
    job_id: jobId,
    status: 'queued',
    created_at: new Date().toISOString(),
    timeline: getVoiceBaseTimeline(),
    metrics: {
      progress: 0,
      frames_processed: 0,
      total_frames: 0,
      speed_fps: 0,
      eta_seconds: null,
      phase: 'queued',
    },
    logs: [],
    settings: { model_name: 'xtts_v2', ...settings },
    result_metadata: null,
    version: 0,
  }
}

export function VoiceGeneratorPage({
  settings,
  settingsOpen,
  onSettingsOpenChange,
  onSettingChange,
  onResetSettings,
  showGeneratedAudiosScreen,
  onShowGeneratedAudiosScreenChange,
}: VoiceGeneratorPageProps) {
  const pushToast = useToastStore((state) => state.push)

  const [inputMode, setInputMode] = useState<InputMode>('upload')
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [referencePreviewUrl, setReferencePreviewUrl] = useState('')
  const [referenceDuration, setReferenceDuration] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<JobStatusResponse | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [recordError, setRecordError] = useState<string | null>(null)
  const [pendingGenerate, setPendingGenerate] = useState(false)
  const savedHistoryRef = useRef<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordChunksRef = useRef<Blob[]>([])

  const timeline: TimelineStep[] = status?.timeline ?? getVoiceBaseTimeline()
  const isCompleted = status?.status === 'completed'
  const usesModelSpeaker = settings.speaker.trim().length > 0
  const screen = useMemo(() => {
    if (showGeneratedAudiosScreen) return 'library'
    if (isCompleted) return 'done'
    if (jobId) return 'processing'
    return 'idle'
  }, [isCompleted, jobId, showGeneratedAudiosScreen])

  const generationSeconds =
    status?.started_at && status?.finished_at
      ? Math.max(0, Math.floor((new Date(status.finished_at).getTime() - new Date(status.started_at).getTime()) / 1000))
      : null

  const resultAudioUrl = jobId ? getVoiceResultAudioUrl(jobId) : ''

  const canGenerate = (usesModelSpeaker || !!referenceFile) && text.trim().length > 0 && !isSubmitting

  useEffect(() => {
    if (!isRecording) return
    const timer = window.setInterval(() => setRecordSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [isRecording])

  useEffect(() => {
    if (!referenceFile) {
      setReferencePreviewUrl('')
      setReferenceDuration(null)
      return
    }

    const objectUrl = window.URL.createObjectURL(referenceFile)
    setReferencePreviewUrl(objectUrl)

    return () => {
      window.URL.revokeObjectURL(objectUrl)
    }
  }, [referenceFile])

  useEffect(() => {
    if (!referencePreviewUrl) {
      setReferenceDuration(null)
      return
    }

    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.src = referencePreviewUrl

    const handleLoadedMetadata = () => {
      setReferenceDuration(Number.isFinite(audio.duration) ? audio.duration : null)
    }
    const handleError = () => {
      setReferenceDuration(null)
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('error', handleError)
      audio.src = ''
    }
  }, [referencePreviewUrl])

  useEffect(() => {
    if (!usesModelSpeaker) {
      return
    }

    setReferenceFile(null)
    setRecordError(null)

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
    setIsRecording(false)
    setRecordSeconds(0)
  }, [usesModelSpeaker])

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop()
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  useEffect(() => {
    if (!jobId) return

    const ws = new WebSocket(getVoiceWsUrl(jobId))

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as WebSocketPayload
        if (payload.type === 'status') {
          setStatus({
            ...payload.data,
            timeline: normalizeVoiceTimeline(payload.data.timeline),
          })
          return
        }
      } catch {
        // Ignore malformed websocket payloads.
      }
    }

    return () => ws.close()
  }, [jobId])

  useEffect(() => {
    if (!jobId || status?.status !== 'completed') {
      return
    }

    if (savedHistoryRef.current === jobId) {
      return
    }

    upsertVoiceHistory({
      job_id: jobId,
      created_at: status.created_at,
      finished_at: status.finished_at ?? null,
      text_preview: text.trim(),
      reference_name: referenceFile?.name ?? null,
      input_mode: inputMode,
      result_url: getVoiceResultAudioUrl(jobId),
      settings: { ...settings },
      result_metadata: status.result_metadata ?? null,
    })
    savedHistoryRef.current = jobId
  }, [inputMode, jobId, referenceFile?.name, settings, status?.created_at, status?.finished_at, status?.result_metadata, status?.status, text])

  useEffect(() => {
    if (!jobId) return

    let active = true
    const timer = window.setInterval(async () => {
      try {
        const fresh = await getVoiceStatus(jobId)
        if (!active) return
        setStatus({
          ...fresh,
          timeline: normalizeVoiceTimeline(fresh.timeline),
        })

        if (fresh.status === 'completed' || fresh.status === 'error' || fresh.status === 'cancelled') {
          window.clearInterval(timer)
        }
      } catch {
        // Best effort polling fallback.
      }
    }, 1600)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [jobId])

  const handleSwitchMode = (nextMode: InputMode) => {
    if (usesModelSpeaker) return
    if (nextMode === inputMode) return
    setInputMode(nextMode)
    setReferenceFile(null)
    setRecordError(null)

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
    setIsRecording(false)
    setRecordSeconds(0)
  }

  const handlePickFile = (file: File | null) => {
    if (usesModelSpeaker) return
    if (!file) return
    setReferenceFile(file)
    setRecordError(null)
  }

  const startRecording = async () => {
    if (usesModelSpeaker) return
    if (isRecording) return
    setRecordError(null)
    setReferenceFile(null)

    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordError('Seu navegador nao suporta captura de audio.')
      return
    }

    if (typeof window === 'undefined' || !('MediaRecorder' in window)) {
      setRecordError('MediaRecorder nao esta disponivel neste navegador.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      const supportedTypes = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/webm']
      const selectedType = supportedTypes.find((type) => MediaRecorder.isTypeSupported(type))

      const recorder = selectedType ? new MediaRecorder(stream, { mimeType: selectedType }) : new MediaRecorder(stream)
      recorderRef.current = recorder
      recordChunksRef.current = []
      setRecordSeconds(0)

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const blobType = recorder.mimeType || selectedType || 'audio/webm'
        const blob = new Blob(recordChunksRef.current, { type: blobType })
        const ext = extensionFromMimeType(blobType)
        const file = new File([blob], `referencia-${Date.now()}.${ext}`, { type: blobType })
        setReferenceFile(file)

        stream.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
      }

      recorder.start()
      setIsRecording(true)
    } catch {
      setRecordError('Nao foi possivel acessar o microfone. Verifique as permissoes do navegador.')
    }
  }

  const stopRecording = () => {
    if (!recorderRef.current || recorderRef.current.state === 'inactive') return
    recorderRef.current.stop()
    setIsRecording(false)
  }

  const openSettingsBeforeGenerate = () => {
    if ((!referenceFile && !usesModelSpeaker) || !text.trim()) return
    onShowGeneratedAudiosScreenChange(false)
    setPendingGenerate(true)
    onSettingsOpenChange(true)
  }

  const handleConfirmGenerate = async () => {
    if ((!referenceFile && !usesModelSpeaker) || !text.trim()) return

    setIsSubmitting(true)
    setStatus(null)
    setJobId(null)
    savedHistoryRef.current = null

    try {
      const formData = new FormData()
      if (!usesModelSpeaker && referenceFile) {
        formData.append('audio_file', referenceFile, referenceFile.name)
      }
      formData.append('text', text.trim())
      formData.append('language', settings.language.trim() || defaultAudioSettings.language)
      formData.append('speed', String(Number.isFinite(settings.speed) ? settings.speed : defaultAudioSettings.speed))
      formData.append('split_sentences', String(settings.split_sentences))

      if (settings.speaker.trim()) {
        formData.append('speaker', settings.speaker.trim())
      }
      if (settings.speaker_wav.trim()) {
        formData.append('speaker_wav', settings.speaker_wav.trim())
      }
      if (settings.emotion.trim()) {
        formData.append('emotion', settings.emotion.trim())
      }
      if (settings.prepared_voice_ref.trim()) {
        formData.append('prepared_voice_ref', settings.prepared_voice_ref.trim())
      }
      if (settings.pipe_out.trim()) {
        formData.append('pipe_out', settings.pipe_out.trim())
      }
      if (settings.tts_kwargs_text.trim()) {
        formData.append('tts_kwargs_text', settings.tts_kwargs_text.trim())
      }

      const response = await generateVoice(formData)
      setJobId(response.job_id)
      setStatus(initialVoiceStatus(response.job_id, settings))
      setPendingGenerate(false)
      onSettingsOpenChange(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      pushToast({
        tone: 'error',
        title: 'Falha ao iniciar geracao de voz',
        description: 'Confirme se o backend de voz esta ativo e tente novamente.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetFlow = () => {
    setJobId(null)
    setStatus(null)
    setText('')
    setReferenceFile(null)
    setRecordError(null)
    setIsRecording(false)
    setRecordSeconds(0)
    setPendingGenerate(false)
    savedHistoryRef.current = null
    onSettingsOpenChange(false)
  }

  return (
    <div className='mx-auto w-full max-w-6xl px-4 py-6 md:px-8'>
      <AnimatePresence mode='wait'>
        {screen === 'library' ? (
          <GeneratedVoiceAudiosScreen onBack={() => onShowGeneratedAudiosScreenChange(false)} />
        ) : null}

        {screen === 'idle' ? (
          <motion.section key='voice-idle' initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className='mx-auto w-full max-w-3xl rounded-[30px] border border-border bg-card p-6'>
              <div className='mb-5'>
                <h2 className='font-space text-3xl font-semibold'>Voice Clone TTS v2</h2>
                <p className='text-sm text-muted'>
                  Gere uma nova fala a partir de uma voz de referencia. Modelo fixo: XTTS v2.
                </p>
              </div>

              <div className='mb-4 inline-flex rounded-full border border-border bg-surface p-1'>
                <button
                  type='button'
                  onClick={() => handleSwitchMode('upload')}
                  disabled={usesModelSpeaker}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-xs transition-colors',
                    usesModelSpeaker && 'cursor-not-allowed opacity-50',
                    inputMode === 'upload' ? 'bg-card text-foreground' : 'text-muted',
                  )}
                >
                  Drag & Drop
                </button>
                <button
                  type='button'
                  onClick={() => handleSwitchMode('record')}
                  disabled={usesModelSpeaker}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-xs transition-colors',
                    usesModelSpeaker && 'cursor-not-allowed opacity-50',
                    inputMode === 'record' ? 'bg-card text-foreground' : 'text-muted',
                  )}
                >
                  Gravar audio
                </button>
              </div>

              {usesModelSpeaker ? (
                <div className='mb-4 rounded-2xl border border-border bg-surface p-4'>
                  <p className='text-sm font-medium'>Speaker do modelo ativo</p>
                  <p className='mt-1 text-xs text-muted'>
                    A voz <span className='font-medium text-foreground'>{settings.speaker}</span> foi escolhida no modal. Upload e gravacao de referencia ficam desativados, e a geracao vai priorizar esse speaker.
                  </p>
                </div>
              ) : null}

              {!usesModelSpeaker && inputMode === 'upload' ? (
                <div
                  onDragOver={(event) => {
                    event.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setIsDragging(false)
                    const file = event.dataTransfer.files?.[0] ?? null
                    handlePickFile(file)
                  }}
                  className={cn(
                    'mb-4 rounded-2xl border border-dashed border-border bg-surface p-6 text-center',
                    isDragging && 'border-accent',
                  )}
                >
                  <Upload className='mx-auto mb-2 size-5 text-muted' />
                  <p className='text-sm font-medium'>Arraste o audio de referencia aqui</p>
                  <p className='mb-3 text-xs text-muted'>Ou selecione um arquivo de audio do seu computador</p>
                  <input
                    ref={fileInputRef}
                    type='file'
                    accept='audio/*'
                    className='hidden'
                    onChange={(event) => handlePickFile(event.target.files?.[0] ?? null)}
                  />
                  <Button variant='outline' onClick={() => fileInputRef.current?.click()}>
                    Selecionar arquivo
                  </Button>
                </div>
              ) : !usesModelSpeaker ? (
                <div className='mb-4 rounded-2xl border border-border bg-surface p-4'>
                  <p className='text-sm font-medium'>Gravacao de referencia</p>
                  <p className='mt-1 text-xs text-muted'>Use uma voz clara em ambiente silencioso.</p>
                  <AnimatePresence initial={false}>
                    {isRecording ? (
                      <motion.div
                        key='recording-state'
                        className='mt-4 rounded-[24px] border border-success/30 bg-card p-4'
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22 }}
                      >
                        <div className='mb-3 flex items-center gap-4'>
                          <motion.button
                            type='button'
                            onClick={stopRecording}
                            className='grid size-14 shrink-0 place-items-center rounded-full border border-success/35 bg-success/10 text-success'
                            whileTap={{ scale: 0.96 }}
                            transition={{ duration: 0.18 }}
                            aria-label='Parar gravacao'
                          >
                            <AnimatePresence mode='wait' initial={false}>
                              <motion.span
                                key='stop-icon'
                                initial={{ opacity: 0, scale: 0.82, rotate: -10 }}
                                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                                exit={{ opacity: 0, scale: 0.82, rotate: 10 }}
                                transition={{ duration: 0.18 }}
                              >
                                <MicOff className='size-5' />
                              </motion.span>
                            </AnimatePresence>
                          </motion.button>

                          <div className='min-w-0 flex-1'>
                            <div className='inline-flex items-center gap-2 text-sm font-medium'>
                              <motion.span
                                className='size-2.5 rounded-full bg-success'
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 1.1, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
                              />
                              Gravando agora
                            </div>
                            <p className='mt-1 text-xs text-muted'>Toque no icone para encerrar quando terminar a referencia.</p>
                          </div>
                          <p className='text-sm tabular-nums text-muted'>{recordSeconds}s</p>
                        </div>

                        <div className='rounded-2xl border border-success/20 bg-surface/70 p-3'>
                          <div className='flex h-10 items-end gap-1 overflow-hidden'>
                            {Array.from({ length: 20 }).map((_, index) => (
                              <motion.span
                                key={index}
                                className='w-1.5 rounded-full bg-success/75'
                                initial={{ height: 10 }}
                                animate={{ height: [10, 28, 14, 22, 12] }}
                                transition={{
                                  duration: 1.1,
                                  repeat: Number.POSITIVE_INFINITY,
                                  ease: 'easeInOut',
                                  delay: index * 0.045,
                                }}
                              />
                            ))}
                          </div>
                          <p className='mt-3 text-xs text-muted'>Fale naturalmente. O preview local aparece assim que a gravacao terminar.</p>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key='recording-idle'
                        className='mt-4 flex items-center gap-4 rounded-[24px] border border-border bg-card p-4'
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22 }}
                      >
                        <motion.button
                          type='button'
                          onClick={startRecording}
                          className='grid size-14 shrink-0 place-items-center rounded-full border border-border bg-surface text-muted transition-colors hover:border-accent/35 hover:text-foreground'
                          whileTap={{ scale: 0.96 }}
                          transition={{ duration: 0.18 }}
                          aria-label='Iniciar gravacao'
                        >
                          <AnimatePresence mode='wait' initial={false}>
                            <motion.span
                              key='mic-icon'
                              initial={{ opacity: 0, scale: 0.82, rotate: 10 }}
                              animate={{ opacity: 1, scale: 1, rotate: 0 }}
                              exit={{ opacity: 0, scale: 0.82, rotate: -10 }}
                              transition={{ duration: 0.18 }}
                            >
                              <Mic className='size-5' />
                            </motion.span>
                          </AnimatePresence>
                        </motion.button>
                        <div className='min-w-0 flex-1'>
                          <p className='text-sm font-medium'>Pronto para gravar</p>
                          <p className='text-xs text-muted'>Toque no icone para iniciar e use sua melhor referencia de voz.</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {recordError ? <p className='mt-2 text-xs text-danger'>{recordError}</p> : null}
                </div>
              ) : null}

              {usesModelSpeaker ? (
                <div className='mb-4 rounded-2xl border border-dashed border-border bg-card px-4 py-5 text-sm text-muted'>
                  Referencia local desativada enquanto um speaker interno do modelo estiver selecionado.
                </div>
              ) : null}

              {referenceFile ? (
                <div className='mb-4 rounded-2xl border border-border bg-surface p-3'>
                  <div className='mb-2 flex items-center gap-2 text-xs text-muted'>
                    <CheckCircle2 className='size-3.5 text-success' />
                    Referencia selecionada: {referenceFile.name}
                  </div>
                  <p className='mb-3 text-xs text-muted'>Preview local da referencia carregada. O audio final continua aparecendo so no fim do fluxo.</p>
                  <div className='mb-3 grid gap-2 sm:grid-cols-3'>
                    <div className='rounded-xl border border-border bg-card px-3 py-2'>
                      <p className='text-[11px] text-muted'>Duracao</p>
                      <p className='text-sm font-medium'>{formatCompactDuration(referenceDuration)}</p>
                    </div>
                    <div className='rounded-xl border border-border bg-card px-3 py-2'>
                      <p className='text-[11px] text-muted'>Tamanho</p>
                      <p className='text-sm font-medium'>{formatBytes(referenceFile.size)}</p>
                    </div>
                    <div className='rounded-xl border border-border bg-card px-3 py-2'>
                      <p className='text-[11px] text-muted'>Origem</p>
                      <p className='text-sm font-medium'>{inputMode === 'record' ? 'Gravacao local' : 'Upload'}</p>
                    </div>
                  </div>
                  {referencePreviewUrl ? <audio controls src={referencePreviewUrl} className='w-full' /> : null}
                </div>
              ) : null}

              <div className='mb-4 space-y-2'>
                <label className='text-xs text-muted'>Texto para sintetizar</label>
                <textarea
                  className='min-h-[130px] w-full rounded-2xl border border-border bg-card p-3 text-sm outline-none focus-visible:border-accent'
                  placeholder='Digite o texto que sera falado na voz clonada...'
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
              </div>

              <div className='flex items-center justify-end'>
                <Button onClick={openSettingsBeforeGenerate} disabled={!canGenerate}>
                  {isSubmitting ? (
                    <>
                      <LoaderCircle className='size-4 animate-spin' />
                      Iniciando...
                    </>
                  ) : (
                    <>
                      <Wand2 className='size-4' />
                      Gerar voz
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.section>
        ) : null}

        {screen === 'processing' ? (
          <motion.section
            key='voice-processing'
            className='space-y-4'
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <VoicePipelineFlow steps={timeline} startedAt={status?.started_at} finishedAt={status?.finished_at} />

            {status?.status === 'error' ? (
              <div className='rounded-2xl border border-danger/40 bg-danger/10 p-4'>
                <p className='mb-2 flex items-center gap-2 text-sm font-medium text-danger'>
                  <AlertTriangle className='size-4' />
                  Falha ao gerar voz
                </p>
                <p className='mb-3 text-xs text-muted'>{status.error || 'Confira os logs para detalhes.'}</p>
                <Button variant='outline' onClick={resetFlow}>
                  Tentar novamente
                </Button>
              </div>
            ) : null}
          </motion.section>
        ) : null}

        {screen === 'done' ? (
          <motion.section
            key='voice-done'
            className='mx-auto w-full max-w-3xl rounded-[30px] border border-border bg-card p-6'
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className='mb-4'>
              <h3 className='font-space text-2xl font-semibold'>Audio gerado com sucesso</h3>
              <p className='text-sm text-muted'>Processamento finalizado. Preview final e metadados da operacao.</p>
            </div>

            <div className='mb-4 rounded-2xl border border-border bg-surface p-3'>
              <div className='mb-2 inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs text-success'>
                <CheckCircle2 className='size-3.5' />
                Processamento concluido
              </div>
              <audio controls src={resultAudioUrl} className='w-full' />
            </div>

            <div className='mb-4 grid gap-2 sm:grid-cols-2'>
              <div className='rounded-xl border border-border bg-surface p-3'>
                <p className='text-xs text-muted'>Tempo de geracao</p>
                <p className='text-sm font-medium'>{formatDuration(generationSeconds)}</p>
              </div>
              <div className='rounded-xl border border-border bg-surface p-3'>
                <p className='text-xs text-muted'>Duracao do audio</p>
                <p className='text-sm font-medium'>{formatDuration(status?.result_metadata?.duration_seconds)}</p>
              </div>
              <div className='rounded-xl border border-border bg-surface p-3'>
                <p className='text-xs text-muted'>Codec</p>
                <p className='text-sm font-medium'>{status?.result_metadata?.codec || '--'}</p>
              </div>
              <div className='rounded-xl border border-border bg-surface p-3'>
                <p className='text-xs text-muted'>Sample rate</p>
                <p className='text-sm font-medium'>
                  {status?.result_metadata?.sample_rate_hz ? `${status.result_metadata.sample_rate_hz} Hz` : '--'}
                </p>
              </div>
              <div className='rounded-xl border border-border bg-surface p-3'>
                <p className='text-xs text-muted'>Canais</p>
                <p className='text-sm font-medium'>{status?.result_metadata?.channels || '--'}</p>
              </div>
              <div className='rounded-xl border border-border bg-surface p-3'>
                <p className='text-xs text-muted'>Tamanho</p>
                <p className='text-sm font-medium'>{formatBytes(status?.result_metadata?.size_bytes)}</p>
              </div>
            </div>

            <div className='flex justify-end'>
              <div className='flex flex-wrap gap-2'>
                <Button variant='outline' onClick={() => onShowGeneratedAudiosScreenChange(true)}>
                  <AudioLines className='size-4' />
                  Ver audios gerados
                </Button>
                <Button onClick={resetFlow}>
                  <AudioLines className='size-4' />
                  Gerar novo audio
                </Button>
              </div>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <AudioSettingsModal
        open={settingsOpen}
        settings={settings}
        onOpenChange={(open) => {
          onSettingsOpenChange(open)
          if (!open) {
            setPendingGenerate(false)
          }
        }}
        onChange={onSettingChange}
        onReset={onResetSettings}
        onConfirm={pendingGenerate ? handleConfirmGenerate : () => onSettingsOpenChange(false)}
        isSubmitting={isSubmitting}
        confirmLabel={pendingGenerate ? 'Confirmar e gerar' : 'Salvar ajustes'}
        confirmMode={pendingGenerate ? 'generate' : 'save'}
      />
    </div>
  )
}
