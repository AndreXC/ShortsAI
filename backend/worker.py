from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import cv2

from Controller.controller_gerador_shorts import GeradorShortsAutoFace, ProcessingCancelledError

from .job_manager import JobManager


def _safe_output_name(job_id: str, output_name: str | None) -> str:
    if not output_name:
        return f'{job_id}.mp4'

    allowed = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.'
    clean = ''.join(ch for ch in output_name if ch in allowed)
    if not clean.lower().endswith('.mp4'):
        clean = f'{clean}.mp4'
    return clean or f'{job_id}.mp4'


def _extract_result_metadata(output_path: Path, settings: dict[str, Any]) -> dict[str, Any]:
    duration_seconds = None
    resolution = None

    capture = cv2.VideoCapture(str(output_path))
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
        frame_count = float(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0)
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

        if fps > 0 and frame_count > 0:
            duration_seconds = round(frame_count / fps, 2)
        if width > 0 and height > 0:
            resolution = f'{width}x{height}'
    finally:
        capture.release()

    return {
        'duration_seconds': duration_seconds,
        'resolution': resolution,
        'codec': settings.get('codec', 'libx264'),
        'size_bytes': output_path.stat().st_size if output_path.exists() else None,
    }


def _persist_source_path(job_manager: JobManager, job_id: str, source_path: str) -> None:
    if not source_path:
        return
    path = Path(source_path)
    if path.exists():
        job_manager.set_source_path(job_id, str(path.resolve()))


def _write_output_manifest(
    output_path: Path,
    job_id: str,
    settings: dict[str, Any],
    result_metadata: dict[str, Any],
) -> None:
    payload = {
        'job_id': job_id,
        'detector_backend': settings.get('detector_backend'),
        'youtube_quality': settings.get('youtube_quality'),
        'codec': settings.get('codec'),
        'audio_codec': settings.get('audio_codec'),
        'bitrate': settings.get('bitrate'),
        'result_metadata': result_metadata,
    }
    manifest_path = output_path.with_suffix('.json')
    try:
        manifest_path.write_text(
            json.dumps(payload, ensure_ascii=True, indent=2),
            encoding='utf-8',
        )
    except OSError:
        pass


def process_generation_job(job_manager: JobManager, job_id: str, payload: dict[str, Any]) -> None:
    job_manager.mark_running(job_id)

    settings: dict[str, Any] = payload.get('settings', {})
    url = str(payload.get('url', ''))

    output_dir = Path(__file__).resolve().parent.parent / 'outputs'
    output_dir.mkdir(parents=True, exist_ok=True)
    output_name = _safe_output_name(job_id, settings.get('output_name'))
    output_path = output_dir / output_name

    generator = GeradorShortsAutoFace()
    generator.detector_backend = settings.get('detector_backend', 'blaze')
    generator.youtube_quality = settings.get('youtube_quality', '1080p')
    generator.detect_every_n_frames = int(settings.get('detect_every_frames', 3))
    generator.smooth_factor = float(settings.get('smooth_factor', 0.08))
    generator.min_detection_confidence = float(settings.get('min_detection_confidence', 0.5))
    generator.retina_threshold = float(settings.get('retina_threshold', 0.9))

    generator.codec = settings.get('codec', 'libx264')
    generator.audio_codec = settings.get('audio_codec', 'aac')
    generator.bitrate = settings.get('bitrate', '8000k')
    generator.threads = int(settings.get('threads', 4))
    generator.preset = settings.get('preset', 'slow')

    generator.set_callbacks(
        on_log=lambda msg: job_manager.append_log(job_id, msg),
        on_step=lambda step, status, detail=None: job_manager.update_step(job_id, step, status, detail),
        on_progress=lambda progress_payload: job_manager.update_metrics(job_id, progress_payload),
        on_cancel_requested=lambda: job_manager.is_cancel_requested(job_id),
    )

    try:
        if job_manager.is_cancel_requested(job_id):
            message = 'Processamento cancelado pelo usuario.'
            job_manager.append_log(job_id, message)
            job_manager.mark_cancelled(job_id, message)
            return

        cut_seconds = settings.get('cut_seconds')
        job_manager.append_log(job_id, 'Job iniciado com sucesso.')

        success = generator.execute(
            url=url,
            outputfile=str(output_path),
            cut_seconds=int(cut_seconds) if cut_seconds is not None else None,
        )

        _persist_source_path(job_manager, job_id, generator.saveVideo)

        if job_manager.is_cancel_requested(job_id):
            message = 'Processamento cancelado pelo usuario.'
            job_manager.append_log(job_id, message)
            job_manager.mark_cancelled(job_id, message)
            return

        if success and output_path.exists():
            metadata = _extract_result_metadata(output_path, settings)
            _write_output_manifest(output_path, job_id, settings, metadata)
            job_manager.append_log(job_id, 'Geracao concluida com sucesso.')
            job_manager.mark_completed(job_id, str(output_path.resolve()), metadata)
            return

        error_message = generator.strErr or 'Falha desconhecida durante o processamento.'
        job_manager.append_log(job_id, f'Erro: {error_message}')
        job_manager.mark_error(job_id, error_message)

    except ProcessingCancelledError as exc:
        message = str(exc) or 'Processamento cancelado pelo usuario.'
        job_manager.append_log(job_id, message)
        job_manager.mark_cancelled(job_id, message)
    except Exception as exc:
        error_message = f'Erro inesperado no worker: {exc}'
        job_manager.append_log(job_id, error_message)
        job_manager.mark_error(job_id, error_message)
    finally:
        _persist_source_path(job_manager, job_id, generator.saveVideo)

        if os.path.exists(str(output_path)) and job_manager.get_job(job_id):
            status = job_manager.get_job(job_id).get('status')
            if status in {'error', 'cancelled'}:
                try:
                    os.remove(output_path)
                except OSError:
                    pass
