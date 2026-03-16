from __future__ import annotations

import asyncio
import json
import mimetypes
import os
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from .job_manager import JobManager
from .schemas import (
    CancelResponse,
    GenerateRequest,
    GenerateResponse,
    JobHistoryItem,
    JobStatusResponse,
    JobsBatchActionResponse,
    JobsBatchRequest,
)
from .voice_job_manager import VoiceJobManager
from .voice_worker import process_voice_generation_job
from .worker import process_generation_job

app = FastAPI(title='AI Shorts Generator API', version='1.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

job_manager = JobManager()
voice_job_manager = VoiceJobManager()
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUTS_DIRS = [Path('outputs'), PROJECT_ROOT / 'outputs']
VOICE_OUTPUTS_DIRS = [Path('voice_outputs'), PROJECT_ROOT / 'voice_outputs']
VOICE_INPUTS_DIR = PROJECT_ROOT / 'voice_inputs'


def _normalized_output_dirs() -> list[Path]:
    unique: list[Path] = []
    seen: set[str] = set()

    for raw in OUTPUTS_DIRS:
        resolved = raw.resolve()
        key = str(resolved).lower()
        if key not in seen:
            seen.add(key)
            unique.append(resolved)

    return unique


def _normalized_voice_output_dirs() -> list[Path]:
    unique: list[Path] = []
    seen: set[str] = set()

    for raw in VOICE_OUTPUTS_DIRS:
        resolved = raw.resolve()
        key = str(resolved).lower()
        if key not in seen:
            seen.add(key)
            unique.append(resolved)

    return unique


def _list_output_jobs(limit: int) -> list[dict[str, Any]]:
    collected: list[Path] = []
    for directory in _normalized_output_dirs():
        directory.mkdir(parents=True, exist_ok=True)
        collected.extend(directory.glob('*.mp4'))

    files = sorted(collected, key=lambda file: file.stat().st_mtime, reverse=True)
    rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for file in files[: max(1, limit)]:
        if file.stem in seen_ids:
            continue
        seen_ids.add(file.stem)
        stat = file.stat()
        created_at = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        manifest_path = file.with_suffix('.json')
        manifest: dict[str, Any] = {}
        if manifest_path.exists():
            try:
                manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
            except (OSError, json.JSONDecodeError):
                manifest = {}

        detector_backend = manifest.get('detector_backend')
        if detector_backend not in {'blaze', 'retinaface'}:
            detector_backend = None

        manifest_metadata = manifest.get('result_metadata')
        if not isinstance(manifest_metadata, dict):
            manifest_metadata = {}
        rows.append(
            {
                'job_id': file.stem,
                'status': 'completed',
                'detector_backend': detector_backend,
                'created_at': created_at,
                'finished_at': created_at,
                'duration_seconds': None,
                'result_url': f'/result/{file.stem}',
                'source_url': None,
                'error': None,
                'result_metadata': {
                    'duration_seconds': manifest_metadata.get('duration_seconds'),
                    'resolution': manifest_metadata.get('resolution'),
                    'codec': manifest_metadata.get('codec'),
                    'size_bytes': stat.st_size,
                },
            }
        )
    return rows


def _resolve_output_file(job_id: str) -> Path | None:
    if '..' in job_id or '/' in job_id or '\\' in job_id:
        return None

    for output_root in _normalized_output_dirs():
        output_root.mkdir(parents=True, exist_ok=True)
        candidate = (output_root / f'{job_id}.mp4').resolve()
        if output_root not in candidate.parents:
            continue
        if candidate.exists():
            return candidate
    return None


def _resolve_voice_output_file(job_id: str) -> Path | None:
    if '..' in job_id or '/' in job_id or '\\' in job_id:
        return None

    for output_root in _normalized_voice_output_dirs():
        output_root.mkdir(parents=True, exist_ok=True)
        for pattern in (f'{job_id}.wav', f'{job_id}.mp3', f'{job_id}.ogg', f'{job_id}.m4a'):
            candidate = (output_root / pattern).resolve()
            if output_root not in candidate.parents:
                continue
            if candidate.exists():
                return candidate
    return None


def _resolve_manifest_files(job_id: str) -> list[Path]:
    files: list[Path] = []
    seen: set[str] = set()
    for output_root in _normalized_output_dirs():
        candidate = (output_root / f'{job_id}.json').resolve()
        key = str(candidate).lower()
        if key in seen:
            continue
        seen.add(key)
        if output_root not in candidate.parents:
            continue
        if candidate.exists():
            files.append(candidate)
    return files


def _safe_upload_suffix(filename: str | None) -> str:
    raw_suffix = Path(filename or '').suffix.lower().strip()
    if not raw_suffix:
        return '.wav'
    if len(raw_suffix) > 10:
        return '.wav'
    clean = ''.join(ch for ch in raw_suffix if ch.isalnum() or ch == '.')
    if not clean.startswith('.'):
        clean = f'.{clean}'
    return clean or '.wav'


def _parse_voice_tts_kwargs(raw_text: str | None) -> dict[str, Any]:
    parsed: dict[str, Any] = {}
    if not raw_text:
        return parsed

    for line in str(raw_text).splitlines():
        item = line.strip()
        if not item:
            continue
        if '=' not in item:
            raise HTTPException(status_code=422, detail=f"Parametro invalido em kwargs extras: '{item}'. Use chave=valor.")

        key, value = item.split('=', 1)
        clean_key = key.strip()
        clean_value = value.strip()
        if not clean_key:
            raise HTTPException(status_code=422, detail=f"Chave invalida em kwargs extras: '{item}'.")

        lowered = clean_value.lower()
        if lowered == 'true':
            parsed[clean_key] = True
        elif lowered == 'false':
            parsed[clean_key] = False
        elif lowered in {'null', 'none'}:
            parsed[clean_key] = None
        else:
            try:
                parsed[clean_key] = json.loads(clean_value)
            except Exception:
                parsed[clean_key] = clean_value

    return parsed


@app.get('/health')
async def health() -> dict[str, str]:
    return {'status': 'ok'}


@app.post('/generate', response_model=GenerateResponse, status_code=202)
async def generate(payload: GenerateRequest, background_tasks: BackgroundTasks) -> GenerateResponse:
    job_id = job_manager.create_job(url=payload.url, settings=payload.settings.model_dump())

    background_tasks.add_task(
        process_generation_job,
        job_manager,
        job_id,
        payload.model_dump(),
    )

    return GenerateResponse(job_id=job_id)


@app.post('/voice/generate', response_model=GenerateResponse, status_code=202)
async def generate_voice(
    background_tasks: BackgroundTasks,
    audio_file: UploadFile | None = File(None),
    text: str = Form(...),
    language: str = Form('pt'),
    speed: float = Form(1.4),
    split_sentences: bool = Form(False),
    speaker: str | None = Form(None),
    speaker_wav: str | None = Form(None),
    emotion: str | None = Form(None),
    prepared_voice_ref: str | None = Form(None),
    pipe_out: str | None = Form(None),
    tts_kwargs_text: str | None = Form(None),
) -> GenerateResponse:
    clean_text = str(text or '').strip()
    if not clean_text:
        raise HTTPException(status_code=422, detail='Texto para sintese nao pode ficar vazio')

    selected_speaker = (speaker or '').strip() or None
    should_use_model_speaker = selected_speaker is not None
    if not should_use_model_speaker and audio_file is None:
        raise HTTPException(status_code=422, detail='Envie um arquivo de audio de referencia ou escolha um speaker do modelo.')

    payload_settings = {
        'language': str(language or 'pt').strip() or 'pt',
        'speed': speed,
        'split_sentences': bool(split_sentences),
        'speaker': selected_speaker,
        'speaker_wav': (speaker_wav or '').strip() or None,
        'emotion': (emotion or '').strip() or None,
        'prepared_voice_ref': (prepared_voice_ref or '').strip() or None,
        'pipe_out': (pipe_out or '').strip() or None,
        'tts_kwargs': _parse_voice_tts_kwargs(tts_kwargs_text),
        'model_name': 'xtts_v2',
    }
    job_id = voice_job_manager.create_job(text=clean_text, settings=payload_settings)

    upload_path: Path | None = None
    if not should_use_model_speaker and audio_file is not None:
        VOICE_INPUTS_DIR.mkdir(parents=True, exist_ok=True)
        upload_suffix = _safe_upload_suffix(audio_file.filename)
        upload_path = (VOICE_INPUTS_DIR / f'{job_id}{upload_suffix}').resolve()

        data = await audio_file.read()
        if not data:
            raise HTTPException(status_code=400, detail='Arquivo de audio vazio')

        try:
            upload_path.write_bytes(data)
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f'Falha ao salvar arquivo enviado: {exc}') from exc

        voice_job_manager.set_source_path(job_id, str(upload_path))

    background_tasks.add_task(
        process_voice_generation_job,
        voice_job_manager,
        job_id,
        {
            'input_path': str(upload_path) if upload_path else None,
            'text': clean_text,
            'settings': payload_settings,
        },
    )

    return GenerateResponse(job_id=job_id)


