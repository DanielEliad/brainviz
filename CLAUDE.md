# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Code Style

Keep code clean and simple:
- Skip obvious docstrings (don't document `parse_dr_file` as "Parse a DR file")
- Skip Args/Returns sections when types are clear from signatures
- Avoid decorative section headers (`# =========`)
- One-liner docstrings only when they add value beyond the function name
- No module-level docstrings that just repeat the filename

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
    - `drawFrame.ts` - Frame drawing logic and edge filtering functions
    - `drawFrame.test.ts` - Vitest unit tests
- `data/` - READ ONLY data directory - must never change
    - `phenotypics.csv` - labels per subject id (subject_id integer -> ASD/HC label)
    - `ABIDE/` - ABIDE time series .txt files per subject
        - `ABIDE_I/` - ABIDE 1 data set with per site directories - per site are subject files (.txt)
        - `ABIDE_II/` - ABIDE 2 data set with per site directories - per site are subject files (.txt)
    - `wavelet.h5` - Pre-computed wavelet coherence data (see Wavelet Data Pipeline)

## Domain Context

The data represents **14 RSN (Resting State Networks)** - brain regions that show correlated activity during rest. The visualization shows dynamic functional connectivity between these networks over time.

## Key Types and Enums

### Backend (Python)
- `CorrelationMethod` enum: `PEARSON`, `SPEARMAN`, `WAVELET`
- `CorrelationParams` dataclass: `method`, `window_size`, `step`

### Frontend (TypeScript)
- `CorrelationMethod`: `"pearson" | "spearman" | "wavelet"`
- `AbideParams`: Parameters for data fetching

## API Endpoints

- `GET /abide/files` - List available data files
- `GET /abide/methods` - List correlation methods and their parameters
- `GET /abide/data` - Get computed correlation data
  - Required: `file_path`, `method`
  - Optional: `window_size`, `step`, `smoothing`, `interpolation`, `interpolation_factor`

## Data Pipeline (End-to-End)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 1: Raw ABIDE File                                                    │
│  File: dr_stage1_subject0050649.txt                                         │
│  Format: Space-separated floats, 32 columns × ~200 rows                     │
│  Shape: [timepoints × 32 ICA components]                                    │
│  Example row: "102.34 -45.67 89.12 ... (32 values)"                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ parse_dr_file()
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 2: Parsed NumPy Array                                                │
│  Shape: [timepoints × 32]                                                   │
│  dtype: float64                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ filter_rsn_columns()
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 3: Filtered RSN Data                                                 │
│  Shape: [timepoints × 14]                                                   │
│  Only keeps columns at indices [0,1,4,5,6,8,11,12,13,14,17,18,20,26]        │
│  (RSN_INDICES - 1, since Python is 0-indexed)                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ windowed_correlation()
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 4: Correlation Matrices                                              │
│  Shape: [n_frames × 14 × 14]                                                │
│  n_frames = (timepoints - window_size) / step + 1                           │
│  Values: Correlation coefficients [-1, 1]                                   │
│  Each matrix[i,j] = correlation between RSN i and RSN j in that window      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                        ┌─────────────┴─────────────┐
                        ▼                           ▼
              (if interpolation != "none")  (if smoothing != "none")
┌───────────────────────────────────┐  ┌───────────────────────────────────┐
│  STAGE 5a: Interpolation          │  │  STAGE 5b: Smoothing              │
│  Increases frame count            │  │  Smooths each edge over time      │
│  factor=2 → doubles frames        │  │  Algorithms: moving_avg,          │
│  Algorithms: linear, cubic_spline │  │  exponential, gaussian            │
│  Shape: [(n-1)*factor+1 × 14×14]  │  │  Shape unchanged                  │
└───────────────────────────────────┘  └───────────────────────────────────┘
                        │                           │
                        └─────────────┬─────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 6: Build Graph Frames (main.py)                                      │
│  For each correlation matrix:                                               │
│    - Create 14 Node objects (one per RSN)                                   │
│    - Create Edge objects for each (i,j) pair                                │
│    - If symmetric: only upper triangle (91 edges)                           │
│    - If asymmetric: all pairs except diagonal (182 edges)                   │
│    - Compute connected components for node grouping                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 7: API Response (JSON)                                               │
│  {                                                                          │
│    frames: [{ timestamp, nodes: [...], edges: [...] }, ...],                │
│    meta: { edge_weight_min, edge_weight_max, ... },                         │
│    symmetric: true/false                                                    │
│  }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ useAbideData() hook
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 8: Frontend State (React Query cache)                                │
│  - allFrames: GraphFrame[]                                                  │
│  - frame: current GraphFrame (selected by time index)                       │
│  - meta: GraphMeta with data range                                          │
│  - symmetric: boolean                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ drawFrame()
┌─────────────────────────────────────────────────────────────────────────────┐
│  STAGE 9: Canvas Rendering                                                  │
│  - Nodes: Positioned in circle, colored by group                            │
│  - Edges: Filtered by threshold, colored/sized by |weight|                  │
│    - Color: blue (weak) → red (strong)                                      │
│    - Thickness: thin (weak) → thick (strong)                                │
│  - Labels: RSN short names (aDMN, V1, SAL, etc.)                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Transformations Summary

| Stage | Location | Input Shape | Output Shape | Key Operation |
|-------|----------|-------------|--------------|---------------|
| 1→2 | `parse_dr_file` | .txt file | [T × 32] | `np.loadtxt` |
| 2→3 | `filter_rsn_columns` | [T × 32] | [T × 14] | Column selection |
| 3→4 | `windowed_correlation` | [T × 14] | [F × 14 × 14] | Sliding window correlation |
| 4→5a | `apply_interpolation` | [F × 14 × 14] | [F' × 14 × 14] | Temporal upsampling |
| 4→5b | `apply_smoothing` | [F × 14 × 14] | [F × 14 × 14] | Temporal smoothing |
| 5→6 | `main.py` loop | [F × 14 × 14] | GraphFrame[] | Matrix → Node/Edge objects |
| 7→8 | `useAbideData` | JSON | React state | Fetch + cache |
| 8→9 | `drawFrame` | GraphFrame | Canvas pixels | d3 scales + canvas API |

### Data Value Ranges

| Stage | Typical Range | Notes |
|-------|---------------|-------|
| Raw ABIDE | ~50-150 | BOLD signal values |
| Correlation | [-1, 1] | Pearson/Spearman coefficients |
| Wavelet | [0, 1] | Leading ratio (proportion of lead events) |
| Edge visualization | [0, max(\|min\|, \|max\|)] | Absolute value for color/thickness |

## Wavelet Data Pipeline

Wavelet coherence is pre-computed externally (MATLAB) and converted to HDF5 for use by the backend.

### Conversion Script

`backend/scripts/convert_wavelet_to_subject_files.py` converts MATLAB `.mat` files to HDF5:

```bash
# Dry run first (read-only, shows what would be done)
python convert_wavelet_to_subject_files.py \
  --input-path /path/to/mats \
  --output-path /path/to/wavelet.h5 \
  --participants /path/to/participants.mat \
  --phenotypics /path/to/phenotypics.csv \
  --dry-run

# Actual conversion (only writes to --output-path, never to --input-path)
python convert_wavelet_to_subject_files.py \
  --input-path /path/to/mats \
  --output-path /path/to/wavelet.h5 \
  --participants /path/to/participants.mat \
  --phenotypics /path/to/phenotypics.csv
```

**Input:** Directory containing `Coherence_X_Y.mat` files (one per RSN pair)
**Output:** Single HDF5 file with structure:
```
wavelet.h5
├── wavelet_subjects        # int array [n_subjects] - subject IDs in order
└── pairs/
    ├── aDMN_V1/
    │   └── angle_maps      # int array [n_subjects, n_timepoints, n_scales]
    ├── aDMN_SAL/
    │   └── angle_maps
    └── ... (91 RSN pairs)
```

### Phase Values (angle_maps)

| Value | Constant | Meaning |
|-------|----------|---------|
| 1 | PHASE_LEAD | Network A leads network B |
| -1 | PHASE_LAG | Network A lags network B |
| 2 | PHASE_IN_PHASE | Networks are in phase |
| -2 | PHASE_ANTI | Networks are anti-phase |
| 0 | PHASE_NONE | No significant coherence |

### Runtime Processing (`wavelet_processing.py`)

`compute_wavelet_matrices()` converts phase data to leading ratios:

1. **Subject lookup**: Extract subject ID from filename, find index in `wavelet_subjects`
2. **For each RSN pair**: HDF5 has both A_B and B_A directions
3. **Sliding window**: For each frame, count PHASE_LEAD in the window
4. **Leadership ratio**: `n_lead / n_all` (proportion of lead events in all data)
5. **Both directions**: Both matrix[i,j] (A leads B) and matrix[j,i] (B leads A) populated

Output: `List[np.ndarray]` of 14×14 matrices, values [0, 1]:
- Both directions populated (asymmetric data)
- Weight = proportion of leading events in window data
- Frontend toggle: show both edges or only dominant edge per pair

### Key Difference from Correlation Methods

| Aspect | Pearson/Spearman | Wavelet |
|--------|------------------|---------|
| Symmetric | Yes | No |
| Value range | [-1, 1] | [0, 1] |
| Edge direction | Bidirectional | Leader → follower |
| Computation | Real-time from .txt | Pre-computed from .h5 |
| Edge meaning | Correlation strength | Leadership proportion |

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

## UI Framework

### Overview

The UI follows **shadcn/ui patterns** - components are not installed from a package but copied into the codebase and customized. This means you own the code and can modify it freely.

### File Structure
```
frontend/src/
├── components/ui/     # Reusable UI primitives
├── ui/                # App-specific UI (Timeline, ControlsBar)
├── lib/utils.ts       # cn() utility for class merging
└── styles.css         # CSS variables for theming
```

### Key Utilities

**`cn()` function** (`@/lib/utils`): Merges Tailwind classes with proper precedence. Always use this for conditional/combined classes:
```tsx
import { cn } from "@/lib/utils";
className={cn("base-classes", conditional && "extra-class", className)}
```

### Theming

Colors are CSS variables in HSL format (without `hsl()` wrapper) defined in `styles.css`:
- Light mode: `:root { --primary: 221.2 83.2% 53.3%; }`
- Dark mode: `.dark { --primary: 217.2 91.2% 59.8%; }`

Use via Tailwind: `bg-primary`, `text-muted-foreground`, `border-input`, etc.

**Core semantic colors**: `background`, `foreground`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`

### Adding a New Component

1. Create file in `frontend/src/components/ui/`
2. Import `cn` from `@/lib/utils` for class merging
3. Use `React.forwardRef` if the component wraps a native element
4. Export named (not default) for consistency
5. Use semantic color classes (`bg-primary`, not `bg-blue-500`)

**Template:**
```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

interface MyComponentProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "alt";
}

const MyComponent = React.forwardRef<HTMLDivElement, MyComponentProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "base-styles",
        variant === "alt" && "alt-styles",
        className
      )}
      {...props}
    />
  )
);
MyComponent.displayName = "MyComponent";

