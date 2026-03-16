import argparse
import json
import sys

from Controller.controller_generet_voice import GenerateVoiceController


def _parse_tts_kwargs(values: list[str] | None) -> dict:
    """
    Converte argumentos no formato chave=valor para dict.
    Exemplo:
        --tts-kwarg temperature=0.7 --tts-kwarg enable_text_splitting=true
    """
    parsed = {}

    if not values:
        return parsed

    for item in values:
        if "=" not in item:
            raise argparse.ArgumentTypeError(
                f"Parâmetro inválido em --tts-kwarg: '{item}'. Use o formato chave=valor."
            )

        key, value = item.split("=", 1)
        key = key.strip()
        value = value.strip()

        if not key:
            raise argparse.ArgumentTypeError(
                f"Chave inválida em --tts-kwarg: '{item}'."
            )

        # tenta converter automaticamente
        lowered = value.lower()
        if lowered == "true":
            parsed[key] = True
        elif lowered == "false":
            parsed[key] = False
        elif lowered == "null" or lowered == "none":
            parsed[key] = None
        else:
            try:
                parsed[key] = json.loads(value)
            except Exception:
                parsed[key] = value

    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Pipeline para preparar voz de referência e gerar TTS com XTTS v2. "
            "Permite configurar parâmetros principais do método tts_to_file."
        )
    )

    parser.add_argument(
        "--vr",
        dest="voice_input",
        required=True,
        help=(
            "Arquivo de mídia de entrada usado para extrair a voz de referência. "
            "Ex.: mp3, wav, m4a. Este arquivo será processado com Demucs + FFmpeg."
        )
    )

    parser.add_argument(
        "--t",
        dest="text",
        required=True,
        help=(
            "Texto que será falado no áudio final. "
            "Ex.: 'Olá, este é um teste com clonagem de voz.'"
        )
    )

    parser.add_argument(
        "--o",
        dest="output_audio",
        required=True,
        help=(
            "Caminho do arquivo final gerado pelo TTS. "
            "Ex.: saida.wav"
        )
    )

    parser.add_argument(
        "--pvr",
        dest="prepared_voice_ref",
        default=None,
        help=(
            "Caminho opcional para salvar a voz de referência tratada "
            "(após separação e limpeza com FFmpeg). "
            "Se omitido, será salvo automaticamente em temp_voice/."
        )
    )

    parser.add_argument(
        "--l",
        dest="language",
        default="pt",
        help=(
            "Idioma da fala. Pode ser alterado conforme o modelo suportar. "
            "Exemplos comuns: pt, en, es, fr, de, it."
        )
    )

    parser.add_argument(
        "--s",
        dest="speed",
        type=float,
        default=1.4,
        help=(
            "Velocidade da fala. "
            "1.0 = normal, menor que 1.0 = mais lento, maior que 1.0 = mais rápido. "
            "Ex.: 0.9, 1.0, 1.2, 1.4"
        )
    )

    parser.add_argument(
        "--speaker",
        dest="speaker",
        default=None,
        help=(
            "Nome/ID do speaker do modelo, quando o modelo suportar speakers internos. "
            "Se estiver usando clonagem com speaker_wav, normalmente este campo pode ficar vazio."
        )
    )

    parser.add_argument(
        "--speaker-wav",
        dest="speaker_wav",
        default=None,
        help=(
            "Caminho para um arquivo de voz de referência já pronto. "
            "Se informado, pode substituir a voz preparada automaticamente do pipeline."
        )
    )

    parser.add_argument(
        "--emotion",
        dest="emotion",
        default=None,
        help=(
            "Emoção/estilo da voz, somente se o modelo suportar esse recurso. "
            "Exemplos possíveis dependem do modelo: happy, sad, angry, calm."
        )
    )

    parser.add_argument(
        "--pipe-out",
        dest="pipe_out",
        default=None,
        help=(
            "Uso avançado. Parâmetro reservado para integração programática com pipe/stream. "
            "No uso comum via terminal, deixe vazio."
        )
    )

    split_group = parser.add_mutually_exclusive_group()
    split_group.add_argument(
        "--split-sentences",
        dest="split_sentences",
        action="store_true",
        help=(
            "Divide o texto em sentenças antes da geração. "
            "Pode melhorar estabilidade em textos longos."
        )
    )

    split_group.add_argument(
        "--no-split-sentences",
        dest="split_sentences",
        action="store_false",
        help=(
            "Não divide o texto em sentenças antes da geração. "
            "Útil quando você quer manter a fala mais contínua."
        )
    )

    parser.set_defaults(split_sentences=False)

    parser.add_argument(
        "--tts-kwarg",
        dest="tts_kwargs",
        action="append",
        default=[],
        help=(
            "Parâmetro extra repassado diretamente para tts_to_file no formato chave=valor. "
            "Pode ser usado várias vezes. "
            "Ex.: --tts-kwarg temperature=0.7 --tts-kwarg some_flag=true"
        )
    )

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        parsed_tts_kwargs = _parse_tts_kwargs(args.tts_kwargs)
    except argparse.ArgumentTypeError as e:
        print(f"[ERRO] {e}", file=sys.stderr)
        return 1

    InstanceGenerateVoiceController: GenerateVoiceController = GenerateVoiceController()

    InstanceGenerateVoiceController.language = args.language
    InstanceGenerateVoiceController.speed = args.speed
    InstanceGenerateVoiceController.split_sentences = args.split_sentences
    InstanceGenerateVoiceController.speaker = args.speaker
    InstanceGenerateVoiceController.speaker_wav = args.speaker_wav
    InstanceGenerateVoiceController.emotion = args.emotion
    InstanceGenerateVoiceController.pipe_out = args.pipe_out
    InstanceGenerateVoiceController.tts_kwargs = parsed_tts_kwargs

    print("[INFO] geração de voz a partir da voz de referencia com TTSV2...")
    print("[INFO] Configuração escolhida ")
    print(f"[INFO] Arquivo de entrada: {args.voice_input}")
    print(f"[INFO] Saída final: {args.output_audio}")
    print(f"[INFO] Idioma: {InstanceGenerateVoiceController.language}")
    print(f"[INFO] Velocidade: {InstanceGenerateVoiceController.speed}")
    print(f"[INFO] Speaker: {InstanceGenerateVoiceController.speaker}")
    print(f"[INFO] Speaker WAV manual: {InstanceGenerateVoiceController.speaker_wav}")
    print(f"[INFO] Emotion: {InstanceGenerateVoiceController.emotion}")
    print(f"[INFO] Split sentences: {InstanceGenerateVoiceController.split_sentences}")
    print(f"[INFO] Kwargs extras: {InstanceGenerateVoiceController.tts_kwargs}")

    if not InstanceGenerateVoiceController.execute(
        voice_input_media=args.voice_input,
        text=args.text,
        output_audio=args.output_audio,
        prepared_voice_ref=args.prepared_voice_ref
    ):
        print(f"[ERRO] {InstanceGenerateVoiceController.StrErr}", file=sys.stderr)
        return 1

    print("[OK] Áudio gerado com sucesso.")
    return 0


if __name__ == "__main__":
    sys.exit(main())