@app.get('/status/{job_id}', response_model=JobStatusResponse)
async def get_status(job_id: str) -> JobStatusResponse:
    status = job_manager.get_status(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail='Job nao encontrado')
    return status


@app.get('/voice/status/{job_id}', response_model=JobStatusResponse)
async def get_voice_status(job_id: str) -> JobStatusResponse:
    status = voice_job_manager.get_status(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail='Job de voz nao encontrado')
    return status


@app.post('/cancel/{job_id}', response_model=CancelResponse)
async def cancel_job(job_id: str) -> CancelResponse:
    if not job_manager.exists(job_id):
        raise HTTPException(status_code=404, detail='Job nao encontrado')

    accepted = job_manager.request_cancel(job_id)
    message = 'Solicitacao de cancelamento enviada.' if accepted else 'Job ja finalizado e nao pode ser cancelado.'
    return CancelResponse(job_id=job_id, accepted=accepted, message=message)


@app.get('/jobs', response_model=list[JobHistoryItem])
async def list_jobs(limit: int = 20) -> list[JobHistoryItem]:
    safe_limit = max(1, min(100, int(limit)))
    memory_history = job_manager.list_jobs(limit=safe_limit)
    known_ids = {item['job_id'] for item in memory_history}

    for output_item in _list_output_jobs(limit=safe_limit):
        if output_item['job_id'] not in known_ids:
            memory_history.append(output_item)

    merged_sorted = sorted(
        memory_history,
        key=lambda item: item['created_at'],
        reverse=True,
    )[:safe_limit]
    return [JobHistoryItem.model_validate(item) for item in merged_sorted]


