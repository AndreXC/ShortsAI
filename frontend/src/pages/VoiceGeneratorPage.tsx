import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, AudioLines, CheckCircle2, LoaderCircle, Mic, MicOff, Upload, Wand2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { VoicePipelineFlow } from '@/components/VoicePipelineFlow'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { generateVoice, getVoiceResultAudioUrl, getVoiceStatus } from '@/services/api'
import { getVoiceWsUrl } from '@/services/config'
import { useToastStore } from '@/store/toastStore'
import { getVoiceBaseTimeline, normalizeVoiceTimeline } from '@/types/defaults'
import type { JobStatusResponse, TimelineStep, WebSocketPayload } from '@/types/job'

type InputMode = 'upload' | 'record'

function formatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return '--'
  }
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${minutes}m ${String(rest).padStart(2, '0')}s`
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

function initialVoiceStatus(jobId: string): JobStatusResponse {
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
    settings: { model_name: 'xtts_v2' },
    result_metadata: null,
    version: 0,
  }
}

export function VoiceGeneratorPage() {
  const pushToast = useToastStore((state) => state.push)

  const [inputMode, setInputMode] = useState<InputMode>('upload')
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [referencePreviewUrl, setReferencePreviewUrl] = useState('')
  const [text, setText] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<JobStatusResponse | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [recordError, setRecordError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordChunksRef = useRef<Blob[]>([])

  const timeline: TimelineStep[] = status?.timeline ?? getVoiceBaseTimeline()
  const isProcessing = Boolean(jobId) && status?.status !== 'completed'
  const isCompleted = status?.status === 'completed'

  const generationSeconds =
    status?.started_at && status?.finished_at
      ? Math.max(0, Math.floor((new Date(status.finished_at).getTime() - new Date(status.started_at).getTime()) / 1000))
      : null

  const resultAudioUrl = jobId ? getVoiceResultAudioUrl(jobId) : ''

  const canGenerate = !!referenceFile && text.trim().length > 0 && !isSubmitting

  useEffect(() => {
    if (!referenceFile) {
      setReferencePreviewUrl('')
      return
    }

    const url = URL.createObjectURL(referenceFile)
    setReferencePreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [referenceFile])

  useEffect(() => {
    if (!isRecording) return
    const timer = window.setInterval(() => setRecordSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [isRecording])

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
    if (!file) return
    setReferenceFile(file)
    setRecordError(null)
  }

  const startRecording = async () => {
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

  const handleGenerate = async () => {
    if (!referenceFile || !text.trim()) return

    setIsSubmitting(true)
    setStatus(null)
    setJobId(null)

    try {
      const formData = new FormData()
      formData.append('audio_file', referenceFile, referenceFile.name)
      formData.append('text', text.trim())
      formData.append('language', 'pt')
      formData.append('speed', '1.4')

      const response = await generateVoice(formData)
      setJobId(response.job_id)
      setStatus(initialVoiceStatus(response.job_id))
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
  }

  return (
    <div className='mx-auto w-full max-w-6xl px-4 py-6 md:px-8'>
      <AnimatePresence mode='wait'>
        {!jobId ? (
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
                  className={cn(
                    'rounded-full px-4 py-1.5 text-xs transition-colors',
                    inputMode === 'upload' ? 'bg-card text-foreground' : 'text-muted',
                  )}
                >
                  Drag & Drop
                </button>
                <button
                  type='button'
                  onClick={() => handleSwitchMode('record')}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-xs transition-colors',
                    inputMode === 'record' ? 'bg-card text-foreground' : 'text-muted',
                  )}
                >
                  Gravar audio
                </button>
              </div>

              {inputMode === 'upload' ? (
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
              ) : (
                <div className='mb-4 rounded-2xl border border-border bg-surface p-4'>
                  <p className='mb-3 text-sm font-medium'>Gravacao de referencia</p>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Button onClick={isRecording ? stopRecording : startRecording}>
                      {isRecording ? (
                        <>
                          <MicOff className='size-4' />
                          Parar gravacao
                        </>
                      ) : (
                        <>
                          <Mic className='size-4' />
                          Iniciar gravacao
                        </>
                      )}
                    </Button>
                    <span className='text-xs text-muted'>
                      {isRecording ? `Gravando... ${recordSeconds}s` : 'Use uma voz clara em ambiente silencioso.'}
                    </span>
                  </div>
                  {recordError ? <p className='mt-2 text-xs text-danger'>{recordError}</p> : null}
                </div>
              )}

              {referenceFile ? (
                <div className='mb-4 rounded-2xl border border-border bg-surface p-3'>
                  <div className='mb-2 flex items-center gap-2 text-xs text-muted'>
                    <CheckCircle2 className='size-3.5 text-success' />
                    Referencia selecionada: {referenceFile.name}
                  </div>
                  <audio src={referencePreviewUrl} controls className='w-full' />
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
                <Button onClick={handleGenerate} disabled={!canGenerate}>
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

        {isProcessing ? (
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

        {isCompleted ? (
          <motion.section
            key='voice-done'
            className='mx-auto w-full max-w-3xl rounded-[30px] border border-border bg-card p-6'
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className='mb-4'>
              <h3 className='font-space text-2xl font-semibold'>Audio gerado com sucesso</h3>
              <p className='text-sm text-muted'>Preview final com metadados da operacao.</p>
            </div>

            <div className='mb-4 rounded-2xl border border-border bg-surface p-3'>
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
              <Button onClick={resetFlow}>
                <AudioLines className='size-4' />
                Gerar novo audio
              </Button>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
