from __future__ import annotations

import threading
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Optional

from .schemas import JobMetrics, JobStatusResponse

TERMINAL_STATUSES = {'completed', 'error', 'cancelled'}

DEFAULT_STEPS: list[dict[str, str]] = [
    {'id': 'download', 'title': 'Baixando video do YouTube'},
    {'id': 'prepare', 'title': 'Preparando ambiente (FFmpeg / modelos IA)'},
    {'id': 'processing', 'title': 'Processando video'},
    {'id': 'detecting', 'title': 'Detectando rosto com IA'},
    {'id': 'vertical', 'title': 'Gerando video vertical 9:16'},
]


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, dict[str, Any]] = {}
        self._lock = threading.RLock()

    def _now(self) -> datetime:
        return datetime.now(tz=timezone.utc)

    def create_job(self, url: str, settings: dict[str, Any]) -> str:
        with self._lock:
            job_id = str(uuid.uuid4())
            timeline = [
                {
                    'id': step['id'],
                    'title': step['title'],
                    'status': 'waiting',
                    'progress': 0.0,
                    'detail': None,
                }
                for step in DEFAULT_STEPS
            ]
            self._jobs[job_id] = {
                'job_id': job_id,
                'status': 'queued',
                'created_at': self._now(),
                'started_at': None,
                'finished_at': None,
                'error': None,
                'source_path': None,
                'source_url': None,
                'result_path': None,
                'result_url': None,
                'timeline': timeline,
                'metrics': JobMetrics().model_dump(),
                'logs': [],
                'settings': {'url': url, **settings},
                'result_metadata': None,
                'cancel_requested': False,
                'version': 1,
            }
            return job_id

    def exists(self, job_id: str) -> bool:
        with self._lock:
            return job_id in self._jobs

    def remove_job(self, job_id: str) -> bool:
        with self._lock:
            return self._jobs.pop(job_id, None) is not None

    def _touch(self, job: dict[str, Any]) -> None:
        job['version'] = int(job.get('version', 0)) + 1

    def mark_running(self, job_id: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            if job.get('status') in TERMINAL_STATUSES:
                return
            job['status'] = 'running'
            if not job.get('started_at'):
                job['started_at'] = self._now()
            self._touch(job)

    def append_log(self, job_id: str, message: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job['logs'].append({'timestamp': self._now(), 'message': message})
            self._touch(job)

    def update_step(self, job_id: str, step_id: str, status: str, detail: Optional[str] = None) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            if job.get('status') in TERMINAL_STATUSES:
                return

            for step in job['timeline']:
                if step['id'] == step_id:
                    step['status'] = status
                    if detail is not None:
                        step['detail'] = detail
                    if status == 'completed':
                        step['progress'] = 1.0
                    elif status == 'running' and float(step.get('progress', 0.0)) < 0.05:
                        step['progress'] = 0.05
                    break
            self._recalculate_overall_progress(job)
            self._touch(job)

    def update_metrics(self, job_id: str, payload: dict[str, Any]) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            if job.get('status') in TERMINAL_STATUSES:
                return

            metrics = job['metrics']
            for key in ('frames_processed', 'total_frames', 'speed_fps', 'eta_seconds', 'phase'):
                if key in payload:
                    metrics[key] = payload[key]

            ratio = float(payload.get('progress_ratio', 0.0))
            ratio = max(0.0, min(1.0, ratio))
            phase = str(payload.get('phase', ''))

            if phase == 'processing':
                self._set_step_progress(job, 'detecting', ratio)
            elif phase == 'rendering':
                detecting_step = self._find_step(job, 'detecting')
                vertical_ratio = ratio

                if detecting_step is not None and detecting_step.get('status') != 'completed':
                    detecting_progress = max(0.0, min(1.0, float(detecting_step.get('progress', 0.0))))
                    # Mantem a etapa final alinhada: etapa 5 nao pode "passar" da etapa 4.
                    vertical_ratio = min(vertical_ratio, detecting_progress)

                self._set_step_progress(job, 'vertical', vertical_ratio)

            self._recalculate_overall_progress(job)
            self._touch(job)

    def mark_completed(
        self,
        job_id: str,
        result_path: str,
        result_metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            if job.get('status') in {'completed', 'cancelled'}:
                return

            job['status'] = 'completed'
            job['finished_at'] = self._now()
            job['result_path'] = result_path
            job['result_url'] = f'/result/{job_id}'
            job['result_metadata'] = result_metadata
            for step in job['timeline']:
                if step['status'] != 'error':
                    step['status'] = 'completed'
                    step['progress'] = 1.0
            job['metrics']['progress'] = 1.0
            job['metrics']['phase'] = 'completed'
            job['metrics']['eta_seconds'] = 0.0
            self._touch(job)

    def mark_error(self, job_id: str, error_message: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            if job.get('status') in {'completed', 'cancelled'}:
                return

            job['status'] = 'error'
            job['error'] = error_message
            job['finished_at'] = self._now()

            has_step_error = False
            for step in job['timeline']:
                if step['status'] == 'running' and not has_step_error:
                    step['status'] = 'error'
                    step['detail'] = error_message
                    has_step_error = True

            if not has_step_error and job['timeline']:
                job['timeline'][-1]['status'] = 'error'
                job['timeline'][-1]['detail'] = error_message

            self._recalculate_overall_progress(job)
            self._touch(job)

    def set_source_path(self, job_id: str, source_path: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job['source_path'] = source_path
            job['source_url'] = f'/source/{job_id}'
            self._touch(job)

    def request_cancel(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False

            status = str(job.get('status'))
            if status in TERMINAL_STATUSES:
                return False

            job['cancel_requested'] = True

            if status == 'queued':
                message = 'Processamento cancelado pelo usuario.'
                job['status'] = 'cancelled'
                job['error'] = message
                job['finished_at'] = self._now()
                job['metrics']['phase'] = 'cancelled'
                job['metrics']['eta_seconds'] = 0.0
                self._mark_running_step_as_error(job, message)
                self._recalculate_overall_progress(job)
            else:
                job['metrics']['phase'] = 'cancelling'
            self._touch(job)
            return True

    def is_cancel_requested(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
            return bool(job.get('cancel_requested', False))

    def mark_cancelled(self, job_id: str, message: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            if job.get('status') in {'completed', 'cancelled'}:
                return

            job['status'] = 'cancelled'
            job['error'] = message
            job['finished_at'] = self._now()
            job['cancel_requested'] = True
            job['metrics']['phase'] = 'cancelled'
            job['metrics']['eta_seconds'] = 0.0
            self._mark_running_step_as_error(job, message)
            self._recalculate_overall_progress(job)
            self._touch(job)

    def list_jobs(self, limit: int = 20) -> list[dict[str, Any]]:
        with self._lock:
            ordered = sorted(
                self._jobs.values(),
                key=lambda item: item['created_at'],
                reverse=True,
            )
            rows: list[dict[str, Any]] = []

            for job in ordered[: max(1, limit)]:
                started_at = job.get('started_at')
                finished_at = job.get('finished_at')
                duration_seconds = None

                if finished_at:
                    base_start = started_at or job.get('created_at')
                    if base_start:
                        duration_seconds = int(max(0.0, (finished_at - base_start).total_seconds()))

                rows.append(
                    {
                        'job_id': job['job_id'],
                        'status': job['status'],
                        'detector_backend': job.get('settings', {}).get('detector_backend'),
                        'created_at': job['created_at'],
                        'finished_at': finished_at,
                        'duration_seconds': duration_seconds,
                        'result_url': job.get('result_url'),
                        'source_url': job.get('source_url'),
                        'error': job.get('error'),
                        'result_metadata': job.get('result_metadata'),
                    }
                )
            return deepcopy(rows)

    def _mark_running_step_as_error(self, job: dict[str, Any], detail: str) -> None:
        running_steps = [step for step in job.get('timeline', []) if step.get('status') == 'running']
        if running_steps:
            running_steps[0]['status'] = 'error'
            running_steps[0]['detail'] = detail
            return

        for step in reversed(job.get('timeline', [])):
            if step.get('status') in {'completed', 'running'}:
                step['status'] = 'error'
                step['detail'] = detail
                return

    def _set_step_progress(self, job: dict[str, Any], step_id: str, progress: float) -> None:
        for step in job['timeline']:
            if step['id'] == step_id:
                bounded = max(0.0, min(1.0, progress))
                step['progress'] = max(float(step.get('progress', 0.0)), bounded)
                if step['status'] == 'waiting' and bounded > 0:
                    step['status'] = 'running'
                break

    def _find_step(self, job: dict[str, Any], step_id: str) -> Optional[dict[str, Any]]:
        for step in job.get('timeline', []):
            if step.get('id') == step_id:
                return step
        return None

    def _recalculate_overall_progress(self, job: dict[str, Any]) -> None:
        steps = job['timeline']
        if not steps:
            job['metrics']['progress'] = 0.0
            return

        total = 0.0
        for step in steps:
            status = step['status']
            if status == 'completed':
                total += 1.0
            elif status == 'running':
                total += max(0.05, float(step.get('progress', 0.0)))
            elif status == 'error':
                total += float(step.get('progress', 0.0))

        job['metrics']['progress'] = max(0.0, min(1.0, total / len(steps)))

    def get_job(self, job_id: str) -> Optional[dict[str, Any]]:
        with self._lock:
            job = self._jobs.get(job_id)
            return deepcopy(job) if job else None

    def get_status(self, job_id: str) -> Optional[JobStatusResponse]:
        job = self.get_job(job_id)
        if not job:
            return None
        return JobStatusResponse.model_validate(job)