export { MyComponent };
```

### Component Patterns

| Pattern | When to use | Example |
|---------|-------------|---------|
| `forwardRef` | Wrapping native elements | Button, Slider, Card |
| Generic `<T>` | Value can be string or number | SegmentedControl |
| Controlled only | Complex state/validation | SearchableSelect |
| CSS `grid-rows` animation | Height transitions | CollapsibleSection |
| Document event listeners | Drag beyond element bounds | GradientSlider |
| Fixed positioning | Escape overflow containers | SearchableSelect dropdown |

### Existing Components

**Standard** (shadcn-style):
- `Button` - variants: `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`; sizes: `default`, `sm`, `lg`, `icon`
- `Card` - `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`
- `Slider` - native range input wrapper with `onValueChange`
- `Tooltip` - hover tooltip, `side`: `top`, `bottom`, `left`, `right`

**Custom**:
- `SearchableSelect` - filterable dropdown with fixed positioning, right-aligned to avoid viewport overflow
- `SegmentedControl` - iOS-style picker, sizes: `sm`, `md`
- `GradientSlider` - colored track slider with floating value badge
- `CollapsibleSection` - animated accordion with summary and action slot

## Backend Framework

### File Structure
```
backend/
├── app/
│   ├── main.py              # FastAPI app, endpoints, smoothing/interpolation
│   ├── models.py            # Pydantic models (Node, Edge, GraphFrame, GraphMeta)
│   ├── abide_processing.py  # Data parsing, correlation computation
│   └── analytics/
│       └── community.py     # NetworkX graph analysis
└── tests/
    ├── conftest.py          # Fixtures (temp dirs, synthetic data, test client)
    ├── test_abide_endpoints.py
    ├── test_abide_processing.py
    └── test_health.py
