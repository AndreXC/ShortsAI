from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

StepStatus = Literal["waiting", "running", "completed", "error"]
JobStatus = Literal["queued", "running", "completed", "error", "cancelled"]
DetectorBackend = Literal["blaze", "retinaface"]


class GenerationSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")

    detector_backend: DetectorBackend = "blaze"
    youtube_quality: Literal["auto", "360p", "480p", "720p", "1080p"] = "1080p"
    detect_every_frames: int = Field(default=3, ge=1, le=60)
    smooth_factor: float = Field(default=0.08, gt=0.0, le=1.0)
    min_detection_confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    retina_threshold: float = Field(default=0.9, ge=0.0, le=1.0)
    codec: Literal["libx264", "libx265", "mpeg4"] = "libx264"
    audio_codec: Literal["aac", "mp3", "pcm_s16le"] = "aac"
    bitrate: str = Field(default="8000k", min_length=2, max_length=16)
    threads: int = Field(default=4, ge=1, le=64)
    preset: Literal[
        "ultrafast",
        "superfast",
        "veryfast",
        "faster",
        "fast",
        "medium",
        "slow",
        "slower",
        "veryslow",
    ] = "slow"
    cut_seconds: Optional[int] = Field(default=None, ge=1)
    output_name: Optional[str] = Field(default=None, min_length=3, max_length=120)


class GenerateRequest(BaseModel):
    url: str = Field(min_length=10)
    settings: GenerationSettings = Field(default_factory=GenerationSettings)


class GenerateResponse(BaseModel):
    job_id: str


class CancelResponse(BaseModel):
    job_id: str
    accepted: bool
    message: str


class TimelineStep(BaseModel):
    id: str
    title: str
    status: StepStatus
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    detail: Optional[str] = None


class JobMetrics(BaseModel):
    progress: float = Field(default=0.0, ge=0.0, le=1.0)
    frames_processed: int = Field(default=0, ge=0)
    total_frames: int = Field(default=0, ge=0)
    speed_fps: float = Field(default=0.0, ge=0.0)
    eta_seconds: Optional[float] = Field(default=None, ge=0.0)
    phase: str = "queued"


class JobLogEntry(BaseModel):
    timestamp: datetime
    message: str


class ResultMetadata(BaseModel):
    duration_seconds: Optional[float] = Field(default=None, ge=0.0)
    resolution: Optional[str] = None
    codec: Optional[str] = None
    size_bytes: Optional[int] = Field(default=None, ge=0)


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error: Optional[str] = None
    result_url: Optional[str] = None
    source_url: Optional[str] = None
    timeline: list[TimelineStep]
    metrics: JobMetrics
    logs: list[JobLogEntry]
    settings: dict[str, Any]
    result_metadata: Optional[ResultMetadata] = None
    version: int = 0


class JobHistoryItem(BaseModel):
    job_id: str
    status: JobStatus
    detector_backend: Optional[DetectorBackend] = None
    created_at: datetime
    finished_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None
    result_url: Optional[str] = None
    source_url: Optional[str] = None
    error: Optional[str] = None
    result_metadata: Optional[ResultMetadata] = None


class JobsBatchRequest(BaseModel):
    job_ids: list[str] = Field(min_length=1, max_length=200)


class JobsBatchActionResponse(BaseModel):
    deleted: list[str] = Field(default_factory=list)
    not_found: list[str] = Field(default_factory=list)
