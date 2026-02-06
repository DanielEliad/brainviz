"""
Convert wavelet Coherence_*.mat files to HDF5 format for use by the backend.

Usage:
    python convert_wavelet_to_subject_files.py --input-path /path/to/mats --output-path /path/to/output.h5 ...
    python convert_wavelet_to_subject_files.py --summary /path/to/output.h5
"""

import argparse
import csv
from dataclasses import dataclass
from pathlib import Path

import h5py
import numpy as np
from scipy.io.matlab import loadmat

# Phase enum values (from MATLAB)
PHASE_NONE = 0
PHASE_LEAD = 1
PHASE_LAG = -1
PHASE_ANTI = -2
PHASE_IN_PHASE = 2


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
    with h5py.File(mat_path, "r") as f:
        # Check Rsq_per_sub shape - should be (n_subjects, n_timepoints, n_scales)
        if "Rsq_per_sub" in f:
            shape = f["Rsq_per_sub"].shape
            return shape[0], shape[1], shape[2]
        else:
            raise ValueError(f"No Rsq_per_sub found in {mat_path}")


def get_subject_ids_order(mat_path: Path) -> np.array:
    p = loadmat(mat_path)
    return np.array([x.item() for x in p["participantStructs"]["partnum"].squeeze()])


def load_angle_maps(mat_path: Path) -> np.ndarray:
    with h5py.File(mat_path, "r") as f:
        refs = f["#refs#"]
        am = f["angle_maps"]
        angle_color = refs[am[0, 0]]
        return angle_color[()]


