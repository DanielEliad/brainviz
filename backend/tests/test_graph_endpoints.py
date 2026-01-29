"""
Tests for legacy graph endpoints (random data).
"""

from fastapi.testclient import TestClient


class TestGraphMetadata:
    """Tests for GET /graph/metadata endpoint."""

    def test_metadata_returns_structure(self, test_client: TestClient):
        """Test that metadata has expected structure."""
        response = test_client.get("/graph/metadata")

        assert response.status_code == 200
        data = response.json()

        assert "num_nodes" in data
        assert "node_names" in data
        assert "description" in data

    def test_metadata_node_count_matches_names(self, test_client: TestClient):
        """Test that node count matches number of node names."""
        response = test_client.get("/graph/metadata")
        data = response.json()

        assert data["num_nodes"] == len(data["node_names"])

    def test_metadata_has_brain_regions(self, test_client: TestClient):
        """Test that node names include brain region names."""
        response = test_client.get("/graph/metadata")
        node_names = response.json()["node_names"]

        # Should have some brain region names
        assert len(node_names) > 0
        assert all(isinstance(name, str) for name in node_names)


class TestGraphData:
    """Tests for GET /graph/data endpoint."""

    def test_data_returns_structure(self, test_client: TestClient):
        """Test that data has expected structure."""
        response = test_client.get("/graph/data")

        assert response.status_code == 200
        data = response.json()

        assert "frames" in data
        assert "meta" in data

    def test_data_returns_frames(self, test_client: TestClient):
        """Test that frames are returned."""
        response = test_client.get("/graph/data")
        frames = response.json()["frames"]

        assert len(frames) > 0

    def test_frame_structure(self, test_client: TestClient):
        """Test that each frame has correct structure."""
        response = test_client.get("/graph/data")
        frames = response.json()["frames"]

        for frame in frames[:5]:  # Check first 5 frames
            assert "timestamp" in frame
            assert "nodes" in frame
            assert "edges" in frame
            assert "metadata" in frame

    def test_node_structure(self, test_client: TestClient):
        """Test that nodes have correct structure."""
        response = test_client.get("/graph/data")
        frames = response.json()["frames"]
        nodes = frames[0]["nodes"]

        for node in nodes:
            assert "id" in node
            assert "label" in node
            assert "degree" in node
            assert "group" in node

    def test_edge_structure(self, test_client: TestClient):
        """Test that edges have correct structure."""
        response = test_client.get("/graph/data")
        frames = response.json()["frames"]
        edges = frames[0]["edges"]

        assert len(edges) > 0
        for edge in edges[:10]:  # Check first 10 edges
            assert "source" in edge
            assert "target" in edge
            assert "weight" in edge

    def test_meta_structure(self, test_client: TestClient):
        """Test that meta has correct structure."""
        response = test_client.get("/graph/data")
        meta = response.json()["meta"]

        assert "available_timestamps" in meta
        assert "node_attributes" in meta
        assert "edge_attributes" in meta
        assert "edge_weight_min" in meta
        assert "edge_weight_max" in meta

    def test_smoothing_none(self, test_client: TestClient):
        """Test with no smoothing."""
        response = test_client.get("/graph/data", params={"smoothing": "none"})
        assert response.status_code == 200

    def test_smoothing_moving_average(self, test_client: TestClient):
        """Test moving average smoothing."""
        response = test_client.get("/graph/data", params={"smoothing": "moving_average"})
        assert response.status_code == 200

    def test_smoothing_exponential(self, test_client: TestClient):
        """Test exponential smoothing."""
        response = test_client.get("/graph/data", params={"smoothing": "exponential"})
        assert response.status_code == 200

    def test_smoothing_gaussian(self, test_client: TestClient):
        """Test gaussian smoothing."""
        response = test_client.get("/graph/data", params={"smoothing": "gaussian"})
        assert response.status_code == 200

    def test_interpolation_none(self, test_client: TestClient):
        """Test with no interpolation."""
        response = test_client.get("/graph/data", params={"interpolation": "none"})
        assert response.status_code == 200

    def test_interpolation_linear(self, test_client: TestClient):
        """Test linear interpolation."""
        response = test_client.get(
            "/graph/data",
            params={"interpolation": "linear", "interpolation_factor": 2}
        )
        assert response.status_code == 200

    def test_interpolation_cubic_spline(self, test_client: TestClient):
        """Test cubic spline interpolation."""
        response = test_client.get(
            "/graph/data",
            params={"interpolation": "cubic_spline", "interpolation_factor": 2}
        )
        assert response.status_code == 200

    def test_interpolation_increases_frames(self, test_client: TestClient):
        """Test that interpolation increases frame count."""
        response_none = test_client.get("/graph/data", params={"interpolation": "none"})
        response_interp = test_client.get(
            "/graph/data",
            params={"interpolation": "linear", "interpolation_factor": 2}
        )

        frames_none = len(response_none.json()["frames"])
        frames_interp = len(response_interp.json()["frames"])

        assert frames_interp > frames_none

    def test_combined_smoothing_and_interpolation(self, test_client: TestClient):
        """Test both smoothing and interpolation together."""
        response = test_client.get(
            "/graph/data",
            params={
                "smoothing": "gaussian",
                "interpolation": "linear",
                "interpolation_factor": 2
            }
        )
        assert response.status_code == 200
        assert len(response.json()["frames"]) > 0
