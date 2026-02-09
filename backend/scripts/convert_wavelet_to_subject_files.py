import argparse
import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import h5py
import numpy as np
from scipy.io.matlab import loadmat

# Phase enum values (from MATLAB)
PHASE_NONE = 0
PHASE_LEAD = 1
PHASE_LAG = -1
PHASE_ANTI = -2
PHASE_IN_PHASE = 2


# --- Typed h5py helpers ---
# h5py's dynamic API doesn't have good type stubs. These helpers provide
# type-safe access to our specific data structures.


def _h5_dataset(group: h5py.File | h5py.Group, key: str) -> h5py.Dataset:
    item = group[key]
    if not isinstance(item, h5py.Dataset):
        raise TypeError(f"Expected Dataset at '{key}', got {type(item).__name__}")
    return item


def _h5_group(group: h5py.File | h5py.Group, key: str) -> h5py.Group:
    item = group[key]
    if not isinstance(item, h5py.Group):
        raise TypeError(f"Expected Group at '{key}', got {type(item).__name__}")
    return item


def _h5_read_array(group: h5py.File | h5py.Group, key: str) -> np.ndarray:
    return np.asarray(_h5_dataset(group, key))


def _h5_shape(group: h5py.File | h5py.Group, key: str) -> tuple[int, ...]:
    shape: tuple[int, ...] = _h5_dataset(group, key).shape
    return shape


def _mat_h5_deref(f: h5py.File, ref: Any) -> np.ndarray:
    refs = _h5_group(f, "#refs#")
    return np.asarray(refs[ref])


def parse_pair_name(filename: str) -> tuple[str, str]:
    pair_part = filename.replace("Coherence_", "")
    parts = pair_part.split("_")
    if len(parts) != 2:
        raise ValueError(f"Invalid filename: {filename}")
    return parts[0], parts[1]


@dataclass(frozen=True)
class RSNPair:
    network_a: str
    network_b: str
    mat_file: Path


def get_pairs(mat_files: list[Path]) -> list[RSNPair]:
    pairs = []
    for f in mat_files:
        rsn1, rsn2 = parse_pair_name(f.stem)
        pairs.append(RSNPair(network_a=rsn1, network_b=rsn2, mat_file=f))
    return pairs


def get_mat_file_info(mat_path: Path) -> tuple[int, int, int]:
    with h5py.File(str(mat_path), "r") as f:
        if "Rsq_per_sub" not in f:
            raise ValueError(f"No Rsq_per_sub found in {mat_path}")
        shape = _h5_shape(f, "Rsq_per_sub")
        return shape[0], shape[1], shape[2]


def get_subject_ids_order(mat_path: Path) -> np.ndarray:
    p = loadmat(str(mat_path))
    return np.array([x.item() for x in p["participantStructs"]["partnum"].squeeze()])


def load_angle_maps(mat_path: Path) -> np.ndarray:
    with h5py.File(str(mat_path), "r") as f:
        # MATLAB stores references in angle_maps that point to data in #refs#
        am_dataset = _h5_dataset(f, "angle_maps")
        ref = am_dataset[0, 0]
        return _mat_h5_deref(f, ref)


def load_period_per_sub(mat_path: Path) -> np.ndarray:
    with h5py.File(str(mat_path), "r") as f:
        return np.asarray(_h5_dataset(f, "period_per_sub"))


