---
name: typecheck
description: Run pyright type checking on backend Python code
argument-hint: [path/to/file.py]
allowed-tools: Bash
---

# Type Check

Run pyright type checker on backend Python code.

## Usage

```bash
nix-shell --run "cd backend && uv run pyright $ARGUMENTS"
```

If no path provided, checks all backend code.

## Common Checks

- Single file: `/typecheck backend/app/main.py`
- Scripts: `/typecheck backend/scripts/`
- All: `/typecheck`

## Notes

- h5py-stubs is installed for HDF5 type hints
- Use `str(path)` when passing Path objects to h5py.File()
- See typed helpers in `convert_wavelet_to_subject_files.py` for h5py patterns