```

### Module Organization (`abide_processing.py`)

The file is organized into 5 stages:

1. **CONSTANTS** - RSN indices, names, file paths
2. **ENUMS** - `CorrelationMethod` enum, `CorrelationParams` dataclass
3. **PARSERS** - File reading (`parse_dr_file`, `parse_phenotypics`, `list_subject_files`)
4. **TRANSFORMS** - Correlation functions (`pearson_matrix`, `spearman_matrix`, `windowed_correlation`)
5. **API** - Public interface (`compute_correlation_matrices`, `get_method_info`, `is_symmetric`)

### RSN (Resting State Network) Data

The 14 RSN components are extracted from 32 ICA components:
```python
RSN_INDICES = [1, 2, 5, 6, 7, 9, 12, 13, 14, 15, 18, 19, 21, 27]  # 1-indexed

RSN_SHORT = {
    1: "aDMN", 2: "V1", 5: "SAL", 6: "pDMN", 7: "AUD", 9: "lFPN",
    12: "rFPN", 13: "latVIS", 14: "latSM", 15: "CER", 18: "SM1",
    19: "DAN", 21: "LANG", 27: "occVIS"
}
```

### Adding a New Correlation Method

1. Add to `CorrelationMethod` enum in `abide_processing.py`
2. Implement matrix function (e.g., `granger_matrix(data: np.ndarray) -> np.ndarray`)
3. Add case to `compute_correlation()` dispatcher
4. Update `is_symmetric()` if the method is asymmetric
5. Add entry to `get_method_info()` with parameters
6. Update frontend `CorrelationMethod` type in `useGraphData.ts`

### Adding a New Smoothing/Interpolation Algorithm

Both are in `main.py`. They operate on correlation values over time (not raw fMRI data).

**Smoothing** (`apply_smoothing`):
- Input: `list[np.ndarray]` of correlation matrices
- Process: Extract time series for each (i,j) pair, smooth, reconstruct
- Algorithms: `moving_average`, `exponential`, `gaussian`

**Interpolation** (`apply_interpolation`):
- Input: `list[np.ndarray]` of correlation matrices
- Process: Increase frame count by factor (e.g., 2x doubles frames)
- Algorithms: `linear`, `cubic_spline`, `b_spline`, `univariate_spline`

To add a new algorithm, add an `elif` branch in the respective function.

### Testing Patterns

Tests are **self-contained** - they generate their own data, independent of real ABIDE files.

#### Python Code Style

Keep code clean and linear:

```python
# GOOD: All imports at top level
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
import app.main as main_module
from tests.utils import generate_abide_timeseries

