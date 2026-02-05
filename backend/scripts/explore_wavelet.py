#!/usr/bin/env python3
"""
Explore wavelet coherence MATLAB v7.3 files.

Usage:
    python explore_wavelet.py [mat_file_path]

Default: data/maps/Coherence_AUDI_Cereb.mat
"""

import sys
from pathlib import Path
import h5py
import numpy as np
import csv


def explore_mat_file(filepath: str):
    """Explore HDF5/MATLAB v7.3 file structure."""

    print(f"=== {Path(filepath).name} ===\n")

    with h5py.File(filepath, 'r') as f:
        # List top-level variables
        print("Variables:")
        for key in sorted(f.keys()):
            if key.startswith('#'):
                continue
            obj = f[key]
            if isinstance(obj, h5py.Dataset):
                dtype_str = str(obj.dtype)
                if 'complex' in dtype_str:
                    dtype_str = 'complex128'
                print(f"  {key}: {obj.shape} ({dtype_str})")

        print()

        # Detailed analysis of main data
        if 'Rsq_per_sub' in f:
            rsq = f['Rsq_per_sub']
            n_subjects, n_timepoints, n_scales = rsq.shape

            print(f"Data dimensions:")
            print(f"  Subjects: {n_subjects}")
            print(f"  Timepoints: {n_timepoints}")
            print(f"  Frequency scales: {n_scales}")
            print()

            # Value statistics
            print("Rsq_per_sub (coherence R²) statistics:")
            data = rsq[:]
            print(f"  Range: [{np.nanmin(data):.4f}, {np.nanmax(data):.4f}]")
            print(f"  Mean: {np.nanmean(data):.4f}")
            print(f"  NaN count: {np.sum(np.isnan(data))}")
            print()

            # Per-subject summary (first few)
            print("Per-subject mean coherence (first 10):")
            for i in range(min(10, n_subjects)):
                subj_mean = np.nanmean(rsq[i, :, :])
                print(f"  Subject {i}: {subj_mean:.4f}")
            print()

        # Check other key variables
        if 'coi_per_sub' in f:
            coi = f['coi_per_sub']
            print(f"coi_per_sub (cone of influence): {coi.shape}")
            print(f"  Range: [{np.min(coi[:]):.2f}, {np.max(coi[:]):.2f}]")
            print()

        if 'period_per_sub' in f:
            period = f['period_per_sub']
            print(f"period_per_sub (frequency periods): {period.shape}")
            # Periods are same for all subjects, show first subject
            p = period[:, 0]
            print(f"  Periods (first subject): [{p.min():.2f}, {p.max():.2f}]")
            print(f"  First 10 periods: {p[:10]}")
            print()

        if 'sig95_coh_per_sub' in f:
            sig = f['sig95_coh_per_sub']
            print(f"sig95_coh_per_sub (significance threshold): {sig.shape}")
            sig_data = sig[:]
            print(f"  Range: [{np.nanmin(sig_data):.4f}, {np.nanmax(sig_data):.4f}]")
            # sig95 >= 1 indicates statistically significant coherence
            sig_mask = sig_data >= 1.0
            pct_sig = 100 * np.sum(sig_mask) / sig_mask.size
            print(f"  % significant (sig95 >= 1): {pct_sig:.1f}%")
            print()


def compare_with_phenotypics(mat_filepath: str, phenotypics_path: str = None):
    """Verify subject count matches phenotypics file."""

    if phenotypics_path is None:
        # Find phenotypics relative to project root
        script_dir = Path(__file__).parent
        phenotypics_path = script_dir.parent.parent / "data" / "phenotypics.csv"

    phenotypics_path = Path(phenotypics_path)

    print(f"=== Subject Verification ===\n")

    if not phenotypics_path.exists():
        print(f"Phenotypics not found: {phenotypics_path}")
        return

    # Load phenotypics
    with open(phenotypics_path, 'r') as f:
        reader = csv.DictReader(f)
        subjects = list(reader)

    print(f"Phenotypics: {len(subjects)} subjects")
    print(f"  First: {subjects[0]['partnum']} ({subjects[0]['diagnosis']})")
    print(f"  Last: {subjects[-1]['partnum']} ({subjects[-1]['diagnosis']})")

    # Load MAT file
    with h5py.File(mat_filepath, 'r') as f:
        if 'Rsq_per_sub' in f:
            n_mat_subjects = f['Rsq_per_sub'].shape[0]
            print(f"\nMAT file: {n_mat_subjects} subjects")

            if n_mat_subjects == len(subjects):
                print("\n✓ Subject counts MATCH")
                print("  Subjects are in same order as phenotypics.csv")
            else:
                print(f"\n✗ MISMATCH: {n_mat_subjects} vs {len(subjects)}")


def list_available_pairs(maps_dir: str = None):
    """List available RSN pair files."""

    if maps_dir is None:
        script_dir = Path(__file__).parent
        maps_dir = script_dir.parent.parent / "data" / "maps"

    maps_dir = Path(maps_dir)

    print(f"=== Available RSN Pairs ===\n")
    print(f"Directory: {maps_dir}\n")

    mat_files = sorted(maps_dir.glob("Coherence_*.mat"))

    if not mat_files:
        print("No Coherence_*.mat files found")
        return

    print(f"Found {len(mat_files)} pair file(s):")
    for f in mat_files:
        # Extract RSN names from filename
        name = f.stem.replace("Coherence_", "")
        size_mb = f.stat().st_size / (1024 * 1024)
        print(f"  {name}: {size_mb:.1f} MB")

    # Expected pairs (12 RSNs, non-self = 12*11/2 = 66 pairs for symmetric)
    print(f"\nExpected pairs for 12 RSNs: 66 (symmetric)")
    print(f"Missing: {66 - len(mat_files)} pairs")


if __name__ == "__main__":
    # Default path
    default_path = Path(__file__).parent.parent.parent / "data" / "maps" / "Coherence_AUDI_Cereb.mat"

    if len(sys.argv) > 1:
        filepath = sys.argv[1]
    else:
        filepath = str(default_path)

    if not Path(filepath).exists():
        print(f"File not found: {filepath}")
        sys.exit(1)

    explore_mat_file(filepath)
    compare_with_phenotypics(filepath)
    print()
    list_available_pairs()
