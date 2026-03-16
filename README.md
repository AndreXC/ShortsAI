# AI Shorts Generator

Aplicacao full stack para gerar videos Shorts (9:16) a partir de links do YouTube com recorte facial automatico.

## Stack

- Backend API: FastAPI + WebSocket
- Processamento: MoviePy + BlazeFace/RetinaFace + FFmpeg
- Frontend: React + TypeScript + Vite + Tailwind

## Estrutura

- `backend/` API REST + WebSocket + jobs assincronos
- `Controller/` pipeline de processamento de video
- `frontend/` interface web
- `app.py` execucao via CLI (opcional)

## Requisitos

- Python 3.11
- Node.js 20+
- npm 10+
- FFmpeg no PATH (ou instalacao automatica no Windows via winget)

## 1) Instalar dependencias Python

No diretorio raiz do projeto:

```bash
venv\Scripts\python.exe -m pip install -r requeriments.txt
```

## 2) Rodar backend (FastAPI)

Em um terminal na raiz do projeto:

```bash
venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Teste rapido:

- `http://127.0.0.1:8000/health` deve retornar `{"status":"ok"}`

## 3) Rodar frontend (Vite)

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

Abra:

- `http://localhost:5173`

## Fluxo de uso

1. Cole o link do YouTube.
2. Ajuste configuracoes (opcional).
3. Clique em `Gerar Shorts`.
4. Acompanhe a timeline.
5. Ao finalizar, visualize o preview e baixe o video.

## Endpoints esperados pela UI

- `POST /generate`
- `GET /status/{job_id}`
- `GET /result/{job_id}`
- `WS /logs/{job_id}`

Se voce estiver usando Flask no backend, mantenha exatamente esses endpoints e formatos de resposta para o frontend funcionar sem ajustes.

## Variaveis opcionais do frontend

- `VITE_API_BASE_URL` (ex: `http://127.0.0.1:8000`)
- `VITE_WS_BASE_URL` (ex: `ws://127.0.0.1:8000`)

## Modo CLI (opcional)

Para processar sem UI:

```bash
venv\Scripts\python.exe app.py -u "https://www.youtube.com/watch?v=SEU_VIDEO" -o "shorts_output.mp4"
```

## Build de producao do frontend

```bash
cd frontend
npm run build
```

Arquivos gerados em `frontend/dist`.