@app.post('/jobs/delete', response_model=JobsBatchActionResponse)
async def delete_jobs(payload: JobsBatchRequest) -> JobsBatchActionResponse:
    deleted: list[str] = []
    not_found: list[str] = []

    for raw_job_id in payload.job_ids:
        job_id = str(raw_job_id).strip()
        if not job_id:
            continue

        removed_any = False
        output_file = _resolve_output_file(job_id)
        if output_file:
            try:
                output_file.unlink(missing_ok=True)
                removed_any = True
            except OSError:
                pass

        for manifest_file in _resolve_manifest_files(job_id):
            try:
                manifest_file.unlink(missing_ok=True)
                removed_any = True
            except OSError:
                pass

        removed_any = job_manager.remove_job(job_id) or removed_any
        if removed_any:
            deleted.append(job_id)
        else:
            not_found.append(job_id)

    return JobsBatchActionResponse(deleted=deleted, not_found=not_found)


@app.post('/jobs/download-zip')
async def download_zip(payload: JobsBatchRequest) -> FileResponse:
    selected_files: list[tuple[str, Path]] = []
    for raw_job_id in payload.job_ids:
        job_id = str(raw_job_id).strip()
        if not job_id:
            continue
        output_file = _resolve_output_file(job_id)
        if output_file:
            selected_files.append((job_id, output_file))

    if not selected_files:
        raise HTTPException(status_code=404, detail='Nenhum arquivo encontrado para compactar')

    fd, temp_zip = tempfile.mkstemp(prefix='shorts_', suffix='.zip')
    os.close(fd)
    zip_path = Path(temp_zip)

    used_names: set[str] = set()
    with zipfile.ZipFile(zip_path, mode='w', compression=zipfile.ZIP_DEFLATED) as zip_file:
        for job_id, output_file in selected_files:
            arcname = output_file.name
            if arcname in used_names:
                arcname = f'{job_id}_{output_file.name}'
            used_names.add(arcname)
            zip_file.write(output_file, arcname=arcname)

    return FileResponse(
        path=str(zip_path),
        media_type='application/zip',
        filename='shorts-selected.zip',
        background=BackgroundTask(lambda: os.remove(zip_path) if zip_path.exists() else None),
    )


@app.get('/result/{job_id}')
async def get_result(job_id: str) -> FileResponse:
    job = job_manager.get_job(job_id)
    if not job:
        fallback = _resolve_output_file(job_id)
        if fallback:
            return FileResponse(
                path=str(fallback),
                media_type='video/mp4',
                filename=fallback.name,
            )
        raise HTTPException(status_code=404, detail='Job nao encontrado')

    if job.get('status') != 'completed':
        raise HTTPException(status_code=409, detail='O job ainda nao foi concluido')

    path = job.get('result_path')
    if not path:
        raise HTTPException(status_code=404, detail='Resultado nao encontrado')

    return FileResponse(
        path=path,
        media_type='video/mp4',
        filename=f'short_{job_id}.mp4',
    )


@app.get('/source/{job_id}')
async def get_source(job_id: str) -> FileResponse:
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job nao encontrado')

    path = job.get('source_path')
    if not path:
        raise HTTPException(status_code=404, detail='Video de origem ainda indisponivel')

    source_path = Path(path)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail='Arquivo de origem nao encontrado')

    return FileResponse(
        path=str(source_path),
        media_type='video/mp4',
        filename=source_path.name,
    )


