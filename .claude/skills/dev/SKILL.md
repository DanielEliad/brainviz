---
name: dev
description: Start development servers (backend FastAPI and frontend Vite)
disable-model-invocation: true
---

# Start Development Servers

Start both backend and frontend development servers.

## Usage

```bash
./dev.sh
```

This starts:
- **Backend**: FastAPI on http://localhost:8000 (uvicorn with hot reload)
- **Frontend**: Vite on http://localhost:5173 (HMR enabled)

## Stopping

Press `Ctrl+C` to stop both servers.

## Individual Servers

If you need to run servers separately:

```bash
# Backend only
nix-shell --run "cd backend && uv run uvicorn app.main:app --reload"

# Frontend only
nix-shell --run "cd frontend && npm run dev"
```

## API Endpoints

Once running:
- `GET /abide/files` - List available data files
- `GET /abide/methods` - List correlation methods
- `GET /abide/data` - Get computed correlation data
