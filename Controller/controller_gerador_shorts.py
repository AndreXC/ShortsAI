from __future__ import annotations

import os
import platform
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import Any, Callable, Optional

import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from moviepy.editor import VideoFileClip
from proglog import ProgressBarLogger
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

LogCallback = Callable[[str], None]
StepCallback = Callable[[str, str, Optional[str]], None]
ProgressCallback = Callable[[dict[str, Any]], None]
CancelCallback = Callable[[], bool]


class ProcessingCancelledError(RuntimeError):
    """Raised when user requests job cancellation during processing."""


class MoviePyMetricsLogger(ProgressBarLogger):
    def __init__(
        self,
        on_progress: Callable[[int, int], None],
        on_log: Callable[[str], None],
        should_cancel: Optional[CancelCallback] = None,
    ) -> None:
        super().__init__()
        self.on_progress = on_progress
        self.on_log = on_log
        self.should_cancel = should_cancel
        self.last_index = -1

    def callback(self, **changes: Any) -> None:
        if self.should_cancel and self.should_cancel():
            raise ProcessingCancelledError("Renderizacao cancelada pelo usuario.")
        super().callback(**changes)
        bars = self.state.get("bars", {})
        bar = bars.get("t")
        if bar is None and bars:
            first_key = next(iter(bars))
            bar = bars.get(first_key)

        if not bar:
            return

        index = int(bar.get("index", 0) or 0)
        total = int(bar.get("total", 0) or 0)
        if index != self.last_index:
            self.last_index = index
            self.on_progress(index, total)
            if total > 0 and index > 0 and index % max(1, total // 10) == 0:
                self.on_log(f"Render {index}/{total} frames")


class GeradorShortsAutoFace:
    def __init__(self):
        self.strErr: str = ""
        self.saveVideo: str = ""

        self.video_width: float = 0.0
        self.video_height: float = 0.0
        self.target_w: int = 0
        self.center_x: float = 0.0

        self.codec: str = "libx264"
        self.audio_codec: str = "aac"
        self.bitrate: str = "8000k"
        self.threads: int = 4
        self.preset: str = "slow"

        self.model_path: str = "model/blaze_face_short_range.tflite"
        self.blaze_detector: Optional[vision.FaceDetector] = None

        self.detector_backend: str = "blaze"
        self.youtube_quality: str = "1080p"
        self.min_detection_confidence: float = 0.5
        self.retina_threshold: float = 0.90

        self.detect_every_n_frames: int = 3
        self.frame_index: int = 0
        self.last_detected_center_x: Optional[float] = None
        self.total_frames: int = 0
        self.processing_started_at: float = 0.0

        self.smooth_factor: float = 0.08

        self.log_callback: Optional[LogCallback] = None
        self.step_callback: Optional[StepCallback] = None
        self.progress_callback: Optional[ProgressCallback] = None
        self.cancel_callback: Optional[CancelCallback] = None
        self._retinaface_cls: Any = None

    def set_callbacks(
        self,
        on_log: Optional[LogCallback] = None,
        on_step: Optional[StepCallback] = None,
        on_progress: Optional[ProgressCallback] = None,
        on_cancel_requested: Optional[CancelCallback] = None,
    ) -> None:
        self.log_callback = on_log
        self.step_callback = on_step
        self.progress_callback = on_progress
        self.cancel_callback = on_cancel_requested

    def _emit_log(self, message: str) -> None:
        print(message)
        if self.log_callback:
            self.log_callback(message)

    def _emit_step(self, step: str, status: str, detail: Optional[str] = None) -> None:
        if self.step_callback:
            self.step_callback(step, status, detail)

    def _emit_progress(self, phase: str, frames_processed: int, total_frames: int) -> None:
        if not self.progress_callback:
            return

        now = time.time()
        elapsed = max(0.001, now - self.processing_started_at) if self.processing_started_at else 0.0
        fps = frames_processed / elapsed if elapsed > 0 else 0.0
        remaining = max(0, total_frames - frames_processed)
        eta_seconds = remaining / fps if fps > 0 else None
        ratio = (frames_processed / total_frames) if total_frames > 0 else 0.0

        self.progress_callback(
            {
                "phase": phase,
                "frames_processed": int(frames_processed),
                "total_frames": int(total_frames),
                "speed_fps": float(fps),
                "eta_seconds": float(eta_seconds) if eta_seconds is not None else None,
                "progress_ratio": max(0.0, min(1.0, ratio)),
            }
        )

    def _is_cancel_requested(self) -> bool:
        if not self.cancel_callback:
            return False
        try:
            return bool(self.cancel_callback())
        except Exception:
            return False

    def _ensure_not_cancelled(self, message: str = "Processamento cancelado pelo usuario.") -> None:
        if self._is_cancel_requested():
            self.strErr = message
            raise ProcessingCancelledError(message)

    def _install_ffmpeg(self) -> bool:
        try:
            self._ensure_not_cancelled()

            def run_command(command: list[str]) -> bool:
                result = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if result.returncode != 0:
                    self.strErr = (result.stderr or result.stdout or "").strip()
                    return False
                return True

            if shutil.which("ffmpeg"):
                self._emit_log("FFmpeg ja disponivel no sistema.")
                return True

            sistema = platform.system().lower()
            self._emit_log("FFmpeg nao encontrado. Tentando instalar automaticamente.")

            match sistema:
                case "linux":
                    self.strErr = (
                        "No Linux, instale manualmente com: sudo apt install -y ffmpeg"
                    )
                    return False

                case "windows":
                    self._ensure_not_cancelled()
                    if not shutil.which("winget"):
                        self.strErr = (
                            "winget nao encontrado. Instale o App Installer ou instale o FFmpeg manualmente."
                        )
                        return False

                    if not run_command(
                        [
                            "winget",
                            "install",
                            "--id=Gyan.FFmpeg",
                            "-e",
                            "--accept-source-agreements",
                            "--accept-package-agreements",
                        ]
                    ):
                        self.strErr = f"Erro ao instalar FFmpeg no Windows: {self.strErr}"
                        return False

                case _:
                    self.strErr = f"Sistema operacional nao mapeado: {sistema}"
                    return False

            self._ensure_not_cancelled()
            if not shutil.which("ffmpeg"):
                self.strErr = "FFmpeg nao foi encontrado apos a instalacao."
                return False

            self._emit_log("FFmpeg instalado com sucesso.")
            return True
        except Exception as e:
            self.strErr = f"Erro ao consultar/instalar FFmpeg: {e}"
            return False

    def _download_model_if_needed(self) -> bool:
        try:
            self._ensure_not_cancelled()
            if not os.path.exists(self.model_path):
                url = (
                    "https://storage.googleapis.com/mediapipe-models/"
                    "face_detector/blaze_face_short_range/float16/1/"
                    "blaze_face_short_range.tflite"
                )
                self._emit_log("Baixando modelo Blaze Face...")
                urllib.request.urlretrieve(url, self.model_path)
                self._ensure_not_cancelled("Download do modelo cancelado pelo usuario.")
                self._emit_log("Modelo Blaze Face baixado com sucesso.")
            else:
                self._emit_log("Modelo Blaze Face ja presente no disco.")
            return True
        except Exception as e:
            self.strErr = f"Erro ao consultar/instalar modelo Blaze Face: {e}"
            return False

    def _create_detector(self) -> bool:
        try:
            self._ensure_not_cancelled()
            match self.detector_backend:
                case "blaze":
                    if not self._download_model_if_needed():
                        return False

                    base_options = python.BaseOptions(model_asset_path=self.model_path)
                    options = vision.FaceDetectorOptions(
                        base_options=base_options,
                        min_detection_confidence=self.min_detection_confidence,
                    )
                    self.blaze_detector = vision.FaceDetector.create_from_options(options)
                    self._emit_log("Detector BlazeFace inicializado.")
                case "retinaface":
                    self._emit_log("Detector RetinaFace selecionado.")
                case _:
                    self.strErr = (
                        f"Backend de detector invalido: {self.detector_backend}. "
                        "Use 'blaze' ou 'retinaface'."
                    )
                    return False
            return True

        except Exception as e:
            self.strErr = f"Erro ao criar detector '{self.detector_backend}': {e}"
            return False

    def _build_youtube_format(self) -> str:
        quality = str(self.youtube_quality or "auto").strip().lower()
        if quality in {"auto", "best"}:
            return "bestvideo+bestaudio/best"

        max_height_map = {
            "360p": 360,
            "480p": 480,
            "720p": 720,
            "1080p": 1080,
        }
        max_height = max_height_map.get(quality)
        if not max_height:
            return "bestvideo+bestaudio/best"

        return (
            f"bestvideo[height<={max_height}]+bestaudio/"
            f"best[height<={max_height}]/best"
        )

    def _download_video_youtube(self, url: str, pasta_saida: str = "downloads") -> bool:
        try:
            self._ensure_not_cancelled("Download do video cancelado pelo usuario.")
            pasta_saida_path = Path(pasta_saida)
            pasta_saida_path.mkdir(parents=True, exist_ok=True)

            def hook(status_data: dict[str, Any]) -> None:
                self._ensure_not_cancelled("Download do video cancelado pelo usuario.")
                status = status_data.get("status")
                if status == "downloading":
                    downloaded = float(status_data.get("downloaded_bytes") or 0)
                    total = float(
                        status_data.get("total_bytes")
                        or status_data.get("total_bytes_estimate")
                        or 0
                    )
                    if total > 0:
                        pct = (downloaded / total) * 100
                        self._emit_log(f"Download YouTube {pct:.1f}%")
                elif status == "finished":
                    self._emit_log("Download concluido. Finalizando mux de audio/video...")

            opcoes = {
                "outtmpl": str(pasta_saida_path / "%(title)s.%(ext)s"),
                "format": self._build_youtube_format(),
                "merge_output_format": "mp4",
                "noplaylist": True,
                "quiet": True,
                "no_warnings": True,
                "progress_hooks": [hook],
            }

            self._emit_log(f"Qualidade solicitada: {self.youtube_quality}")
            self._emit_log("Iniciando download do video do YouTube...")
            with YoutubeDL(opcoes) as ydl:
                self._ensure_not_cancelled("Download do video cancelado pelo usuario.")
                info = ydl.extract_info(url, download=True)
                self._ensure_not_cancelled("Download do video cancelado pelo usuario.")

                titulo = info.get("title", "video")
                ext = opcoes.get("merge_output_format") or info.get("ext", "mp4")
                path = pasta_saida_path / f"{titulo}.{ext}"

                if not path.exists():
                    arquivos_mp4 = sorted(
                        pasta_saida_path.glob("*.mp4"),
                        key=lambda file: file.stat().st_mtime,
                        reverse=True,
                    )
                    if arquivos_mp4:
                        path = arquivos_mp4[0]

            self.saveVideo = str(path)
            self._emit_log(f"Video baixado em: {self.saveVideo}")
            return True

        except ProcessingCancelledError:
            self.saveVideo = ""
            raise
        except DownloadError as e:
            self.strErr = (
                f"Erro ao tentar realizar o download do video com a URL: {url}\n"
                f"Erro: {e}"
            )
            self.saveVideo = ""
            return False
        except Exception as e:
            self.strErr = (
                f"Erro inesperado ao tentar realizar o download do video com a URL: {url}\n"
                f"Erro: {e}"
            )
            self.saveVideo = ""
            return False

    def _detect_face_center_blaze(self, frame) -> Optional[float]:
        try:
            if self.blaze_detector is None:
                return None

            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame)
            detection_result = self.blaze_detector.detect(mp_image)

            if not detection_result.detections:
                return None

            bbox = detection_result.detections[0].bounding_box
            return float(bbox.origin_x + (bbox.width / 2))
        except Exception:
            return None

    def _detect_face_center_retinaface(self, frame) -> Optional[float]:
        try:
            if self._retinaface_cls is None:
                from retinaface import RetinaFace as RetinaFaceDetector

                self._retinaface_cls = RetinaFaceDetector

            frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            result = self._retinaface_cls.detect_faces(frame_bgr)

            if not isinstance(result, dict) or not result:
                return None

            best_face = None
            best_score = -1.0

            for _, face_data in result.items():
                score = float(face_data.get("score", 0.0))
                if score < self.retina_threshold:
                    continue

                if score > best_score:
                    best_score = score
                    best_face = face_data

            if not best_face:
                return None

            facial_area = best_face.get("facial_area")
            if not facial_area or len(facial_area) != 4:
                return None

            x1, _, x2, _ = facial_area
            return float(x1 + x2) / 2.0
        except Exception:
            return None

    def _detect_face_center(self, frame) -> Optional[float]:
        if self.detector_backend == "blaze":
            return self._detect_face_center_blaze(frame)

        if self.detector_backend == "retinaface":
            return self._detect_face_center_retinaface(frame)

        return None

    def _crop_frame(self, frame):
        video_w = int(self.video_width)

        x1 = int(max(0, self.center_x - self.target_w / 2))
        x2 = int(min(video_w, x1 + self.target_w))

        if x2 - x1 < self.target_w:
            if x1 <= 0:
                x1 = 0
                x2 = min(video_w, self.target_w)
            else:
                x1 = max(0, video_w - self.target_w)
                x2 = video_w

        return frame[:, x1:x2]

    def _process_video_frame(self, frame):
        self.frame_index += 1
        self._ensure_not_cancelled()

        should_detect = (
            self.frame_index == 1
            or self.detect_every_n_frames <= 1
            or (self.frame_index % self.detect_every_n_frames == 0)
        )

        if should_detect:
            detected_center = self._detect_face_center(frame)
            if detected_center is not None:
                self.last_detected_center_x = detected_center

        target_x = self.last_detected_center_x
        if target_x is None:
            target_x = self.center_x

        self.center_x += (target_x - self.center_x) * self.smooth_factor

        if self.total_frames > 0 and (
            self.frame_index == 1 or self.frame_index % max(1, self.detect_every_n_frames * 2) == 0
        ):
            self._emit_progress("processing", self.frame_index, self.total_frames)

        return self._crop_frame(frame)

    def execute(self, url: str, outputfile: str, cut_seconds: int | None = None) -> bool:
        clip = None
        clip_to_process = None
        ai_clip = None

        try:
            self.strErr = ""
            self.frame_index = 0
            self.last_detected_center_x = None
            self.total_frames = 0
            self.processing_started_at = 0.0
            self._ensure_not_cancelled()

            self._emit_step("download", "running", "Baixando video do YouTube")
            self._ensure_not_cancelled("Download do video cancelado pelo usuario.")
            if not self._download_video_youtube(url):
                self._emit_step("download", "error", self.strErr)
                return False
            self._emit_step("download", "completed", "Video baixado")
            self._ensure_not_cancelled()

            self._emit_step("prepare", "running", "Validando FFmpeg e modelos")
            self._ensure_not_cancelled()
            if not self._install_ffmpeg():
                self._emit_step("prepare", "error", self.strErr)
                return False

            self._ensure_not_cancelled()
            if not self._create_detector():
                self._emit_step("prepare", "error", self.strErr)
                return False
            self._emit_step("prepare", "completed", "Ambiente pronto")
            self._ensure_not_cancelled()

            self._emit_step("processing", "running", "Abrindo arquivo e preparando pipeline")
            self._ensure_not_cancelled()
            video = Path(self.saveVideo)
            if not video.exists():
                self.strErr = "O video nao foi encontrado no diretorio de download."
                self._emit_step("processing", "error", self.strErr)
                return False

            clip = VideoFileClip(str(video))
            duracao_total = float(clip.duration)

            clip_to_process = clip

            if cut_seconds is not None:
                if cut_seconds <= 0:
                    self.strErr = "O tempo de corte deve ser maior que zero."
                    self._emit_step("processing", "error", self.strErr)
                    return False

                tempo_final = min(float(cut_seconds), duracao_total)
                if float(cut_seconds) > duracao_total:
                    self._emit_log(
                        "Tempo de corte maior que a duracao. Usando o maximo disponivel."
                    )

                clip_to_process = clip.subclip(0, tempo_final)

            self.video_width = float(clip_to_process.w)
            self.video_height = float(clip_to_process.h)

            fps = float(clip_to_process.fps or 30.0)
            self.total_frames = int(max(1, round(float(clip_to_process.duration) * fps)))

            self.target_w = int(self.video_height * (9 / 16))
            self.center_x = self.video_width / 2.0

            if self.target_w <= 0 or self.target_w > self.video_width:
                self.strErr = "Nao foi possivel calcular corretamente o recorte 9:16."
                self._emit_step("processing", "error", self.strErr)
                return False

            self._emit_step("processing", "completed", "Pipeline pronto")
            self._emit_step("detecting", "running", "Detectando rosto com IA")
            self._emit_log("Iniciando processamento de frames...")

            self._ensure_not_cancelled()
            ai_clip = clip_to_process.fl_image(self._process_video_frame)
            self.processing_started_at = time.time()
            self._emit_step("vertical", "running", "Gerando recorte vertical 9:16")

            logger = MoviePyMetricsLogger(
                on_progress=lambda index, total: self._emit_progress("rendering", index, total),
                on_log=self._emit_log,
                should_cancel=self._is_cancel_requested,
            )

            ai_clip.write_videofile(
                outputfile,
                codec=self.codec,
                audio_codec=self.audio_codec,
                bitrate=self.bitrate,
                threads=self.threads,
                preset=self.preset,
                logger=logger,
            )

            self._ensure_not_cancelled()
            self._emit_progress("rendering", self.total_frames, self.total_frames)
            self._emit_step("detecting", "completed", "Deteccao finalizada")
            self._emit_step("vertical", "completed", "Video vertical gerado")
            self._emit_log(f"Arquivo final salvo em: {outputfile}")

            return True

        except ProcessingCancelledError:
            raise
        except Exception as e:
            self.strErr = (
                "Ocorreu um erro ao executar a rotina de geracao de shorts.\n"
                f"Erro: {e}"
            )
            self._emit_step("vertical", "error", self.strErr)
            return False

        finally:
            if ai_clip is not None:
                try:
                    ai_clip.close()
                except Exception:
                    pass

            if clip_to_process is not None and clip_to_process is not clip:
                try:
                    clip_to_process.close()
                except Exception:
                    pass

            if clip is not None:
                try:
                    clip.close()
                except Exception:
                    pass

            if self.blaze_detector is not None:
                try:
                    self.blaze_detector.close()
                except Exception:
                    pass
                self.blaze_detector = None
