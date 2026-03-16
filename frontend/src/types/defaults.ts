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

export const voiceBaseTimeline: TimelineStep[] = [
  {
    id: 'validate',
    title: 'Validando ambiente',
    status: 'waiting',
    progress: 0,
    subtasks: ['Validar arquivo de referencia', 'Verificar FFmpeg e Demucs', 'Criar pasta temporaria', 'Carregar modelo XTTS v2'],
    current_subtask_index: null,
    completed_subtasks: 0,
  },
  {
    id: 'prepare_voice',
    title: 'Preparando voz de referencia',
    status: 'waiting',
    progress: 0,
    subtasks: ['Separar vocais com Demucs', 'Localizar arquivo vocals.wav', 'Tratar voz de referencia com FFmpeg'],
    current_subtask_index: null,
    completed_subtasks: 0,
  },
  {
    id: 'synthesize',
    title: 'Gerando audio final',
    status: 'waiting',
    progress: 0,
    subtasks: ['Sintetizar texto com XTTS v2', 'Validar e salvar audio final'],
    current_subtask_index: null,
    completed_subtasks: 0,
  },
]

const stepOrder = ['download', 'prepare', 'processing', 'detecting', 'vertical']
const stepOrderIndex = new Map(stepOrder.map((id, index) => [id, index]))
const baseTimelineById = new Map(baseTimeline.map((step) => [step.id, step]))
const voiceStepOrder = ['validate', 'prepare_voice', 'synthesize']
const voiceStepOrderIndex = new Map(voiceStepOrder.map((id, index) => [id, index]))
const voiceBaseTimelineById = new Map(voiceBaseTimeline.map((step) => [step.id, step]))

type NormalizedTimelineStep = Omit<TimelineStep, 'detail' | 'current_subtask_index' | 'completed_subtasks' | 'subtasks'> & {
  detail: string | null
  subtasks: string[]
  current_subtask_index: number | null
  completed_subtasks: number
}

function cloneStep(step: TimelineStep): NormalizedTimelineStep {
  const currentSubtaskIndex =
    typeof step.current_subtask_index === 'number' && Number.isInteger(step.current_subtask_index)
      ? step.current_subtask_index
      : null

  return {
    id: step.id,
    title: step.title,
    status: step.status,
    progress: step.progress,
    detail: step.detail ?? null,
    subtasks: Array.isArray(step.subtasks) ? [...step.subtasks] : [],
    current_subtask_index: currentSubtaskIndex,
    completed_subtasks: Number.isFinite(step.completed_subtasks) ? Math.max(0, step.completed_subtasks ?? 0) : 0,
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
    const currentSubtaskIndex =
      typeof step.current_subtask_index === 'number' && Number.isInteger(step.current_subtask_index)
        ? step.current_subtask_index
        : fallback?.current_subtask_index ?? null
    return {
      id: step.id,
      title: step.title || fallback?.title || step.id,
      status: step.status,
      progress: Number.isFinite(step.progress) ? step.progress : 0,
      detail: step.detail ?? null,
      subtasks: Array.isArray(step.subtasks) ? [...step.subtasks] : fallback?.subtasks ?? [],
      current_subtask_index: currentSubtaskIndex,
      completed_subtasks: Number.isFinite(step.completed_subtasks) ? Math.max(0, step.completed_subtasks ?? 0) : fallback?.completed_subtasks ?? 0,
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

export function getVoiceBaseTimeline(): TimelineStep[] {
  return voiceBaseTimeline.map(cloneStep)
}

export function normalizeVoiceTimeline(steps?: TimelineStep[] | null): TimelineStep[] {
  if (!Array.isArray(steps) || steps.length === 0) {
    return getVoiceBaseTimeline()
  }

  const normalized: NormalizedTimelineStep[] = steps.map((step) => {
    const fallback = voiceBaseTimelineById.get(step.id)
    const currentSubtaskIndex =
      typeof step.current_subtask_index === 'number' && Number.isInteger(step.current_subtask_index)
        ? step.current_subtask_index
        : fallback?.current_subtask_index ?? null
    return {
      id: step.id,
      title: step.title || fallback?.title || step.id,
      status: step.status,
      progress: Number.isFinite(step.progress) ? step.progress : 0,
      detail: step.detail ?? null,
      subtasks: Array.isArray(step.subtasks) ? [...step.subtasks] : fallback?.subtasks ?? [],
      current_subtask_index: currentSubtaskIndex,
      completed_subtasks: Number.isFinite(step.completed_subtasks) ? Math.max(0, step.completed_subtasks ?? 0) : fallback?.completed_subtasks ?? 0,
    } satisfies TimelineStep
  })

  normalized.sort((a, b) => {
    const aOrder = voiceStepOrderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER
    const bOrder = voiceStepOrderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER
    return aOrder - bOrder
  })

  const existing = new Set(normalized.map((step) => step.id))
  voiceStepOrder.forEach((stepId) => {
    if (!existing.has(stepId)) {
      const fallback = voiceBaseTimelineById.get(stepId)
      if (fallback) {
        normalized.push(cloneStep(fallback))
      }
    }
  })

  return normalized
}