# BAD: Imports inside functions
def test_something():
    import app.main  # Don't do this
```

**Rules:**
- All imports at module top level, never inside functions
- Use `unittest.mock.patch` for mocking, not manual assignment/restoration
- Shared utilities go in `tests/utils.py`, not duplicated across files
- Keep fixtures in `conftest.py` (pytest auto-discovers them)
- Use simple flat test functions, not test classes

#### Test File Structure

```
backend/tests/
├── conftest.py      # Fixtures only (no tests)
├── utils.py         # Shared helper functions
├── test_health.py   # Simple endpoint tests
├── test_abide_endpoints.py  # API integration tests
└── test_abide_processing.py # Unit tests for processing functions
```

#### Frontend Testing (Vitest)

Frontend uses Vitest for unit testing pure functions. Test files are colocated with source files using `.test.ts` suffix.

```
frontend/src/
├── lib/
│   ├── utils.ts              # cn() class name utility
│   └── utils.test.ts         # Tests for cn()
└── vis/
    ├── drawFrame.ts          # Edge filtering, node positioning, scales
    ├── drawFrame.test.ts     # Tests for edge/node functions
    ├── interpolation.ts      # Easing functions (linear, easeIn, bounce, etc.)
    ├── interpolation.test.ts # Tests for all easing functions
    ├── constants.test.ts     # Tests for visual constants (palette, padding, RSN counts)
    └── contracts.test.ts     # Type contract tests (API shapes, defaults)