def get_subject_ids_from_phenotypics(phenotypics_path: Path) -> list[int]:
    """Get ordered list of subject IDs from phenotypics.csv."""

    subject_ids = []
    with open(phenotypics_path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            subject_ids.append(int(row["partnum"]))
    return subject_ids


def get_angle_map(
    output_path: Path, network_a: str, network_b: str, subject_id: int
) -> np.ndarray:
    key = f"{network_a}_{network_b}"
    with h5py.File(output_path, "r") as f:
        subjects = f["wavelet_subjects"][:]
        idx = int(np.where(subjects == subject_id)[0][0])
        return f["pairs"][key]["angle_maps"][idx, :, :]


def convert_all(
    input_path: Path,
    output_path: Path,
    participants: Path,
    phenotypics_path: Path,
    dry_run: bool = False,
) -> None:
    """Convert all .mat files to per-subject .npz files."""

    # Find all .mat files
    mat_files = sorted(input_path.rglob("Coherence_*.mat"))
    if not mat_files:
        raise FileNotFoundError(
            f"ERROR: No Coherence_*.mat files found in {input_path}"
        )

    print(f"Found {len(mat_files)} pair file(s) in {input_path}:")
    for f in mat_files:
        print(f"  - {f.name}")
    print()

    # Get dimensions from first file
    n_subjects, n_timepoints, n_scales = get_mat_file_info(mat_files[0])
    print(f"Data dimensions (from first file):")
    print(f"  Subjects: {n_subjects}")
    print(f"  Timepoints: {n_timepoints}")
    print(f"  Scales: {n_scales}")
    print()
    if phenotypics_path.exists() is False:
        raise FileNotFoundError(f"phenotypics_path not found at {phenotypics_path}")

    subject_ids = get_subject_ids_from_phenotypics(phenotypics_path)
    if len(subject_ids) != n_subjects:
        raise ValueError(
            f"Phenotypics has {len(subject_ids)} subjects but .mat has {n_subjects}"
        )

    wavelet_subjects = get_subject_ids_order(participants)
    if len(wavelet_subjects) != n_subjects:
        raise ValueError(
            f"Participants has {len(wavelet_subjects)} subjects but .mat has {n_subjects}"
        )
    if set(wavelet_subjects) != set(subject_ids):
        raise ValueError(f"Participants has mismatching subject ids than phenotypics")

    pairs: list[RSNPair] = get_pairs(mat_files)

    # Estimate output
    bytes_per_subject = len(pairs) * n_timepoints * n_scales
    total_bytes = n_subjects * bytes_per_subject

    print(f"Output estimate:")
    print(f"  Output: {output_path}")
    print(f"  Files to create: {n_subjects}")
    print(f"  Pairs per file: {len(pairs)}")
    print(f"  Size per subject: {bytes_per_subject / 1024:.1f} KB")
    print(f"  Total size: {total_bytes / (1024*1024):.1f} MB")
    print()

    if dry_run:
        print("DRY RUN - no files created")
        return

    print(f"Converting {n_subjects} subjects...")

    with h5py.File(output_path, "w") as output_f:
        output_f.create_dataset("wavelet_subjects", data=wavelet_subjects)
        pairs_g = output_f.create_group("pairs")
        for p in pairs:
            # assume angle_maps is ordered by wavelet_subjects
            angle_maps = load_angle_maps(p.mat_file)
            if angle_maps.shape[0] != len(wavelet_subjects):
                raise ValueError(
                    f"angle maps for pair {p} shape does not match number of wavelet subjects {angle_maps.shape}"
                )
            g = pairs_g.create_group(f"{p.network_a}_{p.network_b}")
            g.create_dataset("angle_maps", data=angle_maps)

    print(f"Done! Output written to: {output_path}")
    print(f"Total files created: {n_subjects}")


def display_wavelet_data_summary(h5_path: Path, phenotypics_path: Path = None) -> None:
    """Display summary of wavelet HDF5 file contents."""
    if not h5_path.exists():
        print(f"File not found: {h5_path}")
        return

    print(f"=== Wavelet Data Summary: {h5_path.name} ===\n")

    with h5py.File(h5_path, "r") as f:
        subjects = f["wavelet_subjects"][:]
        n_subjects = len(subjects)
        pairs = list(f["pairs"].keys())
        n_pairs = len(pairs)

        # Get dimensions from first pair
        first_pair = f["pairs"][pairs[0]]["angle_maps"]
        _, n_timepoints, n_scales = first_pair.shape

        print(f"Dimensions:")
        print(f"  Subjects: {n_subjects}")
        print(f"  Pairs: {n_pairs}")
        print(f"  Timepoints: {n_timepoints}")
        print(f"  Scales: {n_scales}")
        print()

        print(f"Subject ID range: {subjects.min()} - {subjects.max()}")
        print(f"First 5 subjects: {subjects[:5].tolist()}")
        print()

        print(f"RSN Pairs ({n_pairs} total):")
        for i, pair in enumerate(sorted(pairs)[:10]):
            print(f"  {pair}")
        if n_pairs > 10:
            print(f"  ... and {n_pairs - 10} more")
        print()

        # Sample angle_maps statistics from first pair
        sample_data = first_pair[0, :, :]  # first subject
        unique_vals = np.unique(sample_data)
        print(f"Phase values in data: {unique_vals.tolist()}")
        print(f"  LEAD={PHASE_LEAD}, LAG={PHASE_LAG}, ANTI={PHASE_ANTI}, IN_PHASE={PHASE_IN_PHASE}")
        print()

    # Compare with phenotypics if available
    if phenotypics_path is None:
        phenotypics_path = h5_path.parent / "phenotypics.csv"

    if phenotypics_path.exists():
        pheno_subjects = []
        with open(phenotypics_path, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                pheno_subjects.append(int(row["partnum"]))

        print(f"Phenotypics comparison:")
        print(f"  Phenotypics subjects: {len(pheno_subjects)}")
        print(f"  Wavelet subjects: {n_subjects}")
        overlap = len(set(subjects) & set(pheno_subjects))
        print(f"  Overlap: {overlap}")
    else:
        print(f"Phenotypics not found at {phenotypics_path}")


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
