import os
import urllib.request
from pathlib import Path
from typing import Optional
import platform
import shutil
import subprocess

import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from moviepy.editor import VideoFileClip
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError
from retinaface import RetinaFace

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
        self.min_detection_confidence: float = 0.5
        self.retina_threshold: float = 0.90

        self.detect_every_n_frames: int = 3
        self.frame_index: int = 0
        self.last_detected_center_x: Optional[float] = None

        self.smooth_factor: float = 0.08


    def _install_ffmpeg(self) -> bool:
        try:
            def run_command(command: list[str]) -> bool:
                result = subprocess.run(
                    command,
                    capture_output=True,
                    text=True,
                    check=False
                )
                if result.returncode != 0:
                    self.strErr = (result.stderr or result.stdout or "").strip()
                    return False
                return True

            # já está instalado?
            if shutil.which("ffmpeg"):
                return True

            sistema = platform.system().lower()

            match sistema:
                case "linux":
                    # if not run_command(["sudo", "apt", "install", "-y", "ffmpeg"]):
                    self.strErr = f"e necessario ter o ffmpeg instalado no linux -> rode o comando sudo apt install -y ffmpeg: {self.strErr}"
                    return False

                case "windows":
                    if not shutil.which("winget"):
                        self.strErr = "winget não encontrado. Instale o App Installer ou instale o FFmpeg manualmente."
                        return False

                    if not run_command([
                        "winget", "install",
                        "--id=Gyan.FFmpeg",
                        "-e",
                        "--accept-source-agreements",
                        "--accept-package-agreements"
                    ]):
                        self.strErr = f"Erro ao instalar FFmpeg no Windows: {self.strErr}"
                        return False

                case _:
                    self.strErr = f"Sistema operacional não mapeado: {sistema}"
                    return False

            if not shutil.which("ffmpeg"):
                self.strErr = "FFmpeg não foi encontrado após a instalação."
                return False
            
            return True
        except Exception as e:
            self.strErr = f"Erro ao consultar/instalar FFmpeg: {e}"
            return False

    def _download_model_if_needed(self) -> bool:
        try:
            if not os.path.exists(self.model_path):
                url = (
                    "https://storage.googleapis.com/mediapipe-models/"
                    "face_detector/blaze_face_short_range/float16/1/"
                    "blaze_face_short_range.tflite"
                )
                print("Baixando modelo Blaze Face...")
                urllib.request.urlretrieve(url, self.model_path)
                print("Modelo Blaze Face baixado com sucesso.")
            return True
        except Exception as e:
            self.strErr = f"Erro ao consultar/instalar modelo Blaze Face: {e}"
            return False

    def _create_detector(self) -> bool:
        try:
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
                case "retinaface":
                    pass
                case _:
                    self.strErr = (
                        f"Backend de detector inválido: {self.detector_backend}. "
                        "Use 'blaze' ou 'retinaface'."
                    )
                    return False
            return True

        except Exception as e:
            self.strErr = f"Erro ao criar detector '{self.detector_backend}': {e}"
            return False

    def _download_video_youtube(self, url: str, pasta_saida: str = "downloads") -> bool:
        try:
            pasta_saida = Path(pasta_saida)
            pasta_saida.mkdir(parents=True, exist_ok=True)

            opcoes = {
                "outtmpl": str(pasta_saida / "%(title)s.%(ext)s"),
                "format": "bestvideo+bestaudio/best",
                "merge_output_format": "mp4",
                "noplaylist": True,
                "quiet": False,
            }

            with YoutubeDL(opcoes) as ydl:
                info = ydl.extract_info(url, download=True)

                titulo = info.get("title", "video")
                ext = opcoes.get("merge_output_format") or info.get("ext", "mp4")
                path = pasta_saida / f"{titulo}.{ext}"

                if not path.exists():
                    arquivos_mp4 = sorted(
                        pasta_saida.glob("*.mp4"),
                        key=lambda p: p.stat().st_mtime,
                        reverse=True
                    )
                    if arquivos_mp4:
                        path = arquivos_mp4[0]

            self.saveVideo = str(path)
            return True

        except DownloadError as e:
            self.strErr = (
                f"Erro ao tentar realizar o download do vídeo com a URL: {url}\n"
                f"Erro: {e}"
            )
            self.saveVideo = ""
            return False
        except Exception as e:
            self.strErr = (
                f"Erro inesperado ao tentar realizar o download do vídeo com a URL: {url}\n"
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
            frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            result = RetinaFace.detect_faces(frame_bgr)

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

        return self._crop_frame(frame)

    def execute(self, url: str, outputfile: str, cut_seconds: int | None = None) -> bool:
        clip = None
        clip_to_process = None
        ai_clip = None

        try:
            self.strErr = ""
            self.frame_index = 0
            self.last_detected_center_x = None

            if not self._install_ffmpeg():
                return False

            if not self._create_detector():
                return False

            if not self._download_video_youtube(url):
                return False

            video = Path(self.saveVideo)
            if not video.exists():
                self.strErr = "O vídeo não foi encontrado no diretório de download."
                return False

            clip = VideoFileClip(str(video))
            duracao_total = float(clip.duration)

            clip_to_process = clip

            if cut_seconds is not None:
                if cut_seconds <= 0:
                    self.strErr = "O tempo de corte deve ser maior que zero."
                    return False

                tempo_final = min(float(cut_seconds), duracao_total)

                if float(cut_seconds) > duracao_total:
                    self.strErr = (
                        "Tempo de corte não pode exceder o tempo total de vídeo. "
                        f"Foi utilizado o tempo máximo disponível: {duracao_total:.2f}s."
                    )

                clip_to_process = clip.subclip(0, tempo_final)

            self.video_width = float(clip_to_process.w)
            self.video_height = float(clip_to_process.h)

            self.target_w = int(self.video_height * (9 / 16))
            self.center_x = self.video_width / 2.0

            if self.target_w <= 0 or self.target_w > self.video_width:
                self.strErr = "Não foi possível calcular corretamente o recorte 9:16."
                return False

            ai_clip = clip_to_process.fl_image(self._process_video_frame)

            ai_clip.write_videofile(
                outputfile,
                codec=self.codec,
                audio_codec=self.audio_codec,
                bitrate=self.bitrate,
                threads=self.threads,
                preset=self.preset,
            )

            return True

        except Exception as e:
            self.strErr = (
                "Ocorreu um erro ao executar a rotina de geração de shorts.\n"
                f"Erro: {e}"
            )
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