def test_health_returns_ok(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True}


def test_server_refuses_to_start_without_secret(monkeypatch):
    from app.main import create_app
    import pytest

    monkeypatch.setenv("APP_SECRET", "")
    with pytest.raises(RuntimeError):
        create_app()