def get_subject_ids_from_phenotypics(phenotypics_path: Path) -> list[int]:

    subject_ids = []
    with open(phenotypics_path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            subject_ids.append(int(row["partnum"]))
    return subject_ids


def convert_all(
    input_path: Path,
    output_path: Path,
    participants: Path,
    phenotypics_path: Path,
    dry_run: bool = False,
) -> None:

    print("=" * 60)
    print("STEP 1: Scanning input directory for .mat files")
    print("=" * 60)
    print(f"  Input path: {input_path}")

    mat_files = sorted(input_path.glob("*/Coherence_*.mat"))
    if not mat_files:
        raise FileNotFoundError(
            f"ERROR: No Coherence_*.mat files found in {input_path}"
        )

    print(f"  Found {len(mat_files)} RSN pair file(s):")
    for f in mat_files:
        print(f"    - {f.name}")
    print()

    print("=" * 60)
    print("STEP 2: Reading data dimensions from first .mat file")
    print("=" * 60)
    print(f"  Reading: {mat_files[0].name}")

    n_subjects, n_timepoints, n_scales = get_mat_file_info(mat_files[0])
    print(f"  Subjects: {n_subjects}")
    print(f"  Timepoints: {n_timepoints}")
    print(f"  Scales: {n_scales}")
    print()

    print("=" * 60)
    print("STEP 3: Validating phenotypics.csv")
    print("=" * 60)
    print(f"  Reading: {phenotypics_path}")

    if not phenotypics_path.exists():
        raise FileNotFoundError(f"phenotypics_path not found at {phenotypics_path}")

    subject_ids = get_subject_ids_from_phenotypics(phenotypics_path)
    print(f"  Found {len(subject_ids)} subjects in phenotypics")

    if len(subject_ids) != n_subjects:
        raise ValueError(
            f"Phenotypics has {len(subject_ids)} subjects but .mat has {n_subjects}"
        )
    print("  ✓ Subject count matches .mat data")
    print()

    print("=" * 60)
    print("STEP 4: Reading subject order from participants.mat")
    print("=" * 60)
    print(f"  Reading: {participants}")

    wavelet_subjects = get_subject_ids_order(participants)
    print(f"  Found {len(wavelet_subjects)} subjects in participants")

    if len(wavelet_subjects) != n_subjects:
        raise ValueError(
            f"Participants has {len(wavelet_subjects)} subjects but .mat has {n_subjects}"
        )
    print("  ✓ Subject count matches .mat data")

    if set(wavelet_subjects) != set(subject_ids):
        raise ValueError("Participants has mismatching subject ids than phenotypics")
    print("  ✓ Subject IDs match phenotypics")
    print()

    pairs: list[RSNPair] = get_pairs(mat_files)

    print("=" * 60)
    print("STEP 5: Output plan")
    print("=" * 60)
    print(f"  Output file: {output_path}")
    print(f"  RSN pairs: {len(pairs)}")
    print(f"  Subjects: {n_subjects}")
    print(f"  Data per pair: {n_subjects} × {n_timepoints} × {n_scales} int8 values")

    bytes_per_pair = n_subjects * n_timepoints * n_scales
    total_bytes = len(pairs) * bytes_per_pair
    print(f"  Estimated size: {total_bytes / (1024*1024):.1f} MB")
    print()

    if dry_run:
        print("DRY RUN - no files will be written")
        print("Remove --dry-run to perform actual conversion")
        return

    print("=" * 60)
    print("STEP 6: Writing HDF5 file")
    print("=" * 60)
    print(f"  Creating: {output_path}")

    with h5py.File(str(output_path), "w") as output_f:
        print(f"  Writing wavelet_subjects dataset ({len(wavelet_subjects)} IDs)")
        output_f.create_dataset("wavelet_subjects", data=wavelet_subjects)
        output_f.create_dataset(
            "period_per_subject", data=load_period_per_sub(pairs[0].mat_file)
        )

        pairs_g = output_f.create_group("pairs")
        print(f"  Writing {len(pairs)} RSN pair datasets:")

        for i, p in enumerate(pairs):
            pair_name = f"{p.network_a}_{p.network_b}"
            print(f"    [{i+1:2d}/{len(pairs)}] {pair_name} <- {p.mat_file.name}")

            angle_maps = load_angle_maps(p.mat_file)
            if angle_maps.shape[0] != len(wavelet_subjects):
                raise ValueError(
                    f"angle_maps shape {angle_maps.shape} doesn't match "
                    f"{len(wavelet_subjects)} subjects for pair {pair_name}"
                )

            g = pairs_g.create_group(pair_name)
            g.create_dataset("angle_maps", data=angle_maps)

    # Verify output
    actual_size = output_path.stat().st_size
    print()
    print("=" * 60)
    print("COMPLETE")
    print("=" * 60)
    print(f"  Output: {output_path}")
    print(f"  Size: {actual_size / (1024*1024):.1f} MB")
    print(f"  Pairs: {len(pairs)}")
    print(f"  Subjects: {n_subjects}")


def display_wavelet_data_summary(
    h5_path: Path, phenotypics_path: Path | None = None
) -> None:
    if not h5_path.exists():
        print(f"ERROR: File not found: {h5_path}")
        return

    file_size = h5_path.stat().st_size

    print("=" * 60)
    print("WAVELET DATA SUMMARY")
    print("=" * 60)
    print(f"  File: {h5_path}")
    print(f"  Size: {file_size / (1024*1024):.1f} MB")
    print()

    with h5py.File(str(h5_path), "r") as f:
        subjects = _h5_read_array(f, "wavelet_subjects")
        n_subjects = len(subjects)

        pairs_group = _h5_group(f, "pairs")
        pairs = list(pairs_group.keys())
        n_pairs = len(pairs)

        # Get dimensions from first pair
        first_pair_group = _h5_group(pairs_group, pairs[0])
        first_pair_data = _h5_dataset(first_pair_group, "angle_maps")
        _, n_timepoints, n_scales = first_pair_data.shape

        print("Dimensions:")
        print(f"  Subjects: {n_subjects}")
        print(f"  RSN pairs: {n_pairs}")
        print(f"  Timepoints per subject: {n_timepoints}")
        print(f"  Wavelet scales: {n_scales}")
        print()

        print("Subjects:")
        print(f"  ID range: {subjects.min()} - {subjects.max()}")
        print(f"  First 5: {subjects[:5].tolist()}")
        print(f"  Last 5: {subjects[-5:].tolist()}")
        print()

        print(f"RSN Pairs ({n_pairs} total):")
        sorted_pairs = sorted(pairs)
        for pair in sorted_pairs[:10]:
            print(f"    {pair}")
        if n_pairs > 10:
            print(f"    ... and {n_pairs - 10} more")
        print()

        # Sample angle_maps statistics from first pair
        sample_data = np.asarray(first_pair_data[0, :, :])  # first subject
        unique_vals = np.unique(sample_data)
        print("Phase values found in data:")
        for val in sorted(unique_vals):
            label = {
                PHASE_NONE: "NONE",
                PHASE_LEAD: "LEAD",
                PHASE_LAG: "LAG",
                PHASE_ANTI: "ANTI",
                PHASE_IN_PHASE: "IN_PHASE",
            }.get(val, "UNKNOWN")
            print(f"    {val:2d} = {label}")
        print()

    # Compare with phenotypics if available
    if phenotypics_path is None:
        phenotypics_path = h5_path.parent / "phenotypics.csv"

    print("Phenotypics validation:")
    if phenotypics_path.exists():
        pheno_subjects = []
        with open(phenotypics_path, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                pheno_subjects.append(int(row["partnum"]))

        print(f"  Phenotypics file: {phenotypics_path}")
        print(f"  Phenotypics subjects: {len(pheno_subjects)}")
        print(f"  Wavelet subjects: {n_subjects}")

        overlap = set(subjects) & set(pheno_subjects)
        only_wavelet = set(subjects) - set(pheno_subjects)
        only_pheno = set(pheno_subjects) - set(subjects)

        print(f"  Overlap: {len(overlap)}")
        if only_wavelet:
            print(f"  Only in wavelet: {len(only_wavelet)} (missing from phenotypics)")
        if only_pheno:
            print(f"  Only in phenotypics: {len(only_pheno)} (missing from wavelet)")
        if len(overlap) == n_subjects == len(pheno_subjects):
            print("  ✓ All subjects match")
    else:
        print(f"  Not found: {phenotypics_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Convert wavelet Coherence_*.mat files to HDF5 or display summary",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--summary",
        type=Path,
        metavar="H5_FILE",
        help="Display summary of existing HDF5 file",
    )
    parser.add_argument(
        "--input-path",
        type=Path,
        help="Directory containing Coherence_*.mat files",
    )
    parser.add_argument(
        "--output-path",
        type=Path,
        help="Output HDF5 file path",
    )
    parser.add_argument(
        "--participants",
        type=Path,
        help="Participant matlab file",
    )
    parser.add_argument(
        "--phenotypics",
        type=Path,
        help="Path to phenotypics.csv",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without creating files",
    )

    args = parser.parse_args()

    if args.summary:
        display_wavelet_data_summary(args.summary, args.phenotypics)
        return

    if not args.input_path:
        parser.error("--input-path required for conversion")
    if not args.output_path:
        parser.error("--output-path required for conversion")
    if not args.participants:
        parser.error("--participants required for conversion")
    if not args.input_path.exists():
        raise FileNotFoundError(f"Input directory not found: {args.input_path}")

    convert_all(
        input_path=args.input_path,
        output_path=args.output_path,
        participants=args.participants,
        phenotypics_path=args.phenotypics,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
