export type StepStatus = 'waiting' | 'running' | 'completed' | 'error'
export type JobStatus = 'queued' | 'running' | 'completed' | 'error' | 'cancelled'

export interface GenerationSettings {
  detector_backend: 'blaze' | 'retinaface'
  youtube_quality: 'auto' | '360p' | '480p' | '720p' | '1080p'
  detect_every_frames: number
  smooth_factor: number
  min_detection_confidence: number
  retina_threshold: number
  codec: 'libx264' | 'libx265' | 'mpeg4'
  audio_codec: 'aac' | 'mp3' | 'pcm_s16le'
  bitrate: string
  threads: number
  preset:
    | 'ultrafast'
    | 'superfast'
    | 'veryfast'
    | 'faster'
    | 'fast'
    | 'medium'
    | 'slow'
    | 'slower'
    | 'veryslow'
  cut_seconds?: number
  output_name?: string
}

export interface GenerateRequest {
  url: string
  settings: GenerationSettings
}

export interface GenerateResponse {
  job_id: string
}

export interface CancelResponse {
  job_id: string
  accepted: boolean
  message: string
}

export interface TimelineStep {
  id: string
  title: string
  status: StepStatus
  progress: number
  detail?: string | null
}

export interface JobMetrics {
  progress: number
  frames_processed: number
  total_frames: number
  speed_fps: number
  eta_seconds?: number | null
  phase: string
}

export interface JobLogEntry {
  timestamp: string
  message: string
}

export interface ResultMetadata {
  duration_seconds?: number | null
  resolution?: string | null
  codec?: string | null
  size_bytes?: number | null
}

export interface JobStatusResponse {
  job_id: string
  status: JobStatus
  created_at: string
  started_at?: string | null
  finished_at?: string | null
  error?: string | null
  result_url?: string | null
  source_url?: string | null
  timeline: TimelineStep[]
  metrics: JobMetrics
  logs: JobLogEntry[]
  settings: Record<string, unknown>
  result_metadata?: ResultMetadata | null
  version: number
}

export interface JobHistoryItem {
  job_id: string
  status: JobStatus
  detector_backend?: 'blaze' | 'retinaface' | null
  created_at: string
  finished_at?: string | null
  duration_seconds?: number | null
  result_url?: string | null
  source_url?: string | null
  error?: string | null
  result_metadata?: ResultMetadata | null
}

export interface JobsBatchActionResponse {
  deleted: string[]
  not_found: string[]
}

export interface WebSocketLogMessage {
  type: 'log'
  data: JobLogEntry
}

export interface WebSocketStatusMessage {
  type: 'status'
  data: JobStatusResponse
}

export interface WebSocketDoneMessage {
  type: 'done'
  status: JobStatus
}

export interface WebSocketErrorMessage {
  type: 'error'
  message: string
}

export type WebSocketPayload =
  | WebSocketLogMessage
  | WebSocketStatusMessage
  | WebSocketDoneMessage
  | WebSocketErrorMessage
