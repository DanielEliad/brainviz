#!/usr/bin/env python3
"""Verify that overview_data.json matches the live /abide/data API for every subject."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient

from app.main import app, DATA_DIR
from app.abide_processing import get_rsn_labels, is_symmetric, list_subject_files
from app.rsn_constants import CorrelationMethod

ASSET_PATH = Path(__file__).parent.parent.parent / "frontend" / "public" / "overview_data.json"


def main():
    client = TestClient(app)

    with open(ASSET_PATH) as f:
        asset = json.load(f)

    rsn_labels = asset["rsn_labels"]
    rsn_full_names = asset["rsn_full_names"]
    files = list_subject_files(DATA_DIR)

    assert rsn_labels == get_rsn_labels(short=True), "RSN short labels mismatch"
    assert rsn_full_names == get_rsn_labels(short=False), "RSN full names mismatch"
    print("RSN labels: OK")

    asset_by_path = {s["path"]: s for s in asset["subjects"]}
    n = len(rsn_labels)

    def expected_edge_order(symmetric):
        pairs = []
        for i in range(n):
            j_start = i + 1 if symmetric else 0
            for j in range(j_start, n):
                if i == j:
                    continue
                pairs.append((rsn_labels[i], rsn_labels[j]))
        return pairs

    methods = ["pearson", "spearman", "wavelet"]
    total_checked = 0
    errors = []

    for method in methods:
        symmetric = is_symmetric(CorrelationMethod(method))
        edge_order = expected_edge_order(symmetric)
        expected_edge_count = len(edge_order)

        method_info = asset["methods"][method]
        assert method_info["symmetric"] == symmetric, f"{method} symmetric mismatch"
        assert method_info["edge_count"] == expected_edge_count, f"{method} edge_count mismatch"

        for fi, file_info in enumerate(files):
            path = file_info["path"]

            resp = client.post("/abide/data", json={"file_path": path, "method": method})
            assert resp.status_code == 200, f"API failed for {path} {method}: {resp.status_code}"
            api_data = resp.json()

            assert len(api_data["frames"]) == 1, f"{path}/{method}: expected 1 frame"
            api_edges = api_data["frames"][0]["edges"]
            api_nodes = api_data["frames"][0]["nodes"]
            api_meta = api_data["meta"]

            asset_subject = asset_by_path[path]
            method_data = asset_subject.get(method)
            if method_data is None:
                errors.append(f"{path}/{method}: missing from asset")
                continue

            asset_weights = method_data["w"]
            asset_min = method_data["min"]
            asset_max = method_data["max"]

            # Edge count
            if len(api_edges) != len(asset_weights) or len(api_edges) != expected_edge_count:
                errors.append(
                    f"{path}/{method}: edge count API={len(api_edges)} "
                    f"asset={len(asset_weights)} expected={expected_edge_count}"
                )
                continue

            # Edge weights (within rounding of round(..., 4))
            for ei, (api_edge, asset_w) in enumerate(zip(api_edges, asset_weights)):
                diff = abs(api_edge["weight"] - asset_w)
                if diff >= 0.00015:
                    errors.append(
                        f"{path}/{method} edge {ei}: "
                        f"API={api_edge['weight']:.6f} asset={asset_w:.6f} diff={diff:.8f}"
                    )

            # Edge source/target order
            for ei, (api_edge, (exp_src, exp_tgt)) in enumerate(zip(api_edges, edge_order)):
                if api_edge["source"] != exp_src or api_edge["target"] != exp_tgt:
                    errors.append(
                        f"{path}/{method} edge {ei}: "
                        f"order ({api_edge['source']},{api_edge['target']}) "
                        f"!= ({exp_src},{exp_tgt})"
                    )

            # Node structure
            for ni, api_node in enumerate(api_nodes):
                if api_node["id"] != rsn_labels[ni]:
                    errors.append(f"{path}/{method} node {ni}: id mismatch")
                if api_node["full_name"] != rsn_full_names[ni]:
                    errors.append(f"{path}/{method} node {ni}: full_name mismatch")

            # Per-subject min/max
            if abs(api_meta["edge_weight_min"] - asset_min) >= 0.00015:
                errors.append(
                    f"{path}/{method}: min API={api_meta['edge_weight_min']} asset={asset_min}"
                )
            if abs(api_meta["edge_weight_max"] - asset_max) >= 0.00015:
                errors.append(
                    f"{path}/{method}: max API={api_meta['edge_weight_max']} asset={asset_max}"
                )

            total_checked += 1
            if (fi + 1) % 100 == 0 or fi + 1 == len(files):
                print(f"  {method}: {fi + 1}/{len(files)} verified", flush=True)

    print(f"\nTotal subject-method pairs verified: {total_checked}")
    if errors:
        print(f"\nERRORS ({len(errors)}):")
        for e in errors:
            print(f"  {e}")
        sys.exit(1)
    else:
        print(f"=== ALL {total_checked} CHECKS PASSED ===")


if __name__ == "__main__":
    main()
