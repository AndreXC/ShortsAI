# Frontend - AI Shorts Generator

## Desenvolvimento

```bash
npm install
npm run dev
```

App em `http://localhost:5173`.

## Build

```bash
npm run build
```

Saida em `dist/`.

## Observacao

O frontend espera um backend com estes endpoints:

- `POST /generate`
- `GET /status/{job_id}`
- `GET /result/{job_id}`
- `WS /logs/{job_id}`
