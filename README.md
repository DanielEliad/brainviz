# BrainViz Scaffold

React + D3 canvas frontend with a FastAPI backend that serves time-varying weighted graph frames.

## Run the backend
```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```
The API defaults to `http://localhost:8000`. Sample data lives in `data/sample_edges.csv`.

## Run the frontend
```bash
cd frontend
npm install   # or pnpm/yarn
npm run dev   # serves at http://localhost:5173
```
Point the frontend at a different backend by setting `VITE_API_URL`, e.g. `VITE_API_URL=http://localhost:8000 npm run dev`.

## Run both (development)
```bash
./dev.sh
```
This starts both the backend and frontend in development mode.

## What’s included
- Canvas graph renderer at `frontend/src/vis/GraphCanvas.tsx` with radial layout and weight-based edge widths.
- Data hook `frontend/src/vis/useGraphData.ts` that fetches `/graph/meta` and `/graph/frame`, falling back to sample data if the backend is offline.
- FastAPI CSV pipeline in `backend/app/pipelines/csv_pipeline.py` exposing `/graph/meta` and `/graph/frame`.

## Next steps
- Add more pipelines (Parquet, database, streaming) implementing `GraphPipeline`.
- Move layout to a WebWorker with force-directed positioning for large graphs.
- Expand controls: play/pause timeline, weight/community filters, comparison mode.
