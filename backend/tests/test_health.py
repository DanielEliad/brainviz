"""
Tests for health check endpoint.
"""

from fastapi.testclient import TestClient


def test_health_endpoint(test_client: TestClient):
    """Test that health endpoint returns OK status."""
    response = test_client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
