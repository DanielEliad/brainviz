---
name: brain-connectivity-domain
description: Domain knowledge for brain connectivity visualization. Use when discussing RSNs, fMRI data, correlation methods, ABIDE dataset, or when needing to understand what the data represents.
---

# Brain Connectivity Domain Knowledge

## What This App Visualizes

Dynamic functional connectivity between **14 Resting State Networks (RSNs)** - brain regions that show correlated activity during rest. The visualization shows how connectivity between these networks changes over time.

## Resting State Networks (RSNs)

RSNs are extracted from fMRI data using Independent Component Analysis (ICA). The raw data has 32 ICA components; we use 14 that correspond to known functional networks:

| Short | Full Name | Function |
|-------|-----------|----------|
| aDMN | Anterior Default Mode | Self-referential thought, mind-wandering |
| pDMN | Posterior Default Mode | Memory, internal mentation |
| V1 | Primary Visual | Basic visual processing |
| latVIS | Lateral Visual | Higher visual processing |
| occVIS | Occipital Visual | Visual association |
| AUD | Auditory | Sound processing |
| SM1 | Primary Sensorimotor | Movement, touch |
| latSM | Lateral Sensorimotor | Complex motor control |
| SAL | Salience | Attention switching, importance detection |
| lFPN | Left Frontoparietal | Executive function (left hemisphere) |
| rFPN | Right Frontoparietal | Executive function (right hemisphere) |
| DAN | Dorsal Attention | Goal-directed attention |
| CER | Cerebellum | Motor coordination, timing |
| LANG | Language | Speech, language processing |

## ABIDE Dataset

**Autism Brain Imaging Data Exchange** - multi-site fMRI dataset with:
- ASD (Autism Spectrum Disorder) subjects
- HC (Healthy Control) subjects

File format: `dr_stage1_subject{ID}.txt`
- Space-separated floats
- 32 columns (ICA components) × ~200 rows (timepoints)
- Each row = one fMRI volume (~2 second interval)

## Correlation Methods

### Pearson/Spearman (symmetric)
- Compute correlation between RSN time series within sliding windows
- Output: correlation coefficient [-1, 1]
- Positive = networks activate together
- Negative = networks activate inversely

### Wavelet (from precomputed data)
- Analyzes phase relationships between RSN pairs
- Output: leading ratio [0, 1]
- 1.0 = RSN_i always leads RSN_j
- 0.0 = RSN_i always lags RSN_j
- 0.5 = balanced/no relationship

## Data Pipeline Summary

```
ABIDE .txt file (32 cols × ~200 rows)
    ↓ filter to 14 RSN columns
RSN time series (14 cols × ~200 rows)
    ↓ sliding window correlation
Correlation matrices (n_frames × 14 × 14)
    ↓ optional smoothing/interpolation
Processed matrices
    ↓ convert to nodes + edges
GraphFrames (JSON API response)
    ↓ canvas rendering
Visualization (nodes in circle, edges by correlation)
```

## Key Concepts for Code

- **Window size**: Number of timepoints per correlation calculation (default 30)
- **Step**: Timepoints between windows (default 1)
- **Symmetric**: Pearson/Spearman correlations are symmetric (A↔B same weight)
- **Edge weight**: The correlation value; visualization uses |weight| for color/thickness
- **Frame**: One timepoint's worth of nodes + edges

## Phenotypics

`data/phenotypics.csv` maps subject IDs to diagnosis:
- `partnum`: Subject ID (integer, no leading zeros)
- `diagnosis`: "ASD" or "HC"

Subject ID in filename has leading zeros: `dr_stage1_subject0050649.txt` → ID `50649`
