---
name: wavelet-convert
description: Convert MATLAB wavelet coherence .mat files to HDF5 format for the backend
disable-model-invocation: true
argument-hint: [--dry-run]
---

# Wavelet Data Conversion

Convert MATLAB `Coherence_*.mat` files to a single HDF5 file for the backend.

## Usage

Run the conversion script with the standard paths:

```bash
nix-shell --run "cd backend && python scripts/convert_wavelet_to_subject_files.py \
  --input-path /path/to/coherence/mats \
  --output-path ../data/wavelet.h5 \
  --participants /path/to/participantStructs.mat \
  --phenotypics ../data/phenotypics.csv \
  $ARGUMENTS"
```

## Arguments

- `--dry-run` - Show what would be done without creating files (recommended first)
- Default (no args) - Perform actual conversion

## Before Running

1. Ensure input .mat files exist at `--input-path`
2. Ensure `participantStructs.mat` is available
3. Ensure `phenotypics.csv` has matching subject IDs

## Output

Creates `wavelet.h5` with structure:
- `wavelet_subjects` - Subject ID ordering
- `pairs/{RSN1}_{RSN2}/angle_maps` - Phase data per RSN pair

The script only writes to `--output-path`, all inputs are read-only.
