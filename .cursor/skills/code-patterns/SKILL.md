---
name: code-patterns
description: Code patterns and architecture for BrainViz. Use when adding features, creating new correlation methods, modifying the data pipeline, or extending frontend components.
---

# Code Patterns

## Architecture Overview

```
Raw ABIDE files → Correlation matrices → GraphFrames → Canvas rendering
     .txt           [14×14] per frame      JSON API      drawFrame()
```

All correlation methods output the same format: `List[np.ndarray]` of 14×14 matrices.

## Adding a New Correlation Method

### 1. Add to enum in `rsn_constants.py`

```python
class CorrelationMethod(str, Enum):
    PEARSON = "pearson"
    SPEARMAN = "spearman"
    WAVELET = "wavelet"
    YOUR_METHOD = "your_method"  # Add here
```

### 2. Create processing function

Either in `abide_processing.py` or a new `your_method_processing.py`:

```python
def compute_your_method_matrices(filepath: Path, params: CorrelationParams) -> List[np.ndarray]:
    # Must return List[np.ndarray] where each array is 14×14
    ...
```

### 3. Add dispatch in `abide_processing.py`

```python
def compute_correlation_matrices(filepath: Path, params: CorrelationParams) -> List[np.ndarray]:
    if params.method == CorrelationMethod.YOUR_METHOD:
        return compute_your_method_matrices(filepath, params)
    # ... existing methods
```

### 4. Add method info in `get_method_info()`

```python
{
    "id": CorrelationMethod.YOUR_METHOD.value,
    "name": "Your Method Display Name",
    "symmetric": True,  # or False if directional
    "params": [
        {"name": "window_size", "type": "int", "default": 30, "min": 5, "max": 100},
        {"name": "step", "type": "int", "default": 1, "min": 1, "max": 50},
    ],
}
```

### 5. Update `is_symmetric()` if needed

### 6. Update frontend type in `useGraphData.ts`

```typescript
type CorrelationMethod = "pearson" | "spearman" | "wavelet" | "your_method";
```

## Key Types

### Backend (`rsn_constants.py`)

```python
@dataclass
class CorrelationParams:
    method: CorrelationMethod
    window_size: int = 30
    step: int = 1
```

### Frontend (`vis/types.ts`)

```typescript
type GraphMeta = {
  frame_count: number;
  edge_weight_min: number;
  edge_weight_max: number;
  // ...
};
```

## Data Range Handling

**Never hardcode ranges.** Backend returns actual min/max in metadata:

```python
# Backend computes from data
edge_weight_min = float(min(all_weights))
edge_weight_max = float(max(all_weights))
```

```typescript
// Frontend uses metadata
dataRange: { min: meta.edge_weight_min, max: meta.edge_weight_max }
```

## Frontend Component Patterns

Components follow shadcn/ui patterns in `components/ui/`:

```typescript
import { cn } from "@/lib/utils";

const MyComponent = React.forwardRef<HTMLDivElement, Props>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("base-styles", className)} {...props} />
  )
);
```

Use semantic colors: `bg-primary`, `text-muted-foreground`, not `bg-blue-500`.

## Testing Patterns

Tests are **self-contained** - they generate their own data via fixtures in `conftest.py`.

```python
# All imports at top level
from unittest.mock import patch

# Use autouse fixtures for mocking
@pytest.fixture(autouse=True)
def mock_data_paths(tmp_path):
    with patch.object(module, "PATH", tmp_path / "data"):
        yield
```

## Import Organization

```python
# Standard library
from pathlib import Path

# Third party
import numpy as np

# Local - use absolute imports
from app.rsn_constants import CorrelationMethod, CorrelationParams
```

Never import inside functions - always at module top level.

## RSN Constants

14 Resting State Networks defined in `rsn_constants.py`:

- `RSNS` - list of RSN dataclasses with index, names, nicknames
- `RSN_INDICES` - ICA component indices [1, 2, 5, 6, ...]
- `RSN_NAME_TO_POSITION` - lookup any name → position (0-13)

Use `RSN_NAME_TO_POSITION` for mapping external data (like wavelet pairs) to matrix indices.
