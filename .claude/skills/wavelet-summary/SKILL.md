---
name: wavelet-summary
description: Display summary of wavelet HDF5 file contents
argument-hint: [path/to/wavelet.h5]
---

# Wavelet Data Summary

Display summary of a wavelet HDF5 file's contents.

## Usage

```bash
nix-shell --run "cd backend && python scripts/convert_wavelet_to_subject_files.py --summary $ARGUMENTS"
```

If no path provided, defaults to `../data/wavelet.h5`.

## Output

Shows:
- File dimensions (subjects, pairs, timepoints, scales)
- Subject ID range and samples
- RSN pairs list
- Phase values found in data
- Phenotypics validation (if phenotypics.csv is nearby)
