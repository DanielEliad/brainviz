import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def file_path(test_client: TestClient) -> str:
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


# --- POST /abide/data ---

def test_get_data_returns_frames_and_meta(test_client: TestClient, file_path: str):
    response = test_client.post(
        "/abide/data",
        json={"file_path": file_path, "method": "pearson"}
    )

    assert response.status_code == 200
    data = response.json()
    assert "frames" in data
    assert "meta" in data


def test_get_data_frames_have_correct_structure(test_client: TestClient, file_path: str):
    response = test_client.post(
        "/abide/data",
        json={"file_path": file_path, "method": "pearson", "window_size": 30, "step": 5}
    )
    frames = response.json()["frames"]

    assert len(frames) > 0
    frame = frames[0]
    assert "timestamp" in frame
    assert "nodes" in frame
    assert "edges" in frame
    assert "metadata" in frame


def test_get_data_returns_14_rsn_nodes(test_client: TestClient, file_path: str):
    response = test_client.post(
        "/abide/data",
        json={"file_path": file_path, "method": "pearson"}
    )
    nodes = response.json()["frames"][0]["nodes"]

    assert len(nodes) == 14
    for node in nodes:
        assert "id" in node
        assert "label" in node
        assert "degree" in node


def test_get_data_both_correlation_methods_work(test_client: TestClient, file_path: str):
    for method in ["pearson", "spearman"]:
        response = test_client.post(
            "/abide/data",
            json={"file_path": file_path, "method": method, "window_size": 20}
        )
        assert response.status_code == 200, f"Method {method} failed"


def test_get_data_smaller_window_produces_more_frames(test_client: TestClient, file_path: str):
    response_small = test_client.post(
        "/abide/data",
        json={"file_path": file_path, "method": "pearson", "window_size": 20, "step": 1}
    )
    response_large = test_client.post(
        "/abide/data",
        json={"file_path": file_path, "method": "pearson", "window_size": 50, "step": 1}
    )

    frames_small = len(response_small.json()["frames"])
    frames_large = len(response_large.json()["frames"])
    assert frames_small > frames_large


def test_get_data_smaller_step_produces_more_frames(test_client: TestClient, file_path: str):
    response_step1 = test_client.post(
        "/abide/data",
        json={"file_path": file_path, "method": "pearson", "window_size": 30, "step": 1}
    )
    response_step5 = test_client.post(
        "/abide/data",
        json={"file_path": file_path, "method": "pearson", "window_size": 30, "step": 5}
    )

    frames_step1 = len(response_step1.json()["frames"])
    frames_step5 = len(response_step5.json()["frames"])
    assert frames_step1 > frames_step5


def test_get_data_meta_has_correct_structure(test_client: TestClient, file_path: str):
    response = test_client.post(
        "/abide/data",
        json={"file_path": file_path, "method": "pearson"}
    )
    meta = response.json()["meta"]

    assert "frame_count" in meta
    assert meta["frame_count"] > 0
    assert "node_attributes" in meta
    assert "edge_attributes" in meta
    assert "edge_weight_min" in meta
    assert "edge_weight_max" in meta
    assert "description" in meta
    assert -1.0 <= meta["edge_weight_min"] <= meta["edge_weight_max"] <= 1.0


def test_get_data_all_smoothing_methods_work(test_client: TestClient, file_path: str):
    # Test without smoothing (None)
    response = test_client.post(
        "/abide/data",
        json={"file_path": file_path, "method": "pearson"}
    )
    assert response.status_code == 200, "No smoothing failed"

    # Test each smoothing algorithm
    for algo in ["moving_average", "exponential", "gaussian"]:
        response = test_client.post(
            "/abide/data",
            json={
                "file_path": file_path,
                "method": "pearson",
                "smoothing": {"algorithm": algo}
            }
        )
        assert response.status_code == 200, f"Smoothing {algo} failed"


def test_get_data_interpolation_increases_frame_count(test_client: TestClient, file_path: str):
    response_none = test_client.post(
        "/abide/data",
        json={"file_path": file_path, "method": "pearson"}
    )
    response_interp = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "interpolation": {"algorithm": "linear", "factor": 2}
        }
    )

    assert response_none.status_code == 200
    assert response_interp.status_code == 200
    assert len(response_interp.json()["frames"]) > len(response_none.json()["frames"])


def test_get_data_all_interpolation_methods_work(test_client: TestClient, file_path: str):
    # Test without interpolation (None)
    response = test_client.post(
        "/abide/data",
        json={"file_path": file_path, "method": "pearson", "window_size": 30}
    )
    assert response.status_code == 200, "No interpolation failed"

    # Test each interpolation algorithm
    for algo in ["linear", "cubic_spline", "b_spline", "univariate_spline"]:
        response = test_client.post(
            "/abide/data",
            json={
                "file_path": file_path,
                "method": "pearson",
                "window_size": 30,
                "interpolation": {"algorithm": algo, "factor": 2}
            }
        )
        assert response.status_code == 200, f"Interpolation {algo} failed"


def test_get_data_full_processing_pipeline(test_client: TestClient, file_path: str):
    response = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "window_size": 30,
            "step": 5,
            "interpolation": {"algorithm": "linear", "factor": 2},
            "smoothing": {"algorithm": "gaussian"},
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


# --- POST /abide/data errors ---

