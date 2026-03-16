from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .voice_job_manager import VoiceJobManager


def _extract_audio_metadata(output_path: Path, model_name: str) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        'duration_seconds': None,
        'resolution': None,
        'codec': None,
        'size_bytes': output_path.stat().st_size if output_path.exists() else None,
        'sample_rate_hz': None,
        'channels': None,
        'model_name': model_name,
    }

    if not output_path.exists() or not shutil.which('ffprobe'):
        return metadata

    cmd = [
        'ffprobe',
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=codec_name,sample_rate,channels',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=0',
        str(output_path),
    ]

    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            return metadata

        for line in (result.stdout or '').splitlines():
            if line.startswith('duration='):
                try:
                    metadata['duration_seconds'] = round(float(line.split('=', 1)[1].strip()), 2)
                except (TypeError, ValueError):
                    pass
            elif line.startswith('codec_name='):
                metadata['codec'] = line.split('=', 1)[1].strip() or None
            elif line.startswith('sample_rate='):
                try:
                    metadata['sample_rate_hz'] = int(float(line.split('=', 1)[1].strip()))
                except (TypeError, ValueError):
                    pass
            elif line.startswith('channels='):
                try:
                    metadata['channels'] = int(float(line.split('=', 1)[1].strip()))
                except (TypeError, ValueError):
                    pass
    except Exception:
        return metadata

    return metadata


def process_voice_generation_job(job_manager: VoiceJobManager, job_id: str, payload: dict[str, Any]) -> None:
    from Controller.controller_generet_voice import GenerateVoiceController

    raw_input_path = str(payload.get('input_path') or '').strip()
    input_path = Path(raw_input_path) if raw_input_path else None
    text = str(payload.get('text', ''))
    settings: dict[str, Any] = payload.get('settings', {})

    output_dir = Path(__file__).resolve().parent.parent / 'voice_outputs'
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f'{job_id}.wav'

    controller = GenerateVoiceController()
    controller.model = 'tts_models/multilingual/multi-dataset/xtts_v2'
    controller.language = str(settings.get('language', 'pt'))
    controller.speed = float(settings.get('speed', 1.4))
    controller.split_sentences = bool(settings.get('split_sentences', False))
    controller.speaker = str(settings.get('speaker') or '') or None
    controller.speaker_wav = str(settings.get('speaker_wav') or '') or None
    controller.emotion = str(settings.get('emotion') or '') or None
    controller.pipe_out = str(settings.get('pipe_out') or '') or None
    controller.tts_kwargs = dict(settings.get('tts_kwargs') or {})
    uses_model_speaker = controller.speaker is not None

    prepared_voice_ref_setting = str(settings.get('prepared_voice_ref') or '').strip()
    prepared_voice_ref = (
        Path(prepared_voice_ref_setting)
        if prepared_voice_ref_setting
        else controller.temp_dir / f'{(input_path.stem if input_path else job_id)}_voz_ref.wav'
    )

    job_manager.mark_running(job_id)
    job_manager.append_log(job_id, 'Job de voz iniciado com sucesso.')

    try:
        if uses_model_speaker:
            job_manager.update_step(job_id, 'validate', 'running', 'Carregando modelo XTTS v2')
            job_manager.append_log(job_id, f'Usando speaker interno do modelo: {controller.speaker}.')
            if not controller._load_tts_model():
                raise RuntimeError(controller.StrErr or 'Falha ao carregar o modelo TTS.')

            job_manager.update_step(job_id, 'validate', 'completed', 'Speaker do modelo selecionado')
            job_manager.update_step(job_id, 'prepare_voice', 'completed', 'Etapa ignorada no modo speaker')
        else:
            if input_path is None:
                raise RuntimeError('Arquivo de referencia nao informado.')

            job_manager.update_step(job_id, 'validate', 'running', 'Validando arquivo de referencia')
            job_manager.append_log(job_id, 'Validando arquivo de referencia.')
            if not controller.validate_audio_file(input_path):
                raise RuntimeError(controller.StrErr or 'Arquivo de referencia invalido.')

            job_manager.update_step(job_id, 'validate', 'running', 'Verificando FFmpeg e Demucs')
            job_manager.append_log(job_id, 'Verificando FFmpeg e Demucs.')
            if not controller.validate_dependencies():
                raise RuntimeError(controller.StrErr or 'Dependencias indisponiveis.')

            job_manager.update_step(job_id, 'validate', 'running', 'Criando pasta temporaria')
            if not controller._create_temp_dir():
                raise RuntimeError(controller.StrErr or 'Falha ao criar pasta temporaria.')

            job_manager.update_step(job_id, 'validate', 'running', 'Carregando modelo XTTS v2')
            job_manager.append_log(job_id, 'Carregando modelo TTS v2.')
            if not controller._load_tts_model():
                raise RuntimeError(controller.StrErr or 'Falha ao carregar o modelo TTS.')

            job_manager.update_step(job_id, 'validate', 'completed', 'Ambiente validado com sucesso')

            job_manager.update_step(job_id, 'prepare_voice', 'running', 'Separando voz com Demucs')
            job_manager.append_log(job_id, 'Separando apenas os vocais da referencia.')
            if not controller.separate_vocals(str(input_path)):
                raise RuntimeError(controller.StrErr or 'Falha ao separar vocais com Demucs.')

            job_manager.update_step(job_id, 'prepare_voice', 'running', 'Localizando arquivo vocals.wav')
            if not controller.get_demucs_vocals_path(str(input_path)):
                raise RuntimeError(controller.StrErr or 'Nao foi possivel localizar vocals.wav.')

            job_manager.update_step(job_id, 'prepare_voice', 'running', 'Tratando voz de referencia com FFmpeg')
            job_manager.append_log(job_id, 'Aplicando limpeza de voz para referencia.')
            if not controller.preprocess_reference_voice(controller.vocals_path, str(prepared_voice_ref)):
                raise RuntimeError(controller.StrErr or 'Falha no tratamento da voz de referencia.')

            job_manager.update_step(job_id, 'prepare_voice', 'completed', 'Voz de referencia pronta')

        job_manager.update_step(job_id, 'synthesize', 'running', 'Sintetizando texto com XTTS v2')
        job_manager.append_log(job_id, 'Gerando audio final com XTTS v2.')
        if not controller.generate_tts(
            text=text,
            speaker_wav=str(prepared_voice_ref) if not uses_model_speaker else None,
            output_file=str(output_path),
        ):
            raise RuntimeError(controller.StrErr or 'Falha ao sintetizar o audio final.')

        job_manager.update_step(job_id, 'synthesize', 'running', 'Validando arquivo final gerado')

        job_manager.update_step(job_id, 'synthesize', 'completed', 'Audio final gerado com sucesso')

        if output_path.exists():
            metadata = _extract_audio_metadata(output_path, 'xtts_v2')
            job_manager.append_log(job_id, 'Processamento concluido com sucesso.')
            job_manager.mark_completed(job_id, str(output_path.resolve()), metadata)
            return

        raise RuntimeError('Audio final nao encontrado no caminho esperado.')

    except Exception as exc:
        error_message = str(exc)
        job_manager.append_log(job_id, f'Erro: {error_message}')
        job_manager.mark_error(job_id, error_message)
    finally:
        try:
            controller.cleanup_directories()
        except Exception:
            pass

        if input_path is not None and input_path.exists():
            try:
                os.remove(input_path)
            except OSError:
                pass

        if output_path.exists():
            job = job_manager.get_job(job_id)
            if job and job.get('status') in {'error', 'cancelled'}:
                try:
                    os.remove(output_path)
                except OSError:
                    pass
