import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, Check, Clapperboard, Download, Expand, Play, ScanFace, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useJobsHistory } from '@/hooks/useJobsHistory'
import { cn } from '@/lib/utils'
import { deleteJobs, downloadJobsZip, getResultVideoUrl } from '@/services/api'
import { useToastStore } from '@/store/toastStore'
import type { JobHistoryItem } from '@/types/job'

interface GeneratedShortsScreenProps {
  onBack: () => void
}

interface ShortsTileProps {
  item: JobHistoryItem
  selected: boolean
  selectionMode: boolean
  onOpen: (job: JobHistoryItem) => void
  onToggleSelect: (jobId: string) => void
  onDelete: (job: JobHistoryItem) => void
}

interface ShortsSectionProps {
  title: string
  subtitle: string
  items: JobHistoryItem[]
  selectedIds: string[]
  selectionMode: boolean
  onOpen: (job: JobHistoryItem) => void
  onToggleSelect: (jobId: string) => void
  onDelete: (job: JobHistoryItem) => void
}

interface DeleteConfirmModalProps {
  open: boolean
  count: number
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return '--'
  }
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function ShortsTile({ item, selected, selectionMode, onOpen, onToggleSelect, onDelete }: ShortsTileProps) {
  const videoUrl = getResultVideoUrl(item.job_id)
  const thumbUrl = `${videoUrl}#t=0.1`

  const handleClick = () => {
    if (selectionMode) {
      onToggleSelect(item.job_id)
      return
    }
    onOpen(item)
  }

  return (
    <button
      type='button'
      onClick={handleClick}
      onContextMenu={(event) => {
        event.preventDefault()
        onToggleSelect(item.job_id)
      }}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-border bg-card/80 text-left transition hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-soft',
        selected && 'border-accent/60 shadow-soft ring-2 ring-accent/20',
      )}
      title='Clique direito para selecionar'
    >
      <div className='relative aspect-[9/16] w-full overflow-hidden bg-black'>
        <video className='h-full w-full object-cover' src={thumbUrl} muted playsInline preload='metadata' />
        <div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-2.5'>
          <p className='text-[11px] text-white/90'>{formatDate(item.created_at)}</p>
          <p className='text-[10px] text-white/70'>
            {item.detector_backend === 'retinaface'
              ? 'RetinaFace'
              : item.detector_backend === 'blaze'
                ? 'BlazeFace'
                : 'Modelo nao informado'}
          </p>
        </div>

        <button
          type='button'
          className='absolute left-2 top-2 z-10 rounded-full border border-white/25 bg-black/45 p-1 text-white backdrop-blur transition hover:bg-black/65'
          onClick={(event) => {
            event.stopPropagation()
            onDelete(item)
          }}
          aria-label='Excluir video'
          title='Excluir video'
        >
          <Trash2 className='size-3.5' />
        </button>

        <div className='absolute right-2 top-2 rounded-full border border-white/25 bg-black/45 p-1 text-white backdrop-blur'>
          {selected ? <Check className='size-3.5' /> : <Expand className='size-3.5' />}
        </div>

        <div className='absolute inset-0 grid place-items-center'>
          <div className='rounded-full border border-white/35 bg-black/55 p-2 text-white backdrop-blur'>
            <Play className='size-4' />
          </div>
        </div>
      </div>
    </button>
  )
}

