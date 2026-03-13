import type { GenerationSettings, TimelineStep } from '@/types/job'

export const defaultSettings: GenerationSettings = {
  detector_backend: 'blaze',
  youtube_quality: '1080p',
  detect_every_frames: 3,
  smooth_factor: 0.08,
  min_detection_confidence: 0.5,
  retina_threshold: 0.9,
  codec: 'libx264',
  audio_codec: 'aac',
  bitrate: '8000k',
  threads: 4,
  preset: 'slow',
}

export const baseTimeline: TimelineStep[] = [
  { id: 'download', title: 'Baixando video do YouTube', status: 'waiting', progress: 0 },
  { id: 'prepare', title: 'Preparando ambiente (FFmpeg / modelos IA)', status: 'waiting', progress: 0 },
  { id: 'processing', title: 'Processando video', status: 'waiting', progress: 0 },
  { id: 'detecting', title: 'Detectando rosto com IA', status: 'waiting', progress: 0 },
  { id: 'vertical', title: 'Gerando video vertical 9:16', status: 'waiting', progress: 0 },
]

const stepOrder = ['download', 'prepare', 'processing', 'detecting', 'vertical']
const stepOrderIndex = new Map(stepOrder.map((id, index) => [id, index]))
const baseTimelineById = new Map(baseTimeline.map((step) => [step.id, step]))

type NormalizedTimelineStep = Omit<TimelineStep, 'detail'> & { detail: string | null }

function cloneStep(step: TimelineStep): NormalizedTimelineStep {
  return {
    id: step.id,
    title: step.title,
    status: step.status,
    progress: step.progress,
    detail: step.detail ?? null,
  }
}

export function getBaseTimeline(): TimelineStep[] {
  return baseTimeline.map(cloneStep)
}

export function normalizeTimeline(steps?: TimelineStep[] | null): TimelineStep[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    return getBaseTimeline()
  }

  const normalized: NormalizedTimelineStep[] = steps.map((step) => {
    const fallback = baseTimelineById.get(step.id)
    return {
      id: step.id,
      title: step.title || fallback?.title || step.id,
      status: step.status,
      progress: Number.isFinite(step.progress) ? step.progress : 0,
      detail: step.detail ?? null,
    } satisfies TimelineStep
  })

  normalized.sort((a, b) => {
    const aOrder = stepOrderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER
    const bOrder = stepOrderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER
    return aOrder - bOrder
  })

  const existing = new Set(normalized.map((step) => step.id))
  stepOrder.forEach((stepId) => {
    if (!existing.has(stepId)) {
      const fallback = baseTimelineById.get(stepId)
      if (fallback) {
        normalized.push(cloneStep(fallback))
      }
    }
  })

  return normalized
}
