# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Always use the provided shell scripts** for standard tasks:

```bash
# Run both backend and frontend in development mode
./dev.sh

# Run tests - ALWAYS use this, never run pytest directly
./test.sh

# For custom commands, use nix-shell:
nix-shell --run "echo hello"
```

**IMPORTANT:**
- Always use `./test.sh` to run tests - never use `nix-shell --run pytest` or `uv run pytest` directly
- Do NOT try to activate venvs directly - use the provided scripts

## Project Structure

- `backend/` - FastAPI Python backend
  - `app/main.py` - API endpoints
  - `app/models.py` - Pydantic data models (Node, Edge, GraphFrame, GraphMeta)
  - `app/abide_processing.py` - Core correlation computation logic
  - `app/analytics/community.py` - NetworkX community detection
  - `tests/` - pytest tests
- `frontend/` - React/TypeScript frontend with Vite (uses TanStack React Query for data fetching, Zustand for state)
  - `src/App.tsx` - Main application component
  - `src/vis/` - Visualization components and hooks
    - `useGraphData.ts` - Data fetching hooks and types
    - `types.ts` - Shared TypeScript types
    - `GraphCanvas.tsx` - Canvas rendering
    - `drawFrame.ts` - Frame drawing logic
- `data/` - READ ONLY data directory - must never change
    - `phenotypics.csv` - labels per subject id (subject_id integer -> ASD/HC label)
    - `ABIDE/` - ABIDE time series .txt files per subject
        - `ABIDE_I/` - ABIDE 1 data set with per site directories - per site are subject files (.txt)
        - `ABIDE_II/` - ABIDE 2 data set with per site directories - per site are subject files (.txt)

## Domain Context

The data represents **14 RSN (Resting State Networks)** - brain regions that show correlated activity during rest. The visualization shows dynamic functional connectivity between these networks over time.

## Key Types and Enums

### Backend (Python)
- `CorrelationMethod` enum: `PEARSON`, `SPEARMAN`
- `CorrelationParams` dataclass: `method`, `window_size`, `step`

### Frontend (TypeScript)
- `CorrelationMethod`: `"pearson" | "spearman"`
- `AbideParams`: Parameters for data fetching

## API Endpoints

- `GET /abide/files` - List available data files
- `GET /abide/methods` - List correlation methods and their parameters
- `GET /abide/data` - Get computed correlation data
  - Required: `file_path`, `method`
  - Optional: `window_size`, `step`, `smoothing`, `interpolation`, `interpolation_factor`

## Data Processing Pipeline

The backend processes data in this order (see `main.py:86-102`):

1. **Correlation** - Computes windowed correlation matrices from raw fMRI time series
2. **Interpolation** - Adds intermediate frames between correlation matrices (e.g., factor=2 doubles frame count)
3. **Smoothing** - Smooths each edge's correlation value across time

Both interpolation and smoothing operate on the **correlation values over time**, not on the raw fMRI time series data. This means they affect the temporal dynamics of the visualization, not the underlying correlation computation.

## Common Patterns

### Adding/Removing Features

When adding or removing a feature that spans frontend and backend:

1. **Backend changes:**
   - Update `CorrelationParams` dataclass if it's a processing parameter
   - Update API endpoint parameters in `main.py`
   - Update `get_method_info()` if it affects method parameters
   - Update processing logic in `abide_processing.py`

2. **Frontend changes:**
   - Update types in `useGraphData.ts` (e.g., `AbideParams`, `CorrelationMethod`)
   - Update UI in `App.tsx`
   - Update any fallback/default values

3. **Tests:**
   - Update imports in test files
   - Remove/add specific test functions
   - Update assertions that check counts (e.g., number of methods)
   - Check for hardcoded values in test parameters

### Two Types of Thresholds

The project has an **Edge Threshold** slider (frontend-only, in Playback section) that filters edges during rendering. This is different from any backend threshold which would affect data computation. The frontend threshold is sufficient for visual filtering.

## CRITICAL: Data Range Handling

**NEVER hardcode data ranges (like 0-255 or 0-1).** The backend returns raw correlation values and their actual min/max in the response metadata.

### How it works:
1. **Backend** (`compute_correlation_matrices`): Returns raw correlation values (typically [-1, 1] for Pearson/Spearman)
2. **Backend** (`main.py`): Calculates actual `edge_weight_min` and `edge_weight_max` from the data and includes in `meta`
3. **Frontend**: Uses `meta.edge_weight_min` and `meta.edge_weight_max` to create visualization scales