@app.get('/voice/result/{job_id}')
async def get_voice_result(job_id: str) -> FileResponse:
    job = voice_job_manager.get_job(job_id)
    if not job:
        fallback = _resolve_voice_output_file(job_id)
        if fallback:
            media = mimetypes.guess_type(str(fallback))[0] or 'audio/wav'
            return FileResponse(path=str(fallback), media_type=media, filename=fallback.name)
        raise HTTPException(status_code=404, detail='Job de voz nao encontrado')

    if job.get('status') != 'completed':
        raise HTTPException(status_code=409, detail='O job de voz ainda nao foi concluido')

    path = job.get('result_path')
    if not path:
        raise HTTPException(status_code=404, detail='Resultado de voz nao encontrado')

    result_path = Path(str(path))
    media = mimetypes.guess_type(str(result_path))[0] or 'audio/wav'
    return FileResponse(
        path=str(result_path),
        media_type=media,
        filename=result_path.name,
    )


@app.get('/voice/source/{job_id}')
async def get_voice_source(job_id: str) -> FileResponse:
    job = voice_job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job de voz nao encontrado')

    path = job.get('source_path')
    if not path:
        raise HTTPException(status_code=404, detail='Audio de referencia ainda indisponivel')

    source_path = Path(str(path))
    if not source_path.exists():
        raise HTTPException(status_code=404, detail='Arquivo de referencia nao encontrado')

    media = mimetypes.guess_type(str(source_path))[0] or 'audio/wav'
    return FileResponse(
        path=str(source_path),
        media_type=media,
        filename=source_path.name,
    )


@app.websocket('/logs/{job_id}')
async def logs_socket(websocket: WebSocket, job_id: str) -> None:
    await websocket.accept()

    if not job_manager.exists(job_id):
        await websocket.send_json({'type': 'error', 'message': 'Job nao encontrado'})
        await websocket.close(code=1008)
        return

    last_version = -1
    log_cursor = 0

    try:
        while True:
            job = job_manager.get_job(job_id)
            if not job:
                await websocket.send_json({'type': 'error', 'message': 'Job removido'})
                break

            logs: list[dict[str, Any]] = job.get('logs', [])
            if log_cursor < len(logs):
                for entry in logs[log_cursor:]:
                    await websocket.send_json(
                        {
                            'type': 'log',
                            'data': {
                                'timestamp': entry['timestamp'].isoformat(),
                                'message': entry['message'],
                            },
                        }
                    )
                log_cursor = len(logs)

            version = int(job.get('version', 0))
            if version != last_version:
                status_payload = job_manager.get_status(job_id)
                if status_payload is None:
                    await websocket.send_json({'type': 'error', 'message': 'Status indisponivel'})
                    break
                await websocket.send_json(
                    {
                        'type': 'status',
                        'data': status_payload.model_dump(mode='json'),
                    }
                )
                last_version = version

            if job.get('status') in {'completed', 'error', 'cancelled'}:
                await websocket.send_json({'type': 'done', 'status': job.get('status')})
                break

            await asyncio.sleep(0.35)

    except WebSocketDisconnect:
        return
    finally:
        try:
            await websocket.close()
        except RuntimeError:
            pass


@app.websocket('/voice/logs/{job_id}')
async def voice_logs_socket(websocket: WebSocket, job_id: str) -> None:
    await websocket.accept()

    if not voice_job_manager.exists(job_id):
        await websocket.send_json({'type': 'error', 'message': 'Job de voz nao encontrado'})
        await websocket.close(code=1008)
        return

    last_version = -1
    log_cursor = 0

    try:
        while True:
            job = voice_job_manager.get_job(job_id)
            if not job:
                await websocket.send_json({'type': 'error', 'message': 'Job de voz removido'})
                break

            logs: list[dict[str, Any]] = job.get('logs', [])
            if log_cursor < len(logs):
                for entry in logs[log_cursor:]:
                    await websocket.send_json(
                        {
                            'type': 'log',
                            'data': {
                                'timestamp': entry['timestamp'].isoformat(),
                                'message': entry['message'],
                            },
                        }
                    )
                log_cursor = len(logs)

            version = int(job.get('version', 0))
            if version != last_version:
                status_payload = voice_job_manager.get_status(job_id)
                if status_payload is None:
                    await websocket.send_json({'type': 'error', 'message': 'Status de voz indisponivel'})
                    break
                await websocket.send_json(
                    {
                        'type': 'status',
                        'data': status_payload.model_dump(mode='json'),
                    }
                )
                last_version = version

            if job.get('status') in {'completed', 'error', 'cancelled'}:
                await websocket.send_json({'type': 'done', 'status': job.get('status')})
                break

            await asyncio.sleep(0.35)

    except WebSocketDisconnect:
        return
    finally:
        try:
            await websocket.close()
        except RuntimeError:
            pass