def test_get_data_404_for_nonexistent_file(test_client: TestClient):
    response = test_client.post(
        "/abide/data",
        json={"file_path": "nonexistent/file.txt", "method": "pearson"}
    )
    assert response.status_code == 404


def test_get_data_400_for_invalid_method(test_client: TestClient, file_path: str):
    response = test_client.post(
        "/abide/data",
        json={"file_path": file_path, "method": "invalid_method"}
    )
    assert response.status_code == 400


def test_get_data_422_for_window_size_out_of_range(test_client: TestClient, file_path: str):
    response = test_client.post(
        "/abide/data",
        json={"file_path": file_path, "method": "pearson", "window_size": 150}
    )
    assert response.status_code == 422


def test_get_data_422_when_method_missing(test_client: TestClient, file_path: str):
    response = test_client.post(
        "/abide/data",
        json={"file_path": file_path}
    )
    assert response.status_code == 422


def test_get_data_422_for_invalid_smoothing(test_client: TestClient, file_path: str):
    response = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "smoothing": {"algorithm": "invalid_algo"}
        }
    )
    assert response.status_code == 422


def test_get_data_422_for_invalid_interpolation(test_client: TestClient, file_path: str):
    response = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "interpolation": {"algorithm": "invalid_algo"}
        }
    )
    assert response.status_code == 422


def test_get_data_422_for_interpolation_factor_out_of_range(test_client: TestClient, file_path: str):
    response = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "interpolation": {"algorithm": "linear", "factor": 20}
        }
    )
    assert response.status_code == 422


def test_get_data_smoothing_params_are_configurable(test_client: TestClient, file_path: str):
    response = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "smoothing": {"algorithm": "moving_average", "window": 5}
        }
    )
    assert response.status_code == 200

    response = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "smoothing": {"algorithm": "exponential", "alpha": 0.3}
        }
    )
    assert response.status_code == 200

    response = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "smoothing": {"algorithm": "gaussian", "sigma": 2.0}
        }
    )
    assert response.status_code == 200


def test_get_data_422_for_smoothing_params_out_of_range(test_client: TestClient, file_path: str):
    response = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "smoothing": {"algorithm": "moving_average", "window": 100}
        }
    )
    assert response.status_code == 422

    response = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "smoothing": {"algorithm": "exponential", "alpha": 2.0}
        }
    )
    assert response.status_code == 422


# --- Smoothing behavior tests ---

def test_smoothing_changes_edge_weights(test_client: TestClient, file_path: str):
    no_smooth = test_client.post(
        "/abide/data",
        json={"file_path": file_path, "method": "pearson"}
    ).json()

    with_smooth = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "smoothing": {"algorithm": "gaussian", "sigma": 2.0}
        }
    ).json()

    # Same number of frames
    assert len(no_smooth["frames"]) == len(with_smooth["frames"])

    # But edge weights should differ (smoothing averages neighboring values)
    no_smooth_weights = [e["weight"] for e in no_smooth["frames"][1]["edges"]]
    smooth_weights = [e["weight"] for e in with_smooth["frames"][1]["edges"]]
    assert no_smooth_weights != smooth_weights


def test_different_smoothing_params_produce_different_results(test_client: TestClient, file_path: str):
    result_sigma1 = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "smoothing": {"algorithm": "gaussian", "sigma": 0.5}
        }
    ).json()

    result_sigma3 = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "smoothing": {"algorithm": "gaussian", "sigma": 3.0}
        }
    ).json()

    weights_sigma1 = [e["weight"] for e in result_sigma1["frames"][1]["edges"]]
    weights_sigma3 = [e["weight"] for e in result_sigma3["frames"][1]["edges"]]
    assert weights_sigma1 != weights_sigma3


def test_moving_average_window_affects_output(test_client: TestClient, file_path: str):
    result_w2 = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "smoothing": {"algorithm": "moving_average", "window": 2}
        }
    ).json()

    result_w5 = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "smoothing": {"algorithm": "moving_average", "window": 5}
        }
    ).json()

    weights_w2 = [e["weight"] for e in result_w2["frames"][2]["edges"]]
    weights_w5 = [e["weight"] for e in result_w5["frames"][2]["edges"]]
    assert weights_w2 != weights_w5


def test_exponential_alpha_affects_output(test_client: TestClient, file_path: str):
    result_a1 = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "smoothing": {"algorithm": "exponential", "alpha": 0.1}
        }
    ).json()

    result_a9 = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "smoothing": {"algorithm": "exponential", "alpha": 0.9}
        }
    ).json()

    weights_a1 = [e["weight"] for e in result_a1["frames"][2]["edges"]]
    weights_a9 = [e["weight"] for e in result_a9["frames"][2]["edges"]]
    assert weights_a1 != weights_a9


def test_smoothing_and_interpolation_combined(test_client: TestClient, file_path: str):
    base = test_client.post(
        "/abide/data",
        json={"file_path": file_path, "method": "pearson"}
    ).json()
    base_frames = len(base["frames"])

    combined = test_client.post(
        "/abide/data",
        json={
            "file_path": file_path,
            "method": "pearson",
            "smoothing": {"algorithm": "gaussian", "sigma": 1.5},
            "interpolation": {"algorithm": "linear", "factor": 3}
        }
    ).json()

    # Interpolation should increase frame count
    expected_frames = (base_frames - 1) * 3 + 1
    assert len(combined["frames"]) == expected_frames
