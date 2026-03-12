

import argparse
from Controller.controller_gerador_shorts import GeradorShortsAutoFace



def main():
    def positive_int(value: str) -> int:
        ivalue = int(value)
        if ivalue <= 0:
            raise argparse.ArgumentTypeError("deve ser um inteiro maior que zero")
        return ivalue
    
    parser = argparse.ArgumentParser(
        description=(
            "Gera shorts em 9:16 com rastreamento facial alternável.\n\n"
            "Backends disponíveis:\n"
            "  blaze       -> mais leve e rápido para testes.\n"
            "  retinaface  -> mais preciso, porém mais pesado.\n\n"
            "Otimização:\n"
            "  A detecção pode acontecer a cada N frames, reaproveitando o último "
            "centro detectado nos frames intermediários."
        ),
        formatter_class=argparse.RawTextHelpFormatter
    )

    parser.add_argument(
        "-u", "--url",
        required=True,
        help="URL do vídeo do YouTube."
    )
    parser.add_argument(
        "-o", "--output",
        default="shorts_output.mp4",
        help="Nome do arquivo de saída. Padrão: shorts_output.mp4"
    )
    parser.add_argument(
        "-t", "--time",
        type=int,
        default=None,
        help="Tempo em segundos para cortar os primeiros segundos do vídeo."
    )

    parser.add_argument(
        "-m", "--model",
        default="blaze",
        choices=["blaze", "retinaface"],
        help=(
            "Backend de detecção facial.\n"
            "  blaze       -> mais rápido e leve.\n"
            "  retinaface  -> mais preciso e mais pesado.\n"
            "Padrão: blaze"
        )
    )

    parser.add_argument(
        "--detect-every",
        type=positive_int,
        default=3,
        help=(
            "Executa a detecção completa a cada N frames.\n"
            "  1 -> detecta em todo frame.\n"
            "  3 -> detecta a cada 3 frames.\n"
            "  5 -> detecta a cada 5 frames.\n"
            "Padrão: 3"
        )
    )

    parser.add_argument(
        "--smooth-factor",
        type=float,
        default=0.08,
        help=(
            "Fator de suavização do movimento horizontal.\n"
            "Valores menores deixam o movimento mais suave e lento.\n"
            "Valores maiores deixam a câmera reagir mais rápido.\n"
            "Padrão: 0.08"
        )
    )

    parser.add_argument(
        "--min-detection-confidence",
        type=float,
        default=0.5,
        help=(
            "Confiança mínima do BlazeFace.\n"
            "Exemplo: 0.3, 0.5, 0.7\n"
            "Padrão: 0.5"
        )
    )

    parser.add_argument(
        "--retina-threshold",
        type=float,
        default=0.90,
        help=(
            "Confiança mínima do RetinaFace.\n"
            "Exemplo: 0.8, 0.9, 0.95\n"
            "Padrão: 0.90"
        )
    )

    parser.add_argument(
        "--codec",
        default="libx264",
        choices=["libx264", "libx265", "mpeg4"],
        help=(
            "Codec de vídeo.\n"
            "  libx264 -> maior compatibilidade.\n"
            "  libx265 -> melhor compressão, mais pesado.\n"
            "  mpeg4   -> mais antigo.\n"
            "Padrão: libx264"
        )
    )

    parser.add_argument(
        "--audio-codec",
        default="aac",
        choices=["aac", "mp3", "pcm_s16le"],
        help=(
            "Codec de áudio.\n"
            "  aac       -> melhor padrão para mp4.\n"
            "  mp3       -> compatível.\n"
            "  pcm_s16le -> sem compressão.\n"
            "Padrão: aac"
        )
    )

    parser.add_argument(
        "--bitrate",
        default="8000k",
        help=(
            "Bitrate do vídeo.\n"
            "Exemplos: 5000k, 8000k, 12000k\n"
            "Padrão: 8000k"
        )
    )

    parser.add_argument(
        "--threads",
        type=positive_int,
        default=4,
        help="Quantidade de threads de CPU. Padrão: 4"
    )

    parser.add_argument(
        "--preset",
        default="slow",
        choices=[
            "ultrafast", "superfast", "veryfast", "faster",
            "fast", "medium", "slow", "slower", "veryslow"
        ],
        help=(
            "Preset do encoder.\n"
            "  ultrafast -> mais rápido, arquivo maior.\n"
            "  medium    -> equilíbrio.\n"
            "  slow      -> mais compressão.\n"
            "  veryslow  -> máxima compressão, mais lento.\n"
            "Padrão: slow"
        )
    )

    args = parser.parse_args()
    
    instanceGeradorShortsAutoFace: GeradorShortsAutoFace = GeradorShortsAutoFace()
    
    
    instanceGeradorShortsAutoFace.detector_backend = args.model
    instanceGeradorShortsAutoFace.detect_every_n_frames = args.detect_every
    instanceGeradorShortsAutoFace.smooth_factor = args.smooth_factor
    instanceGeradorShortsAutoFace.min_detection_confidence = args.min_detection_confidence
    instanceGeradorShortsAutoFace.retina_threshold = args.retina_threshold

    instanceGeradorShortsAutoFace.codec = args.codec
    instanceGeradorShortsAutoFace.audio_codec = args.audio_codec
    instanceGeradorShortsAutoFace.bitrate = args.bitrate
    instanceGeradorShortsAutoFace.threads = args.threads
    instanceGeradorShortsAutoFace.preset = args.preset

    if not instanceGeradorShortsAutoFace.execute(
        url=args.url,
        outputfile=args.output,
        cut_seconds=args.time
    ):
        print(f"Erro: {instanceGeradorShortsAutoFace.strErr}")
        exit(1)
    
    print(f"Short gerado com sucesso: {args.output}")
       

if __name__ == "__main__":
    main()