### Key types:
```typescript
// drawFrame.ts
type DataRange = { min: number; max: number };

// Scale factories - use ABSOLUTE VALUE of correlation for visualization
// Input to scales should be Math.abs(correlation)
// Range is [0, max(|min|, |max|)]
createColorScale(range: DataRange)   // blue (weak) → red (strong)
createThicknessScale(range: DataRange)  // thin (weak) → thick (strong)
getAbsoluteRange(range: DataRange)  // converts to [0, max_abs]
```

### Visualization notes:
- **Color/thickness**: Based on |correlation| (absolute value) - stronger correlations are redder/thicker
- **Arrows**: All edges have directional arrows showing the correlation direction (source → target)
- **Edge threshold**: Works on absolute values

### Where dataRange must be passed:
- `GraphCanvas` component (required prop)
- `drawFrame()` function (in DrawOptions)
- `useVideoExport` hook
- `videoExportWorker`

### Error handling:
- Backend raises HTTP 400 if no correlation matrices could be computed
- Frontend fallback meta `{ edge_weight_min: 0, edge_weight_max: 0 }` is only for loading state
- When data is present, backend guarantees valid min/max values

**If you see hardcoded 255, 0-255, -1/1 defaults, or similar magic numbers in visualization code, it's a bug.**

## Phenotypic Data

The `data/phenotypics.csv` file contains diagnosis labels (ASD/HC) for each subject.

### Subject ID Matching
- **Phenotypics CSV**: Uses integer subject IDs without leading zeros (e.g., `50649`)
- **Filename format**: `dr_stage1_subject0050649.txt` (with leading zeros)
- **Solution**: Both are parsed as integers for matching (`int(row["partnum"])` and `int(stem.replace(...))`)

### Data Integrity Assertions
`abide_processing.py` enforces:
1. **No duplicate subject IDs** in phenotypics - raises `ValueError` if found
2. **Every subject file must have a diagnosis** - raises `ValueError` if missing from phenotypics

### Types
```python
# Backend
def parse_phenotypics() -> dict[int, str]  # subject_id -> "ASD" | "HC"
```

```typescript
// Frontend (useGraphData.ts)
type AbideFile = {
  path: string;
  subject_id: number;
  site: string;
  version: string;
  diagnosis: "ASD" | "HC";  // Required, not optional
};
```

## Video Export

Video export renders at 4K resolution (3840×2160) for higher quality output. The `drawFrame.ts` scales all visual elements proportionally based on canvas width using `scale = width / BASE_WIDTH` where `BASE_WIDTH = 1920`.

### Scaling in drawFrame.ts
All pixel-based measurements scale with the canvas:
- Node radius, stroke widths, selection glow
- Font sizes for labels
- Edge thickness range
- Arrow sizes and spacing
- Info box dimensions

### Info Box

The video export displays subject metadata in a compact info box overlay.

### Data Flow
1. `App.tsx`: Gets `selectedSubjectInfo: AbideFile` from files query
2. `useVideoExport`: Passes `subjectInfo` to worker
3. `videoExportWorker`: Passes to `drawFrame()` via `infoBox.subjectInfo`
4. `drawFrame.ts`: Renders compact two-line format

### Info Box Format
```
ABIDE_I / CMU / 50649 (ASD)
Smooth: none | Interp: none | Speed: 1x | Thresh: 0.00
```

### Key Types
```typescript
// drawFrame.ts
type SubjectInfo = {
  subject_id: number;
  site: string;
  version: string;
  diagnosis: "ASD" | "HC";
};

type DrawOptions = {
  // ...
  infoBox?: {
    smoothing: string;
    interpolation: string;
    speed: number;
    edgeThreshold: number;
    subjectInfo?: SubjectInfo;
  };
};
```

## Gotchas

- The `CorrelationMethod` enum exists in both backend (Python Enum) and frontend (TypeScript union type) - keep them in sync
- Method info returned by `/abide/methods` includes parameter definitions - update `get_method_info()` when changing parameters
- Fallback method options in `App.tsx` (lines ~228-232) need to match backend methods
- **Never normalize data in the backend** - let the frontend handle visualization scaling based on actual data ranges
- **Tests are self-contained** - test fixtures in `backend/tests/conftest.py` generate their own `phenotypics.csv` and ABIDE data files in temp directories, independent of real data