```

**What to test:**
- Pure functions (edge filtering, visibility checks, node positioning)
- Mathematical functions (easing/interpolation, scales)
- Data transformations
- Utility functions (cn)
- **Constants** - values that shouldn't change (palette colors, padding ratios)
- **Contracts** - type structures and defaults that backend/frontend share

**What NOT to test:**
- React components (no jsdom/testing-library set up)
- Canvas rendering
- API calls

**Running frontend tests:**
```bash
./test.sh frontend    # Runs tests + build
nix-shell --run "cd frontend && npm test"  # Tests only
```

**Test patterns:**
```typescript
import { describe, it, expect } from "vitest";
import { isEdgeVisible } from "./drawFrame";

describe("isEdgeVisible", () => {
  it("returns false for zero weight", () => {
    expect(isEdgeVisible({ source: "A", target: "B", weight: 0 }, 0)).toBe(false);
  });
});
```

#### Auto-Use Fixtures for Mocking

Use `autouse=True` fixtures to mock external dependencies for all tests:

```python
@pytest.fixture(autouse=True)
def mock_data_paths(tmp_path: Path) -> Generator[None, None, None]:
    """Runs before EVERY test - mocks file paths to temp directories."""
    phenotypics_path = tmp_path / "phenotypics.csv"
    phenotypics_path.write_text("partnum,diagnosis\n")

    data_dir = tmp_path / "data"
    data_dir.mkdir()

    with patch.object(processing_module, "PHENOTYPICS_FILE_PATH", phenotypics_path), \
         patch.object(main_module, "DATA_DIR", data_dir):
        yield
```

This ensures tests never depend on real data files existing.

#### Fixture Patterns

**Basic fixtures:**
```python
@pytest.fixture
def temp_data_dir() -> Generator[Path, None, None]:
    """Create and cleanup a temp directory."""
    temp_dir = Path(tempfile.mkdtemp())
    yield temp_dir
    shutil.rmtree(temp_dir)
```

**Fixtures that override auto-use mocks:**
```python
@pytest.fixture
def test_client(sample_abide_structure: Path) -> Generator[TestClient, None, None]:
    """Override the auto-use mock with specific test data."""
    phenotypics_path = sample_abide_structure / "phenotypics.csv"

    with patch.object(main_module, "DATA_DIR", sample_abide_structure), \
         patch.object(processing_module, "PHENOTYPICS_FILE_PATH", phenotypics_path):
        yield TestClient(app)
```

**Fixtures for reducing test repetition:**
```python
@pytest.fixture
def file_path(test_client: TestClient) -> str:
    """Get first available file path - avoids repeating this in every test."""
    response = test_client.get("/abide/files")
    return response.json()["files"][0]["path"]
```

#### Test Organization

Use flat functions with comments to group related tests:

```python
# --- GET /abide/files ---

def test_list_files_returns_expected_structure(test_client: TestClient):
    response = test_client.get("/abide/files")
    assert response.status_code == 200
    ...

def test_list_files_finds_all_fixture_files(test_client: TestClient):
    ...

# --- GET /abide/data errors ---

def test_get_data_404_for_nonexistent_file(test_client: TestClient):
    ...
```

**Test names should be self-documenting** - no docstrings needed:

```python
# GOOD: Name describes what's being tested
def test_smaller_window_produces_more_frames(...):
def test_returns_14_rsn_nodes(...):
def test_422_for_window_size_out_of_range(...):

# BAD: Vague names
def test_window_size(...):  # What about window size?
```

### Pydantic Models (`models.py`)

```python
Node(id, label?, group?, degree?, attrs={})
Edge(source, target, weight, directed=False, attrs={})
GraphFrame(timestamp, nodes, edges, metadata={})
GraphMeta(available_timestamps, node_attributes, edge_attributes,
          edge_weight_min, edge_weight_max, description?)
```

### Graph Analysis (`analytics/community.py`)

Currently contains `simple_components(edges)` which uses NetworkX to find connected components. Returns `Dict[str, int]` mapping node ID to component index.

## Gotchas

- The `CorrelationMethod` enum exists in both backend (Python Enum) and frontend (TypeScript union type) - keep them in sync
- Method info returned by `/abide/methods` includes parameter definitions - update `get_method_info()` when changing parameters
- Fallback method options in `App.tsx` (lines ~228-232) need to match backend methods
- **Never normalize data in the backend** - let the frontend handle visualization scaling based on actual data ranges
- **Tests are self-contained** - test fixtures in `backend/tests/conftest.py` generate their own `phenotypics.csv` and ABIDE data files in temp directories, independent of real data
