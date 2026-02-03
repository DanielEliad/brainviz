"""
Tests for ABIDE data endpoints.
"""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def file_path(test_client: TestClient) -> str:
    """Get the first available file path from the test fixture."""
    response = test_client.get("/abide/files")
    files = response.json()["files"]
    return files[0]["path"]


# --- GET /abide/files ---

def test_list_files_returns_expected_structure(test_client: TestClient):
    response = test_client.get("/abide/files")

    assert response.status_code == 200
    data = response.json()
    assert "files" in data
    assert "data_dir" in data
    assert isinstance(data["files"], list)


def test_list_files_finds_all_fixture_files(test_client: TestClient):
    response = test_client.get("/abide/files")
    files = response.json()["files"]

    assert len(files) == 4

    for file_info in files:
        assert "path" in file_info
        assert "subject_id" in file_info
        assert "site" in file_info
        assert "version" in file_info
        assert file_info["diagnosis"] in ("ASD", "HC")


def test_list_files_extracts_site_and_version(test_client: TestClient):
    response = test_client.get("/abide/files")
    files = response.json()["files"]

    nyu_files = [f for f in files if f["site"] == "NYU"]
    assert len(nyu_files) == 2
    assert all(f["version"] == "ABIDE_I" for f in nyu_files)

    cmu_files = [f for f in files if f["site"] == "CMU"]
    assert len(cmu_files) == 1
    assert cmu_files[0]["version"] == "ABIDE_I"


def test_list_files_returns_empty_when_no_files(test_client_empty_data: TestClient):
    response = test_client_empty_data.get("/abide/files")

    assert response.status_code == 200
    assert response.json()["files"] == []


# --- GET /abide/methods ---

def test_list_methods_returns_list(test_client: TestClient):
    response = test_client.get("/abide/methods")

    assert response.status_code == 200
    data = response.json()
    assert "methods" in data
    assert isinstance(data["methods"], list)


def test_list_methods_includes_pearson_and_spearman(test_client: TestClient):
    response = test_client.get("/abide/methods")
    methods = response.json()["methods"]

    method_ids = [m["id"] for m in methods]
    assert "pearson" in method_ids
    assert "spearman" in method_ids


def test_list_methods_have_required_fields(test_client: TestClient):
    response = test_client.get("/abide/methods")
    methods = response.json()["methods"]

    for method in methods:
        assert "id" in method
        assert "name" in method
        assert "params" in method


def test_list_methods_params_have_required_fields(test_client: TestClient):
    response = test_client.get("/abide/methods")
    methods = response.json()["methods"]

    for method in methods:
        for param in method["params"]:
            assert "name" in param
            assert "type" in param
            assert "min" in param
            assert "max" in param


# --- GET /abide/data ---

def test_get_data_returns_frames_and_meta(test_client: TestClient, file_path: str):
    response = test_client.get(
        "/abide/data",
        params={"file_path": file_path, "method": "pearson"}
    )

    assert response.status_code == 200
    data = response.json()
    assert "frames" in data
    assert "meta" in data


def test_get_data_frames_have_correct_structure(test_client: TestClient, file_path: str):
    response = test_client.get(
        "/abide/data",
        params={"file_path": file_path, "method": "pearson", "window_size": 30, "step": 5}
    )
    frames = response.json()["frames"]

    assert len(frames) > 0
    frame = frames[0]
    assert "timestamp" in frame
    assert "nodes" in frame
    assert "edges" in frame
    assert "metadata" in frame


def test_get_data_returns_14_rsn_nodes(test_client: TestClient, file_path: str):
    response = test_client.get(
        "/abide/data",
        params={"file_path": file_path, "method": "pearson"}
    )
    nodes = response.json()["frames"][0]["nodes"]

    assert len(nodes) == 14
    for node in nodes:
        assert "id" in node
        assert "label" in node
        assert "degree" in node


def test_get_data_both_correlation_methods_work(test_client: TestClient, file_path: str):
    for method in ["pearson", "spearman"]:
        response = test_client.get(
            "/abide/data",
            params={"file_path": file_path, "method": method, "window_size": 20}
        )
        assert response.status_code == 200, f"Method {method} failed"


