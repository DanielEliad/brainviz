---
name: api-reference
description: API endpoints and data formats for BrainViz backend. Use when working with API calls, debugging requests, or understanding request/response structures.
---

# API Reference

## Endpoints

### GET /health
Health check.

**Response:** `{"status": "ok"}`

### GET /abide/files
List available subject files.

**Response:**
```json
{
  "files": [
    {
      "path": "ABIDE_I/CMU/dr_stage1_subject0050649.txt",
      "subject_id": 50649,
      "site": "CMU",
      "version": "ABIDE_I",
      "diagnosis": "ASD"
    }
  ],
  "data_dir": "/path/to/data/ABIDE"
}
```

### GET /abide/methods
List available correlation methods and their parameters.

**Response:**
```json
{
  "methods": [
    {
      "id": "pearson",
      "name": "Pearson Correlation",
      "symmetric": true,
      "params": [
        {"name": "window_size", "type": "int", "default": 30, "min": 5, "max": 100},
        {"name": "step", "type": "int", "default": 1, "min": 1, "max": 100}
      ]
    }
  ]
}
```

### GET /abide/data
Get computed correlation data for a subject.

**Parameters:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| file_path | string | yes | - | Relative path to subject file |
| method | string | yes | - | `pearson`, `spearman`, or `wavelet` |
| window_size | int | no | 30 | Sliding window size (5-100) |
| step | int | no | 1 | Step between windows (1-100) |
| smoothing | string | no | "none" | `none`, `moving_average`, `exponential`, `gaussian` |
| interpolation | string | no | "none" | `none`, `linear`, `cubic_spline`, `b_spline`, `univariate_spline` |
| interpolation_factor | int | no | 2 | Frame multiplier for interpolation |

**Response:**
```json
{
  "frames": [
    {
      "timestamp": 0,
      "nodes": [
        {"id": "aDMN", "label": "aDMN", "degree": 5}
      ],
      "edges": [
        {"source": "aDMN", "target": "V1", "weight": 0.73}
      ],
      "metadata": {"source": "abide", "method": "pearson"}
    }
  ],
  "meta": {
    "frame_count": 150,
    "node_attributes": ["label", "degree"],
    "edge_attributes": ["weight"],
    "edge_weight_min": -0.45,
    "edge_weight_max": 0.89,
    "description": "ABIDE data: path/to/file.txt (pearson correlation)"
  },
  "symmetric": true
}
```

## Error Responses

| Status | Cause |
|--------|-------|
| 400 | Invalid method, window too large for data, wavelet subject not found |
| 404 | File not found, wavelet HDF5 not found |
| 422 | Parameter validation failed (out of range) |

## Frontend Data Fetching

Uses TanStack Query in `useGraphData.ts`:

```typescript
const { frame, meta, symmetric, isLoading, error } = useAbideData({
  file_path: selectedFile,
  method: method,
  window_size: windowSize,
  step: step,
  smoothing: smoothing,
  interpolation: interpolation,
  interpolation_factor: interpolationFactor,
});
```

## Key Response Fields

- `frames[].timestamp`: Sequential frame index (0, 1, 2, ...)
- `frames[].nodes`: Always 14 RSN nodes
- `frames[].edges`: Upper triangle only if symmetric (91 edges), all pairs if not (182)
- `meta.frame_count`: Total number of frames
- `meta.edge_weight_min/max`: Actual data range for visualization scaling
- `symmetric`: Whether to render edges as bidirectional
