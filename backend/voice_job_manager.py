from __future__ import annotations

import threading
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Optional

from .schemas import JobMetrics, JobStatusResponse

TERMINAL_STATUSES = {'completed', 'error', 'cancelled'}

VOICE_DEFAULT_STEPS: list[dict[str, str]] = [
    {'id': 'validate', 'title': 'Validando ambiente'},
    {'id': 'prepare_voice', 'title': 'Preparando voz de referencia'},
    {'id': 'synthesize', 'title': 'Gerando audio final'},
]

VOICE_STEP_SUBTASKS: dict[str, list[str]] = {
    'validate': [
        'Validar arquivo de referencia',
        'Verificar FFmpeg e Demucs',
        'Criar pasta temporaria',
        'Carregar modelo XTTS v2',
    ],
    'prepare_voice': [
        'Separar vocais com Demucs',
        'Localizar arquivo vocals.wav',
        'Tratar voz de referencia com FFmpeg',
    ],
    'synthesize': [
        'Sintetizar texto com XTTS v2',
        'Validar e salvar audio final',
    ],
}

VOICE_STEP_DETAIL_TO_SUBTASK_INDEX: dict[str, dict[str, int]] = {
    'validate': {
        'Validando arquivo de referencia': 0,
        'Arquivo de referencia invalido.': 0,
        'Verificando FFmpeg e Demucs': 1,
        'Dependencias indisponiveis.': 1,
        'Criando pasta temporaria': 2,
        'Falha ao criar pasta temporaria.': 2,
        'Carregando modelo XTTS v2': 3,
        'Falha ao carregar o modelo TTS.': 3,
    },
    'prepare_voice': {
        'Separando voz com Demucs': 0,
        'Falha ao separar vocais com Demucs.': 0,
        'Localizando arquivo vocals.wav': 1,
        'Nao foi possivel localizar vocals.wav.': 1,
        'Tratando voz de referencia com FFmpeg': 2,
        'Falha no tratamento da voz de referencia.': 2,
    },
    'synthesize': {
        'Sintetizando texto com XTTS v2': 0,
        'Falha ao sintetizar o audio final.': 0,
        'Validando arquivo final gerado': 1,
        'Audio final nao encontrado no caminho esperado.': 1,
    },
}


class VoiceJobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, dict[str, Any]] = {}
        self._lock = threading.RLock()

    def _now(self) -> datetime:
        return datetime.now(tz=timezone.utc)

    def _subtasks_for_step(self, step_id: str) -> list[str]:
        return list(VOICE_STEP_SUBTASKS.get(step_id, []))

    def _detail_to_subtask_index(self, step_id: str, detail: Optional[str]) -> int | None:
        if detail is None:
            return None
        return VOICE_STEP_DETAIL_TO_SUBTASK_INDEX.get(step_id, {}).get(detail)

    def _apply_step_progress(self, step: dict[str, Any]) -> None:
        subtasks = self._subtasks_for_step(step['id'])
        step['subtasks'] = subtasks

        if not subtasks:
            step['current_subtask_index'] = None
            step['completed_subtasks'] = 0
            step['progress'] = 1.0 if step['status'] == 'completed' else 0.0
            return

        status = step['status']
        detail = step.get('detail')
        mapped_index = self._detail_to_subtask_index(step['id'], detail)

        if status == 'completed':
            step['current_subtask_index'] = len(subtasks) - 1
            step['completed_subtasks'] = len(subtasks)
            step['progress'] = 1.0
            return

        if status == 'waiting':
            step['current_subtask_index'] = None
            step['completed_subtasks'] = 0
            step['progress'] = 0.0
            return

        current_index = mapped_index if mapped_index is not None else 0
        current_index = max(0, min(current_index, len(subtasks) - 1))
        completed_subtasks = current_index

        active_weight = 0.2 if status == 'error' else 0.55
        step['current_subtask_index'] = current_index
        step['completed_subtasks'] = completed_subtasks
        step['progress'] = max(0.05, min(1.0, (completed_subtasks + active_weight) / len(subtasks)))

    def create_job(self, text: str, settings: dict[str, Any]) -> str:
        with self._lock:
            job_id = str(uuid.uuid4())
            timeline = []
            for step in VOICE_DEFAULT_STEPS:
                payload = {
                    'id': step['id'],
                    'title': step['title'],
                    'status': 'waiting',
                    'progress': 0.0,
                    'detail': None,
                }
                self._apply_step_progress(payload)
                timeline.append(payload)
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
                'settings': {'text': text, **settings},
                'result_metadata': None,
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
            job['metrics']['phase'] = 'running'
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
                    self._apply_step_progress(step)
                    break

            self._recalculate_overall_progress(job)
            self._touch(job)

    def set_source_path(self, job_id: str, source_path: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job['source_path'] = source_path
            job['source_url'] = f'/voice/source/{job_id}'
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
            job['result_url'] = f'/voice/result/{job_id}'
            job['result_metadata'] = result_metadata

            for step in job['timeline']:
                if step['status'] != 'error':
                    step['status'] = 'completed'
                    self._apply_step_progress(step)

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
            job['metrics']['phase'] = 'error'

            has_step_error = False
            for step in job['timeline']:
                if step['status'] == 'running' and not has_step_error:
                    step['status'] = 'error'
                    step['detail'] = error_message
                    self._apply_step_progress(step)
                    has_step_error = True

            if not has_step_error and job['timeline']:
                job['timeline'][-1]['status'] = 'error'
                job['timeline'][-1]['detail'] = error_message
                self._apply_step_progress(job['timeline'][-1])

            self._recalculate_overall_progress(job)
            self._touch(job)

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
