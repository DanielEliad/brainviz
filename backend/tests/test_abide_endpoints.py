"""
Tests for ABIDE data endpoints.
"""

import pytest
from fastapi.testclient import TestClient


class TestListAbideFiles:
    """Tests for GET /abide/files endpoint."""

    def test_list_files_returns_structure(self, test_client: TestClient):
        """Test that file listing returns expected structure."""
        response = test_client.get("/abide/files")

        assert response.status_code == 200
        data = response.json()
        assert "files" in data
        assert "data_dir" in data
        assert isinstance(data["files"], list)

    def test_list_files_contains_expected_files(self, test_client: TestClient):
        """Test that fixture files are found."""
        response = test_client.get("/abide/files")
        data = response.json()

        # Should find 4 files from fixture
        assert len(data["files"]) == 4

        # Check file structure
        for file_info in data["files"]:
            assert "path" in file_info
            assert "subject_id" in file_info
            assert "site" in file_info
            assert "version" in file_info

    def test_list_files_extracts_metadata(self, test_client: TestClient):
        """Test that site and version are correctly extracted."""
        response = test_client.get("/abide/files")
        files = response.json()["files"]

        # Find NYU file
        nyu_files = [f for f in files if f["site"] == "NYU"]
        assert len(nyu_files) == 2
        assert all(f["version"] == "ABIDE_I" for f in nyu_files)

        # Find Stanford file
        stanford_files = [f for f in files if f["site"] == "Stanford"]
        assert len(stanford_files) == 1
        assert stanford_files[0]["version"] == "ABIDE_II"

    def test_list_files_empty_directory(self, test_client_empty_data: TestClient):
        """Test response when no files exist."""
        response = test_client_empty_data.get("/abide/files")

        assert response.status_code == 200
        assert response.json()["files"] == []


class TestListCorrelationMethods:
    """Tests for GET /abide/methods endpoint."""

    def test_methods_returns_list(self, test_client: TestClient):
        """Test that methods endpoint returns a list."""
        response = test_client.get("/abide/methods")

        assert response.status_code == 200
        data = response.json()
        assert "methods" in data
        assert isinstance(data["methods"], list)

    def test_methods_contains_required_methods(self, test_client: TestClient):
        """Test that all correlation methods are present."""
        response = test_client.get("/abide/methods")
        methods = response.json()["methods"]

        method_ids = [m["id"] for m in methods]
        assert "pearson" in method_ids
        assert "spearman" in method_ids
        assert "partial" in method_ids

    def test_methods_have_required_fields(self, test_client: TestClient):
        """Test that each method has required fields."""
        response = test_client.get("/abide/methods")
        methods = response.json()["methods"]

        for method in methods:
            assert "id" in method
            assert "name" in method
            assert "description" in method
            assert "params" in method
            assert isinstance(method["params"], list)

    def test_method_params_structure(self, test_client: TestClient):
        """Test that method parameters have correct structure."""
        response = test_client.get("/abide/methods")
        methods = response.json()["methods"]

        for method in methods:
            for param in method["params"]:
                assert "name" in param
                assert "type" in param
                assert "min" in param
                assert "max" in param


