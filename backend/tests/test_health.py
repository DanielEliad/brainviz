from fastapi.testclient import TestClient


def test_health_endpoint(test_client: TestClient):
    response = test_client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
