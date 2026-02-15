#!/usr/bin/env python3
"""Generate the static overview_data.json asset for the frontend overview tab."""

import json
import sys
from pathlib import Path

import numpy as np

# Add backend to path so we can import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.abide_processing import (
    compute_correlation_matrices,
    get_rsn_labels,
    is_symmetric,
    list_subject_files,
)
from app.rsn_constants import CorrelationMethod, CorrelationParams

DATA_DIR = Path(__file__).parent.parent.parent / "data" / "ABIDE"
OUTPUT_PATH = Path(__file__).parent.parent.parent / "frontend" / "public" / "overview_data.json"

METHODS = [CorrelationMethod.PEARSON, CorrelationMethod.SPEARMAN, CorrelationMethod.WAVELET]


def extract_weights(matrix: np.ndarray, symmetric: bool) -> list[float]:
    n = matrix.shape[0]
    weights = []
    for i in range(n):
        j_start = i + 1 if symmetric else 0
        for j in range(j_start, n):
            if i == j:
                continue
            weights.append(round(float(matrix[i, j]), 4))
    return weights


def main():
    print("Listing subject files...", file=sys.stderr)
    files = list_subject_files(DATA_DIR)
    print(f"Found {len(files)} subjects", file=sys.stderr)

    rsn_labels = get_rsn_labels(short=True)
    rsn_full_names = get_rsn_labels(short=False)

    methods_info: dict[str, dict] = {}
    # subject_path -> { method_name -> { w, min, max } }
    subject_method_data: dict[str, dict[str, dict]] = {}

    for method in METHODS:
        method_name = method.value
        symmetric = is_symmetric(method)
        edge_count = 91 if symmetric else 182
        params = CorrelationParams(method=method)

        global_min = float("inf")
        global_max = float("-inf")
        success_count = 0
        error_count = 0

        print(f"\nProcessing {method_name}...", file=sys.stderr)

        for idx, file_info in enumerate(files):
            file_path = DATA_DIR / file_info["path"]
            path_key = file_info["path"]

            if path_key not in subject_method_data:
                subject_method_data[path_key] = {}

            try:
                matrices = compute_correlation_matrices(file_path, params)
                if len(matrices) != 1:
                    raise RuntimeError(f"Expected 1 matrix, got {len(matrices)}")

                matrix = matrices[0]
                weights = extract_weights(matrix, symmetric)
                w_min = min(weights)
                w_max = max(weights)

                subject_method_data[path_key][method_name] = {
                    "w": weights,
                    "min": round(w_min, 4),
                    "max": round(w_max, 4),
                }

                global_min = min(global_min, w_min)
                global_max = max(global_max, w_max)
                success_count += 1
            except Exception as e:
                error_count += 1
                print(f"  Error for {path_key}: {e}", file=sys.stderr)

            if (idx + 1) % 100 == 0 or idx + 1 == len(files):
                print(f"  {method_name}: {idx + 1}/{len(files)} subjects processed", file=sys.stderr)

        methods_info[method_name] = {
            "symmetric": symmetric,
            "edge_count": edge_count,
            "global_min": round(global_min, 4),
            "global_max": round(global_max, 4),
        }

        print(f"  {method_name}: {success_count} ok, {error_count} errors, range [{global_min:.4f}, {global_max:.4f}]", file=sys.stderr)

    subjects = []
    for file_info in files:
        path_key = file_info["path"]
        entry: dict = {
            "path": file_info["path"],
            "subject_id": file_info["subject_id"],
            "site": file_info["site"],
            "version": file_info["version"],
            "diagnosis": file_info["diagnosis"],
        }
        method_data = subject_method_data.get(path_key, {})
        for method_name, data in method_data.items():
            entry[method_name] = data
        subjects.append(entry)

    asset = {
        "version": 1,
        "rsn_labels": rsn_labels,
        "rsn_full_names": rsn_full_names,
        "methods": methods_info,
        "subjects": subjects,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(asset, f, separators=(",", ":"))

    size_mb = OUTPUT_PATH.stat().st_size / (1024 * 1024)
    print(f"\nWrote {OUTPUT_PATH} ({size_mb:.1f} MB)", file=sys.stderr)
    print(f"Subjects: {len(subjects)}, Methods: {list(methods_info.keys())}", file=sys.stderr)


if __name__ == "__main__":
    main()
