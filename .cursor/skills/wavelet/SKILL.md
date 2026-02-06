---
name: wavelet-coherence
description: Work with wavelet coherence data for brain connectivity analysis. Use when dealing with wavelet.h5 files, the conversion script, wavelet_processing.py, or questions about phase relationships between RSN networks.
---

# Wavelet Coherence Data

Wavelet coherence measures phase relationships between RSN pairs over time. Unlike Pearson/Spearman correlation (symmetric, real-time), wavelet data is asymmetric and pre-computed.

## Files

| File | Purpose |
|------|---------|
| `data/wavelet.h5` | Runtime data (HDF5) |
| `backend/app/wavelet_processing.py` | Loads HDF5, computes leading ratios |
| `backend/scripts/convert_wavelet_to_subject_files.py` | Converts MATLAB → HDF5 |

## HDF5 Structure

```
wavelet.h5
├── wavelet_subjects        # int[n_subjects] - subject IDs
└── pairs/
    └── {RSN_A}_{RSN_B}/
        └── angle_maps      # int[n_subjects, n_timepoints, n_scales]
```

## Phase Values

```python
PHASE_LEAD = 1      # A leads B
PHASE_LAG = -1      # A lags B
PHASE_IN_PHASE = 2
PHASE_ANTI = -2
PHASE_NONE = 0
```

## Leading Ratio Computation

For each frame window, count LEAD vs LAG occurrences across all scales:

```python
n_lead = np.sum(window == PHASE_LEAD)
n_lag = np.sum(window == PHASE_LAG)
ratio = n_lead / (n_lead + n_lag) if (n_lead + n_lag) > 0 else 0.5

matrix[i, j] = ratio        # A→B edge
matrix[j, i] = 1.0 - ratio  # B→A edge (complement)
```

- `1.0` = A always leads B
- `0.5` = neutral
- `0.0` = A always lags B

## Conversion Script

Safe to run on remote servers - only reads from input, only writes to output.

```bash
# Dry run (no writes)
python convert_wavelet_to_subject_files.py \
  --input-path /path/to/Coherence_*.mat \
  --output-path /path/to/wavelet.h5 \
  --participants /path/to/participants.mat \
  --phenotypics /path/to/phenotypics.csv \
  --dry-run

# View existing HDF5
python convert_wavelet_to_subject_files.py --summary /path/to/wavelet.h5
```

## Key Differences from Correlation

| | Pearson/Spearman | Wavelet |
|-|------------------|---------|
| Matrix | Symmetric | Asymmetric |
| Range | [-1, 1] | [0, 1] |
| Edges | 91 | 182 |
| Source | Real-time from .txt | Pre-computed .h5 |
