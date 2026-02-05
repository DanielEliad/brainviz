import argparse
from scipy.io.matlab import loadmat
from dataclasses import dataclass
from pathlib import Path
import csv
import sys

import h5py
import numpy as np


# Enum values for phase relationship
# ang_phase = (aaa>(-pi/4)&aaa<(pi/4)); % phase
# ang_lag = (aaa>(-3*pi/4)&aaa<(-pi/4)); % lead
# ang_lead = (aaa>(pi/4)&aaa<(3*pi/4));%leading
# ang_anti =(aaa>(3*pi/4)|aaa<(-3*pi/4)); %antiphase
# angle_color = (2*ang_phase +1*ang_lead -1*ang_lag  -2*ang_anti);
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


def main():
    parser = argparse.ArgumentParser(
        description="Convert wavelet Coherence_*.mat files to per-subject .npz files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--input-path",
        type=Path,
        help="Directory containing Coherence_*.mat files",
    )
    parser.add_argument(
        "--output-path",
        type=Path,
        help="Output directory for subject .npz files",
    )
    parser.add_argument(
        "--participants",
        type=Path,
        required=True,
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

    if not args.input_path.exists():
        raise FileNotFoundError(f"ERROR: Input directory not found: {args.input_path}")

    convert_all(
        input_path=args.input_path,
        output_path=args.output_path,
        participants=args.participants,
        phenotypics_path=args.phenotypics,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