class TestGetAbideData:
    """Tests for GET /abide/data endpoint."""

    def test_get_data_success(self, test_client: TestClient):
        """Test successful data retrieval."""
        # Get a file path first
        files_response = test_client.get("/abide/files")
        files = files_response.json()["files"]
        assert len(files) > 0

        file_path = files[0]["path"]

        response = test_client.get(
            "/abide/data",
            params={"file_path": file_path}
        )

        assert response.status_code == 200
        data = response.json()
        assert "frames" in data
        assert "meta" in data

    def test_get_data_returns_frames(self, test_client: TestClient):
        """Test that frames have correct structure."""
        files = test_client.get("/abide/files").json()["files"]
        file_path = files[0]["path"]

        response = test_client.get(
            "/abide/data",
            params={"file_path": file_path, "window_size": 30, "step": 5}
        )

        data = response.json()
        frames = data["frames"]

        assert len(frames) > 0

        # Check frame structure
        frame = frames[0]
        assert "timestamp" in frame
        assert "nodes" in frame
        assert "edges" in frame
        assert "metadata" in frame

    def test_get_data_returns_14_rsn_nodes(self, test_client: TestClient):
        """Test that exactly 14 RSN nodes are returned."""
        files = test_client.get("/abide/files").json()["files"]
        file_path = files[0]["path"]

        response = test_client.get(
            "/abide/data",
            params={"file_path": file_path}
        )

        frames = response.json()["frames"]
        nodes = frames[0]["nodes"]

        # Should have 14 RSN nodes
        assert len(nodes) == 14

        # Check node structure
        for node in nodes:
            assert "id" in node
            assert "label" in node
            assert "degree" in node

    def test_get_data_with_different_methods(self, test_client: TestClient):
        """Test different correlation methods work."""
        files = test_client.get("/abide/files").json()["files"]
        file_path = files[0]["path"]

        for method in ["pearson", "spearman", "partial"]:
            response = test_client.get(
                "/abide/data",
                params={"file_path": file_path, "method": method, "window_size": 20}
            )
            assert response.status_code == 200, f"Method {method} failed"

    def test_get_data_with_threshold(self, test_client: TestClient):
        """Test correlation threshold parameter."""
        files = test_client.get("/abide/files").json()["files"]
        file_path = files[0]["path"]

        # Without threshold
        response_no_thresh = test_client.get(
            "/abide/data",
            params={"file_path": file_path, "window_size": 30}
        )

        # With high threshold
        response_high_thresh = test_client.get(
            "/abide/data",
            params={"file_path": file_path, "window_size": 30, "threshold": 0.8}
        )

        assert response_no_thresh.status_code == 200
        assert response_high_thresh.status_code == 200

        # High threshold should result in fewer non-zero edges
        # (actual comparison depends on data, but both should work)

    def test_get_data_window_size_affects_frames(self, test_client: TestClient):
        """Test that window size affects number of frames."""
        files = test_client.get("/abide/files").json()["files"]
        file_path = files[0]["path"]

        # Smaller window = more frames
        response_small = test_client.get(
            "/abide/data",
            params={"file_path": file_path, "window_size": 20, "step": 1}
        )

        # Larger window = fewer frames
        response_large = test_client.get(
            "/abide/data",
            params={"file_path": file_path, "window_size": 50, "step": 1}
        )

        frames_small = len(response_small.json()["frames"])
        frames_large = len(response_large.json()["frames"])

        assert frames_small > frames_large

    def test_get_data_step_affects_frames(self, test_client: TestClient):
        """Test that step size affects number of frames."""
        files = test_client.get("/abide/files").json()["files"]
        file_path = files[0]["path"]

        # Step 1
        response_step1 = test_client.get(
            "/abide/data",
            params={"file_path": file_path, "window_size": 30, "step": 1}
        )

        # Step 5
        response_step5 = test_client.get(
            "/abide/data",
            params={"file_path": file_path, "window_size": 30, "step": 5}
        )

        frames_step1 = len(response_step1.json()["frames"])
        frames_step5 = len(response_step5.json()["frames"])

        assert frames_step1 > frames_step5

    def test_get_data_file_not_found(self, test_client: TestClient):
        """Test 404 for non-existent file."""
        response = test_client.get(
            "/abide/data",
            params={"file_path": "nonexistent/file.txt"}
        )

        assert response.status_code == 404

    def test_get_data_invalid_method(self, test_client: TestClient):
        """Test 400 for invalid correlation method."""
        files = test_client.get("/abide/files").json()["files"]
        file_path = files[0]["path"]

        response = test_client.get(
            "/abide/data",
            params={"file_path": file_path, "method": "invalid_method"}
        )

        assert response.status_code == 400

    def test_get_data_window_too_large(self, test_client: TestClient):
        """Test error when window size exceeds allowed range."""
        files = test_client.get("/abide/files").json()["files"]
        file_path = files[0]["path"]

        # Window size 150 exceeds max allowed (100), FastAPI returns 422
        response = test_client.get(
            "/abide/data",
            params={"file_path": file_path, "window_size": 150}
        )

        # FastAPI returns 422 for validation errors
        assert response.status_code == 422

    def test_get_data_meta_structure(self, test_client: TestClient):
        """Test that meta has correct structure."""
        files = test_client.get("/abide/files").json()["files"]
        file_path = files[0]["path"]

        response = test_client.get(
            "/abide/data",
            params={"file_path": file_path}
        )

        meta = response.json()["meta"]

        assert "available_timestamps" in meta
        assert "node_attributes" in meta
        assert "edge_attributes" in meta
        assert "edge_weight_min" in meta
        assert "edge_weight_max" in meta
        assert "description" in meta

        # Edge weights should be in [0, 255] range after normalization
        assert meta["edge_weight_min"] >= 0
        assert meta["edge_weight_max"] <= 255

    def test_get_data_with_smoothing(self, test_client: TestClient):
        """Test smoothing parameter."""
        files = test_client.get("/abide/files").json()["files"]
        file_path = files[0]["path"]

        for smoothing in ["none", "moving_average", "exponential", "gaussian"]:
            response = test_client.get(
                "/abide/data",
                params={"file_path": file_path, "smoothing": smoothing}
            )
            assert response.status_code == 200, f"Smoothing {smoothing} failed"

    def test_get_data_with_interpolation(self, test_client: TestClient):
        """Test interpolation parameter."""
        files = test_client.get("/abide/files").json()["files"]
        file_path = files[0]["path"]

        # Without interpolation
        response_none = test_client.get(
            "/abide/data",
            params={"file_path": file_path, "interpolation": "none"}
        )

        # With linear interpolation factor 2
        response_interp = test_client.get(
            "/abide/data",
            params={
                "file_path": file_path,
                "interpolation": "linear",
                "interpolation_factor": 2
            }
        )

        assert response_none.status_code == 200
        assert response_interp.status_code == 200

        # Interpolation should increase frame count
        frames_none = len(response_none.json()["frames"])
        frames_interp = len(response_interp.json()["frames"])

        assert frames_interp > frames_none