function ShortsSection({
  title,
  subtitle,
  items,
  selectedIds,
  selectionMode,
  onOpen,
  onToggleSelect,
  onDelete,
}: ShortsSectionProps) {
  return (
    <section className='space-y-3'>
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='font-space text-sm font-semibold'>{title}</h3>
          <p className='text-xs text-muted'>{subtitle}</p>
        </div>
        <span className='rounded-full border border-border bg-surface/70 px-2.5 py-1 text-xs text-muted'>{items.length}</span>
      </div>

      {items.length === 0 ? (
        <div className='rounded-2xl border border-border bg-surface/60 p-3 text-xs text-muted'>
          Nenhum video neste grupo por enquanto.
        </div>
      ) : (
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'>
          {items.map((item) => (
            <ShortsTile
              key={item.job_id}
              item={item}
              selected={selectedIds.includes(item.job_id)}
              selectionMode={selectionMode}
              onOpen={onOpen}
              onToggleSelect={onToggleSelect}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function DeleteConfirmModal({ open, count, loading, onCancel, onConfirm }: DeleteConfirmModalProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className='fixed inset-0 z-[95] grid place-items-center bg-black/65 p-4 backdrop-blur-sm'
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            className='mx-auto w-[min(92vw,500px)] rounded-[24px] border border-border bg-card/95 p-5 shadow-[0_28px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl'
            initial={{ y: 16, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 10, scale: 0.98, opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className='mb-3 flex items-start gap-3'>
              <div className='rounded-full border border-danger/40 bg-danger/10 p-2 text-danger'>
                <AlertTriangle className='size-4' />
              </div>
              <div>
                <h3 className='font-space text-lg font-semibold'>Confirmar exclusao</h3>
                <p className='text-sm text-muted'>
                  Deseja excluir {count} video(s)? Essa acao remove os arquivos e nao pode ser desfeita.
                </p>
              </div>
            </div>

            <div className='mt-5 flex justify-end gap-2'>
              <Button variant='outline' onClick={onCancel} disabled={loading}>
                Nao
              </Button>
              <Button onClick={onConfirm} disabled={loading}>
                {loading ? 'Excluindo...' : 'Sim, excluir'}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export function GeneratedShortsScreen({ onBack }: GeneratedShortsScreenProps) {
  const { data, isLoading, isError, refetch } = useJobsHistory(120)
  const pushToast = useToastStore((state) => state.push)

  const [selected, setSelected] = useState<JobHistoryItem | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const completedJobs = useMemo(
    () => (Array.isArray(data) ? data.filter((item) => item.status === 'completed') : []),
    [data],
  )
  const blazeJobs = useMemo(
    () => completedJobs.filter((item) => item.detector_backend === 'blaze'),
    [completedJobs],
  )
  const retinaJobs = useMemo(
    () => completedJobs.filter((item) => item.detector_backend === 'retinaface'),
    [completedJobs],
  )
  const unknownModelJobs = useMemo(
    () => completedJobs.filter((item) => item.detector_backend !== 'blaze' && item.detector_backend !== 'retinaface'),
    [completedJobs],
  )
  const allCompletedIds = useMemo(() => completedJobs.map((item) => item.job_id), [completedJobs])
  const selectionMode = selectedIds.length > 0

  useEffect(() => {
    const available = new Set(allCompletedIds)
    setSelectedIds((prev) => prev.filter((id) => available.has(id)))
  }, [allCompletedIds])

  const selectedVideoUrl = selected ? getResultVideoUrl(selected.job_id) : ''

  const onToggleSelect = (jobId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(jobId)) {
        return prev.filter((id) => id !== jobId)
      }
      return [...prev, jobId]
    })
  }

  const requestDelete = (jobIds: string[]) => {
    if (jobIds.length === 0 || deleting) {
      return
    }
    setPendingDeleteIds(jobIds)
    setShowDeleteConfirm(true)
  }

  const executeDeleteJobs = async () => {
    const jobIds = pendingDeleteIds
    if (jobIds.length === 0 || deleting) {
      setShowDeleteConfirm(false)
      setPendingDeleteIds([])
      return
    }

    setDeleting(true)
    try {
      const response = await deleteJobs(jobIds)
      await refetch()

      if (response.deleted.length > 0) {
        pushToast({
          tone: 'success',
          title: `${response.deleted.length} video(s) excluido(s)`,
        })
      }
      if (response.not_found.length > 0) {
        pushToast({
          tone: 'warning',
          title: 'Alguns arquivos nao foram encontrados',
          description: `${response.not_found.length} item(ns) ja nao existiam.`,
        })
      }

      setSelectedIds((prev) => prev.filter((id) => !response.deleted.includes(id)))
      if (selected && response.deleted.includes(selected.job_id)) {
        setSelected(null)
      }
    } catch {
      pushToast({
        tone: 'error',
        title: 'Falha ao excluir videos',
      })
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
      setPendingDeleteIds([])
    }
  }

  const onDownloadZip = async (jobIds: string[]) => {
    if (jobIds.length === 0 || zipping) {
      return
    }

    setZipping(true)
    try {
      const blob = await downloadJobsZip(jobIds)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      triggerBlobDownload(blob, `shorts-${timestamp}.zip`)
      pushToast({
        tone: 'success',
        title: 'Download do ZIP iniciado',
        description: `${jobIds.length} video(s) incluidos.`,
      })
    } catch {
      pushToast({
        tone: 'error',
        title: 'Falha ao gerar ZIP',
      })
    } finally {
      setZipping(false)
    }
  }

  return (
    <motion.section
      className='mx-auto w-full max-w-6xl px-4 py-6 md:px-8'
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className='glass rounded-[28px] border border-border p-5 md:p-6'>
        <div className='mb-5 flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-2'>
            <Clapperboard className='size-5 text-muted' />
            <div>
              <h2 className='font-space text-xl font-semibold'>Shorts Gerados</h2>
              <p className='text-xs text-muted'>Clique direito nos cards para selecionar varios videos.</p>
            </div>
          </div>

          <div className='flex gap-2'>
            <Button variant='outline' onClick={onBack}>
              <ArrowLeft className='size-4' />
              Voltar
            </Button>
          </div>
        </div>

        {selectionMode ? (
          <div className='mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface/70 p-3'>
            <span className='rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted'>
              {selectedIds.length} selecionado(s)
            </span>
            <Button
              size='sm'
              variant='outline'
              onClick={() => setSelectedIds(allCompletedIds)}
              disabled={allCompletedIds.length === 0 || selectedIds.length === allCompletedIds.length}
            >
              Selecionar todos
            </Button>
            <Button size='sm' variant='outline' onClick={() => onDownloadZip(selectedIds)} disabled={zipping}>
              <Download className='size-4' />
              {zipping ? 'Compactando...' : 'Baixar ZIP'}
            </Button>
            <Button size='sm' variant='outline' onClick={() => requestDelete(selectedIds)} disabled={deleting}>
              <Trash2 className='size-4' />
              {deleting ? 'Excluindo...' : 'Excluir selecionados'}
            </Button>
            <Button size='sm' variant='ghost' onClick={() => setSelectedIds([])}>
              Limpar selecao
            </Button>
          </div>
        ) : null}

        {isLoading ? <p className='text-sm text-muted'>Carregando seus shorts...</p> : null}
        {isError ? <p className='text-sm text-danger'>Nao foi possivel carregar os shorts gerados.</p> : null}

        {!isLoading && !isError && completedJobs.length === 0 ? (
          <div className='rounded-2xl border border-border bg-surface/70 p-4 text-sm text-muted'>
            Ainda nao ha videos concluidos para exibir.
          </div>
        ) : null}

        {completedJobs.length > 0 ? (
          <div className='space-y-6'>
            <div className='rounded-2xl border border-border bg-surface/70 p-3'>
              <div className='flex flex-wrap items-center gap-2 text-xs text-muted'>
                <span className='inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1'>
                  <Sparkles className='size-3.5' />
                  Total: {completedJobs.length}
                </span>
                <span className='inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1'>
                  <ScanFace className='size-3.5' />
                  Blaze: {blazeJobs.length}
                </span>
                <span className='inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1'>
                  <ScanFace className='size-3.5' />
                  Retina: {retinaJobs.length}
                </span>
              </div>
            </div>

            <ShortsSection
              title='BlazeFace'
              subtitle='Modelo mais rapido'
              items={blazeJobs}
              selectedIds={selectedIds}
              selectionMode={selectionMode}
              onOpen={setSelected}
              onToggleSelect={onToggleSelect}
              onDelete={(item) => requestDelete([item.job_id])}
            />
            <ShortsSection
              title='RetinaFace'
              subtitle='Modelo mais preciso'
              items={retinaJobs}
              selectedIds={selectedIds}
              selectionMode={selectionMode}
              onOpen={setSelected}
              onToggleSelect={onToggleSelect}
              onDelete={(item) => requestDelete([item.job_id])}
            />

            {unknownModelJobs.length > 0 ? (
              <ShortsSection
                title='Sem Modelo Identificado'
                subtitle='Videos antigos ou sem metadata de modelo'
                items={unknownModelJobs}
                selectedIds={selectedIds}
                selectionMode={selectionMode}
                onOpen={setSelected}
                onToggleSelect={onToggleSelect}
                onDelete={(item) => requestDelete([item.job_id])}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {selected ? (
          <motion.div
            className='fixed inset-0 z-[80] grid place-items-center bg-black/72 p-4 backdrop-blur-sm'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              className='relative w-full max-w-[360px]'
              initial={{ y: 20, scale: 0.97, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 12, scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type='button'
                className={cn(
                  'absolute -right-2 -top-2 z-10 rounded-full border border-white/30 bg-black/60 p-2 text-white backdrop-blur',
                  'transition hover:bg-black/80',
                )}
                onClick={() => setSelected(null)}
                aria-label='Fechar preview'
              >
                <X className='size-4' />
              </button>

              <div className='overflow-hidden rounded-[2rem] border border-white/20 bg-black shadow-[0_30px_80px_rgba(0,0,0,0.6)]'>
                <video className='aspect-[9/16] h-auto w-full object-cover' src={selectedVideoUrl} controls playsInline preload='metadata' />
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <DeleteConfirmModal
        open={showDeleteConfirm}
        count={pendingDeleteIds.length}
        loading={deleting}
        onCancel={() => {
          if (!deleting) {
            setShowDeleteConfirm(false)
            setPendingDeleteIds([])
          }
        }}
        onConfirm={executeDeleteJobs}
      />
    </motion.section>
  )
}