def test_get_data_smaller_window_produces_more_frames(test_client: TestClient, file_path: str):
    response_small = test_client.get(
        "/abide/data",
        params={"file_path": file_path, "method": "pearson", "window_size": 20, "step": 1}
    )
    response_large = test_client.get(
        "/abide/data",
        params={"file_path": file_path, "method": "pearson", "window_size": 50, "step": 1}
    )

    frames_small = len(response_small.json()["frames"])
    frames_large = len(response_large.json()["frames"])
    assert frames_small > frames_large


def test_get_data_smaller_step_produces_more_frames(test_client: TestClient, file_path: str):
    response_step1 = test_client.get(
        "/abide/data",
        params={"file_path": file_path, "method": "pearson", "window_size": 30, "step": 1}
    )
    response_step5 = test_client.get(
        "/abide/data",
        params={"file_path": file_path, "method": "pearson", "window_size": 30, "step": 5}
    )

    frames_step1 = len(response_step1.json()["frames"])
    frames_step5 = len(response_step5.json()["frames"])
    assert frames_step1 > frames_step5


def test_get_data_meta_has_correct_structure(test_client: TestClient, file_path: str):
    response = test_client.get(
        "/abide/data",
        params={"file_path": file_path, "method": "pearson"}
    )
    meta = response.json()["meta"]

    assert "available_timestamps" in meta
    assert "node_attributes" in meta
    assert "edge_attributes" in meta
    assert "edge_weight_min" in meta
    assert "edge_weight_max" in meta
    assert "description" in meta
    assert -1.0 <= meta["edge_weight_min"] <= meta["edge_weight_max"] <= 1.0


def test_get_data_all_smoothing_methods_work(test_client: TestClient, file_path: str):
    for smoothing in ["none", "moving_average", "exponential", "gaussian"]:
        response = test_client.get(
            "/abide/data",
            params={"file_path": file_path, "method": "pearson", "smoothing": smoothing}
        )
        assert response.status_code == 200, f"Smoothing {smoothing} failed"


def test_get_data_interpolation_increases_frame_count(test_client: TestClient, file_path: str):
    response_none = test_client.get(
        "/abide/data",
        params={"file_path": file_path, "method": "pearson", "interpolation": "none"}
    )
    response_interp = test_client.get(
        "/abide/data",
        params={
            "file_path": file_path,
            "method": "pearson",
            "interpolation": "linear",
            "interpolation_factor": 2
        }
    )

    assert response_none.status_code == 200
    assert response_interp.status_code == 200
    assert len(response_interp.json()["frames"]) > len(response_none.json()["frames"])


def test_get_data_all_interpolation_methods_work(test_client: TestClient, file_path: str):
    methods = ["none", "linear", "cubic_spline", "b_spline", "univariate_spline"]

    for interp in methods:
        params = {"file_path": file_path, "method": "pearson", "window_size": 30}
        if interp != "none":
            params["interpolation"] = interp
            params["interpolation_factor"] = 2

        response = test_client.get("/abide/data", params=params)
        assert response.status_code == 200, f"Interpolation {interp} failed"


def test_get_data_full_processing_pipeline(test_client: TestClient, file_path: str):
    response = test_client.get(
        "/abide/data",
        params={
            "file_path": file_path,
            "method": "pearson",
            "window_size": 30,
            "step": 5,
            "interpolation": "linear",
            "interpolation_factor": 2,
            "smoothing": "gaussian",
        }
    )

    assert response.status_code == 200
    data = response.json()
    assert "frames" in data
    assert "meta" in data
    assert "symmetric" in data
    assert len(data["frames"]) > 0
    assert len(data["frames"][0]["nodes"]) == 14
    assert data["symmetric"] is True


# --- GET /abide/data errors ---

def test_get_data_404_for_nonexistent_file(test_client: TestClient):
    response = test_client.get(
        "/abide/data",
        params={"file_path": "nonexistent/file.txt", "method": "pearson"}
    )
    assert response.status_code == 404


def test_get_data_400_for_invalid_method(test_client: TestClient, file_path: str):
    response = test_client.get(
        "/abide/data",
        params={"file_path": file_path, "method": "invalid_method"}
    )
    assert response.status_code == 400


def test_get_data_422_for_window_size_out_of_range(test_client: TestClient, file_path: str):
    response = test_client.get(
        "/abide/data",
        params={"file_path": file_path, "method": "pearson", "window_size": 150}
    )
    assert response.status_code == 422


def test_get_data_422_when_method_missing(test_client: TestClient, file_path: str):
    response = test_client.get(
        "/abide/data",
        params={"file_path": file_path}
    )
    assert response.status_code == 422
