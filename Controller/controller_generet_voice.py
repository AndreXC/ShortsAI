import shutil
import subprocess
import warnings
from pathlib import Path
from typing import Optional

import torch
from TTS.api import TTS


class GenerateVoiceController:
    def __init__(self):
        self.StrErr: str = ""
        self.vocals_path: str = ""
        self.extensoes_validas = {
        ".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".wma", ".webm", ".opus"
        }

        # Modelo
        self.model: str = "tts_models/multilingual/multi-dataset/xtts_v2"

        # Configurações padrão do TTS
        self.language: str = "pt"
        self.speed: float = 1.4
        self.split_sentences: bool = False

        self.speaker: Optional[str] = None
        self.speaker_wav: Optional[str] = None
        self.emotion: Optional[str] = None
        self.pipe_out = None
        self.tts_kwargs: dict = {}

        # Diretórios padrão
        self.base_separated_dir: Path = Path("separated") / "htdemucs"
        self.temp_dir: Path = Path("temp_voice")

        # Cache do modelo
        self._tts_model = None
        self._device = "cuda" if torch.cuda.is_available() else "cpu"

        # Ignorar warnings
        warnings.filterwarnings("ignore", category=FutureWarning)
        warnings.filterwarnings("ignore", category=UserWarning, module="TTS")

    # =========================================================
    # Utils básicas
    # =========================================================

    def _create_temp_dir(self) -> bool:
        try:
            self.temp_dir.mkdir(parents=True, exist_ok=True)
            return True
        except Exception as e:
            self.StrErr = f"Erro ao criar diretório temporário: {str(e)}"
            return False

    def _run_command(self, cmd: list[str], step_name: str) -> bool:
        """
        Executa comando externo e captura erro de forma padronizada.
        """
        try:
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False
            )

            if result.returncode != 0:
                self.StrErr = (
                    f"Falha em '{step_name}'.\n"
                    f"Comando: {' '.join(cmd)}\n"
                    f"Erro: {result.stderr.strip() or result.stdout.strip()}"
                )
                return False

            return True

        except FileNotFoundError:
            self.StrErr = (
                f"Comando não encontrado em '{step_name}'. "
                f"Verifique se a dependência está instalada e no PATH."
            )
            return False

        except Exception as e:
            self.StrErr = f"Erro ao executar '{step_name}': {str(e)}"
            return False

    # =========================================================
    # Validação de dependências
    # =========================================================
    def validate_dependencies(self) -> bool:
        """
        Valida se ffmpeg e demucs estão disponíveis.
        """
        if not shutil.which("ffmpeg"):
            self.StrErr = "Instale o FFmpeg antes de prosseguir."
            return False

        demucs_cmd = shutil.which("demucs")
        if demucs_cmd is None:
            try:
                import demucs  # noqa: F401
            except Exception:
                self.StrErr = "Demucs não foi encontrado. Instale com: pip install demucs"
                return False

        return True

    # =========================================================
    # Modelo XTTS
    # =========================================================
    def _load_tts_model(self) -> bool:
        try:
            if self._tts_model is None:
                self._tts_model = TTS(self.model)
                self._tts_model.to(self._device)
            return True
        except Exception as e:
            self.StrErr = f"Erro ao carregar modelo TTS '{self.model}': {str(e)}"
            return False

    # =========================================================
    # Etapa 1 - Separar voz com Demucs
    # =========================================================
    def separate_vocals(self, input_media: str) -> bool:
        """
        Separa a voz do arquivo de entrada usando Demucs.

        Exemplo de saída esperada:
        separated/htdemucs/<nome_arquivo_sem_ext>/vocals.wav
        """
        input_path = Path(input_media)

        if not input_path.exists():
            self.StrErr = f"Arquivo de entrada não encontrado: {input_media}"
            return False

        cmd = [
            "python",
            "-m",
            "demucs",
            "-n",
            "htdemucs",
            "--two-stems=vocals",
            "-d",
            self._device,
            str(input_path)
        ]

        if not self._run_command(cmd, "separação de voz com Demucs"):
            return False

        return True

    def get_demucs_vocals_path(self, input_media: str) -> bool:
        """
        Retorna o caminho esperado do vocals.wav gerado pelo Demucs.
        """
        input_path = Path(input_media)
        folder_name = input_path.stem
        vocals_path = self.base_separated_dir / folder_name / "vocals.wav"

        if not vocals_path.exists():
            self.StrErr = f"Arquivo de voz separado não encontrado: {vocals_path}"
            return False

        self.vocals_path = str(vocals_path)
        return True

    # =========================================================
    # Etapa 2 - Melhorar voz com FFmpeg
    # =========================================================
    def preprocess_reference_voice(self, vocals_path: str, output_voice_ref: str) -> bool:
        """
        Aplica filtros para deixar a voz mais limpa para clonagem:
        - highpass
        - lowpass
        - loudnorm
        - 16kHz
        - mono
        - PCM s16le
        """
        vocals_file = Path(vocals_path)
        if not vocals_file.exists():
            self.StrErr = f"Arquivo vocals.wav não encontrado: {vocals_path}"
            return False

        output_path = Path(output_voice_ref)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(vocals_file),
            "-af",
            "highpass=f=80,lowpass=f=12000,loudnorm",
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            str(output_path)
        ]

        if not self._run_command(cmd, "pré-processamento da voz de referência"):
            return False

        return True
    
    
    def validate_audio_file(self, audio_path: Path) -> bool:
        """
        Valida se o arquivo de áudio:
        - existe
        - não está vazio
        - possui extensão esperada
        - pode ser lido pelo FFmpeg/FFprobe
        - contém ao menos 1 stream de áudio válida
        """
        try:
            if not audio_path.exists():
                self.StrErr = f"Arquivo de áudio não encontrado: {audio_path}"
                return False

            if not audio_path.is_file():
                self.StrErr = f"O caminho informado não é um arquivo válido: {audio_path}"
                return False

            if audio_path.stat().st_size <= 0:
                self.StrErr = f"O arquivo de áudio está vazio: {audio_path}"
                return False


            if audio_path.suffix.lower() not in self.extensoes_validas:
                self.StrErr =  f"Extensão de áudio não suportada: {audio_path.suffix}. \n" + f"Use um arquivo de áudio válido."
                return False

            if not shutil.which("ffprobe"):
                self.StrErr = "ffprobe não encontrado no sistema. Instale o FFmpeg corretamente."
                return False

            cmd = [
                "ffprobe",
                "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "stream=codec_name,sample_rate,channels",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=0",
                str(audio_path)
            ]

            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False
            )

            if result.returncode != 0:
                self.StrErr =f"O arquivo de áudio parece corrompido ou ilegível: {audio_path}\n" + f"Detalhes: {result.stderr.strip() or result.stdout.strip()}"
                return False

            output = (result.stdout or "").strip()

            if not output:
                self.StrErr = f"Nenhuma stream de áudio válida foi encontrada em: {audio_path}"
                return False

            if "codec_name=" not in output:
                self.StrErr = f"O arquivo não possui codec de áudio válido: {audio_path}"
                return False

            if "duration=" in output:
                for line in output.splitlines():
                    if line.startswith("duration="):
                        duration_value = line.split("=", 1)[1].strip()
                        try:
                            if float(duration_value) <= 0:
                                self.StrErr = f"O áudio possui duração inválida: {audio_path}"
                                return False
                        except ValueError:
                            self.StrErr = f"Não foi possível interpretar a duração do áudio: {audio_path}"
                            return False

            return True

        except Exception as e:
            self.StrErr = f"Erro ao validar arquivo de áudio: {e}"
            return False

    # =========================================================
    # Pipeline completo da voz de referência
    # =========================================================
    def prepare_reference_voice(self, input_media: str, output_voice_ref: str) -> bool:
        """
        Pipeline:
        1. Validar dependências
        2. Separar vocals com Demucs
        3. Localizar vocals.wav
        4. Melhorar vocals com FFmpeg
        """
        if not self.validate_dependencies():
            return False

        if not self._create_temp_dir():
            return False

        if not self.separate_vocals(input_media):
            return False

        if not self.get_demucs_vocals_path(input_media):
            return False

        if not self.preprocess_reference_voice(self.vocals_path, output_voice_ref):
            return False

        return True

    # =========================================================
    # Etapa 3 - Gerar TTS
    # =========================================================
    def generate_tts(
        self,
        text: str,
        speaker_wav: str,
        output_file: str,
    ) -> bool:
        """
        Gera o áudio final usando a voz de referência tratada
        e repassa todos os parâmetros configuráveis do tts_to_file.
        """

        if not text or not text.strip():
            self.StrErr = "Texto vazio para geração de voz."
            return False

        # speaker_wav manual tem prioridade, se informado
        final_speaker_wav = self.speaker_wav if self.speaker_wav else speaker_wav

        if final_speaker_wav:
            if not Path(final_speaker_wav).exists():
                self.StrErr = f"Voz de referência não encontrada: {final_speaker_wav}"
                return False

        if not self._load_tts_model():
            return False

        try:
            output_path = Path(output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)

            tts_params = {
                "text": text,
                "speaker": self.speaker,
                "language": self.language,
                "speaker_wav": final_speaker_wav,
                "emotion": self.emotion,
                "speed": self.speed,
                "pipe_out": self.pipe_out,
                "file_path": str(output_path),
                "split_sentences": self.split_sentences,
                **self.tts_kwargs,
            }

            # remove valores None para evitar enviar parâmetros desnecessários
            tts_params = {k: v for k, v in tts_params.items() if v is not None}

            self._tts_model.tts_to_file(**tts_params)
            return True

        except Exception as e:
            self.StrErr = f"Erro ao gerar TTS: {e}"
            return False
        
    # =========================================================
    # Limpeza de diretórios temporários
    # =========================================================
    def cleanup_directories(self) -> bool:
        """
        Remove os diretórios temporários criados pelo pipeline.
        """
        try:
            dirs_to_remove = [
                Path("separated"),
                self.temp_dir
            ]

            for d in dirs_to_remove:
                if d.exists():
                    shutil.rmtree(d)

            return True
        except Exception as e:
            self.StrErr = f"Erro ao remover diretórios temporários: {str(e)}"
            return False

    # =========================================================
    # Pipeline completo
    # =========================================================
    def execute(
        self,
        voice_input_media: str,
        text: str,
        output_audio: str,
        prepared_voice_ref: Optional[str] = None
    ) -> bool:
        """
        Fluxo completo:
        1. prepara a voz de referência com Demucs + FFmpeg
        2. gera o TTS final
        """
        try:
            voice_input = Path(voice_input_media)
            if not self.validate_audio_file(voice_input):
                return False

            if not prepared_voice_ref:
                input_name = voice_input.stem
                prepared_voice_ref = str(self.temp_dir / f"{input_name}_voz_ref.wav")

            if not self.prepare_reference_voice(voice_input_media, prepared_voice_ref):
                return False

            if not self.generate_tts(
                text=text,
                speaker_wav=prepared_voice_ref,
                output_file=output_audio
            ):
                return False
            
            if not self.cleanup_directories():
                return False

            return True

        except Exception as e:
            self.StrErr = 'Erro ao executar Fluxo: ' + str(e)
            return False
