import { motion } from 'framer-motion'
import {
  ArrowLeft,
  AudioLines,
  Clock3,
  Download,
  FileAudio2,
  Languages,
  Mic,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { readVoiceHistory, removeVoiceHistory } from '@/lib/voice-storage'
import type { VoiceHistoryItem } from '@/types/job'

interface GeneratedVoiceAudiosScreenProps {
  onBack: () => void
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return '--'
  }
}

function formatDuration(seconds?: number | null) {
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

function splitSections(items: VoiceHistoryItem[]) {
  const now = Date.now()
  const recent: VoiceHistoryItem[] = []
  const older: VoiceHistoryItem[] = []

  items.forEach((item) => {
    const timestamp = new Date(item.finished_at ?? item.created_at).getTime()
    if (now - timestamp <= 7 * 24 * 60 * 60 * 1000) {
      recent.push(item)
      return
    }
    older.push(item)
  })

  return { recent, older }
}

function AudioCard({
  item,
  selected,
  onOpen,
  onDelete,
}: {
  item: VoiceHistoryItem
  selected: boolean
  onOpen: (item: VoiceHistoryItem) => void
  onDelete: (jobId: string) => void
}) {
  return (
    <div
      className={cn(
        'w-full rounded-[24px] border border-border bg-card p-4 text-left transition-colors hover:border-accent/35',
        selected && 'border-accent/50 bg-surface',
      )}
    >
      <div className='mb-3 flex items-start justify-between gap-3'>
        <button type='button' onClick={() => onOpen(item)} className='min-w-0 text-left'>
          <p className='font-space text-sm font-semibold'>Audio #{item.job_id.slice(0, 8)}</p>
          <p className='text-xs text-muted'>{formatDate(item.finished_at ?? item.created_at)}</p>
        </button>
        <button
          type='button'
          className='rounded-full border border-border bg-surface p-2 text-muted transition hover:text-foreground'
          onClick={(event) => {
            event.stopPropagation()
            onDelete(item.job_id)
          }}
          aria-label='Remover audio da galeria'
        >
          <Trash2 className='size-3.5' />
        </button>
      </div>

      <button type='button' onClick={() => onOpen(item)} className='mb-3 w-full text-left'>
        <p className='line-clamp-2 text-sm text-foreground/90'>{item.text_preview || 'Sem texto de referencia salvo.'}</p>
      </button>

      <div className='flex flex-wrap gap-2 text-[11px] text-muted'>
        <span className='rounded-full border border-border bg-surface px-2.5 py-1'>
          {item.input_mode === 'record' ? 'Gravado' : 'Upload'}
        </span>
        <span className='rounded-full border border-border bg-surface px-2.5 py-1'>
          {formatDuration(item.result_metadata?.duration_seconds)}
        </span>
        <span className='rounded-full border border-border bg-surface px-2.5 py-1'>
          {item.settings.language.toUpperCase()}
        </span>
      </div>
    </div>
  )
}

function AudioSection({
  title,
  subtitle,
  items,
  selectedId,
  onOpen,
  onDelete,
}: {
  title: string
  subtitle: string
  items: VoiceHistoryItem[]
  selectedId: string | null
  onOpen: (item: VoiceHistoryItem) => void
  onDelete: (jobId: string) => void
}) {
  return (
    <section className='space-y-3'>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <h3 className='font-space text-sm font-semibold'>{title}</h3>
          <p className='text-xs text-muted'>{subtitle}</p>
        </div>
        <span className='rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted'>{items.length}</span>
      </div>

      {items.length === 0 ? (
        <div className='rounded-2xl border border-border bg-surface/60 p-3 text-xs text-muted'>Nenhum audio neste grupo.</div>
      ) : (
        <div className='space-y-3'>
          {items.map((item) => (
            <AudioCard
              key={item.job_id}
              item={item}
              selected={selectedId === item.job_id}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function GeneratedVoiceAudiosScreen({ onBack }: GeneratedVoiceAudiosScreenProps) {
  const [items, setItems] = useState<VoiceHistoryItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const history = readVoiceHistory()
    setItems(history)
    setSelectedId(history[0]?.job_id ?? null)
  }, [])

  const selected = useMemo(() => items.find((item) => item.job_id === selectedId) ?? items[0] ?? null, [items, selectedId])
  const { recent, older } = useMemo(() => splitSections(items), [items])

  const handleDelete = (jobId: string) => {
    removeVoiceHistory(jobId)
    setItems((prev) => {
      const next = prev.filter((item) => item.job_id !== jobId)
      if (selectedId === jobId) {
        setSelectedId(next[0]?.job_id ?? null)
      }
      return next
    })
  }

  return (
    <motion.section
      className='w-full'
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className='rounded-[28px] border border-border bg-card p-5 md:p-6'>
        <div className='mb-6 flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-3'>
            <div className='rounded-2xl border border-border bg-surface p-3 text-muted'>
              <AudioLines className='size-5' />
            </div>
            <div>
              <h2 className='font-space text-xl font-semibold'>Audios Gerados</h2>
              <p className='text-xs text-muted'>Seu historico recente de sinteses de voz fica salvo localmente no navegador.</p>
            </div>
          </div>

          <div className='flex gap-2'>
            <Button variant='outline' onClick={onBack}>
              <ArrowLeft className='size-4' />
              Voltar
            </Button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className='rounded-[24px] border border-border bg-surface/70 p-6'>
            <div className='mb-3 inline-flex rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted'>
              Nenhum audio salvo ainda
            </div>
            <h3 className='font-space text-lg font-semibold'>A galeria de voz fica pronta assim que voce concluir a primeira geracao.</h3>
            <p className='mt-1 text-sm text-muted'>
              Depois disso, cada audio gerado aparece aqui com preview, metadados e acesso rapido para download.
            </p>
          </div>
        ) : (
          <div className='grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]'>
            <div className='space-y-6'>
              <div className='rounded-[24px] border border-border bg-surface/70 p-3'>
                <div className='flex flex-wrap gap-2 text-xs text-muted'>
                  <span className='inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1'>
                    <Sparkles className='size-3.5' />
                    Total: {items.length}
                  </span>
                  <span className='inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1'>
                    <Mic className='size-3.5' />
                    Gravados: {items.filter((item) => item.input_mode === 'record').length}
                  </span>
                  <span className='inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1'>
                    <FileAudio2 className='size-3.5' />
                    Uploads: {items.filter((item) => item.input_mode === 'upload').length}
                  </span>
                </div>
              </div>

              <AudioSection
                title='Recentes'
                subtitle='Ultimos 7 dias'
                items={recent}
                selectedId={selected?.job_id ?? null}
                onOpen={(item) => setSelectedId(item.job_id)}
                onDelete={handleDelete}
              />
              <AudioSection
                title='Anteriores'
                subtitle='Geracoes mais antigas'
                items={older}
                selectedId={selected?.job_id ?? null}
                onOpen={(item) => setSelectedId(item.job_id)}
                onDelete={handleDelete}
              />
            </div>

            <aside className='lg:sticky lg:top-24 lg:self-start'>
              {selected ? (
                <div className='rounded-[28px] border border-border bg-surface/70 p-4 md:p-5'>
                  <div className='mb-4 flex items-start justify-between gap-3'>
                    <div>
                      <p className='font-space text-lg font-semibold'>Preview Final</p>
                      <p className='text-xs text-muted'>{formatDate(selected.finished_at ?? selected.created_at)}</p>
                    </div>
                    <a href={selected.result_url} download={`audio-${selected.job_id}.wav`}>
                      <Button variant='outline' size='sm'>
                        <Download className='size-4' />
                        Download
                      </Button>
                    </a>
                  </div>

                  <div className='mb-4 rounded-2xl border border-border bg-card p-3'>
                    <audio controls src={selected.result_url} className='w-full' />
                  </div>

                  <div className='mb-4 space-y-2'>
                    <p className='text-xs uppercase tracking-[0.18em] text-muted'>Trecho sintetizado</p>
                    <p className='rounded-2xl border border-border bg-card p-3 text-sm leading-6 text-foreground/90'>
                      {selected.text_preview}
                    </p>
                  </div>

                  <div className='mb-4 grid gap-2 sm:grid-cols-2'>
                    <div className='rounded-xl border border-border bg-card p-3'>
                      <p className='mb-1 flex items-center gap-1 text-xs text-muted'>
                        <Clock3 className='size-3.5' />
                        Duracao
                      </p>
                      <p className='text-sm font-medium'>{formatDuration(selected.result_metadata?.duration_seconds)}</p>
                    </div>
                    <div className='rounded-xl border border-border bg-card p-3'>
                      <p className='mb-1 flex items-center gap-1 text-xs text-muted'>
                        <Languages className='size-3.5' />
                        Idioma
                      </p>
                      <p className='text-sm font-medium'>{selected.settings.language.toUpperCase()}</p>
                    </div>
                    <div className='rounded-xl border border-border bg-card p-3'>
                      <p className='mb-1 flex items-center gap-1 text-xs text-muted'>
                        <AudioLines className='size-3.5' />
                        Codec
                      </p>
                      <p className='text-sm font-medium'>{selected.result_metadata?.codec || '--'}</p>
                    </div>
                    <div className='rounded-xl border border-border bg-card p-3'>
                      <p className='mb-1 flex items-center gap-1 text-xs text-muted'>
                        <FileAudio2 className='size-3.5' />
                        Tamanho
                      </p>
                      <p className='text-sm font-medium'>{formatBytes(selected.result_metadata?.size_bytes)}</p>
                    </div>
                  </div>

                  <div className='space-y-2'>
                    <p className='text-xs uppercase tracking-[0.18em] text-muted'>Parametros usados</p>
                    <div className='rounded-2xl border border-border bg-card p-3'>
                      <div className='grid gap-2 sm:grid-cols-2'>
                        <div>
                          <p className='mb-1 flex items-center gap-1 text-xs text-muted'>
                            <SlidersHorizontal className='size-3.5' />
                            Velocidade
                          </p>
                          <p className='text-sm font-medium'>{selected.settings.speed}x</p>
                        </div>
                        <div>
                          <p className='mb-1 flex items-center gap-1 text-xs text-muted'>
                            <Mic className='size-3.5' />
                            Fonte
                          </p>
                          <p className='text-sm font-medium'>{selected.input_mode === 'record' ? 'Gravacao local' : 'Upload de referencia'}</p>
                        </div>
                      </div>
                      {selected.reference_name ? <p className='mt-3 text-xs text-muted'>Referencia: {selected.reference_name}</p> : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        )}
      </div>
    </motion.section>
  )
}
