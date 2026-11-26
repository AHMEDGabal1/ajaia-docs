from fastapi.testclient import TestClient

from app import app


def login(email: str) -> TestClient:
    client = TestClient(app)
    res = client.post("/api/auth/login", json={"email": email})
    assert res.status_code == 200, res.text
    return client


def test_access_control():
    with TestClient(app):
        alice = login("alice@example.com")
        doc = alice.post("/api/documents", json={"title": "Secret plan", "content_html": "<p>hi</p>"})
        assert doc.status_code == 201
        doc_id = doc.json()["id"]

        bob = login("bob@example.com")
        assert bob.get(f"/api/documents/{doc_id}").status_code == 403

        assert (
            alice.post(
                f"/api/documents/{doc_id}/share", json={"email": "bob@example.com", "role": "viewer"}
            ).status_code
            == 200
        )
        assert bob.get(f"/api/documents/{doc_id}").status_code == 200
        assert bob.patch(f"/api/documents/{doc_id}", json={"content_html": "<p>x</p>"}).status_code == 403
        assert (
            bob.post(
                f"/api/documents/{doc_id}/share", json={"email": "carol@example.com", "role": "viewer"}
            ).status_code
            == 403
        )

        assert (
            alice.post(
                f"/api/documents/{doc_id}/share", json={"email": "carol@example.com", "role": "editor"}
            ).status_code
            == 200
        )
        carol = login("carol@example.com")
        assert carol.patch(f"/api/documents/{doc_id}", json={"content_html": "<p>edited</p>"}).status_code == 200
        assert (
            carol.post(
                f"/api/documents/{doc_id}/share", json={"email": "bob@example.com", "role": "viewer"}
            ).status_code
            == 403
        )


def test_content_roundtrip():
    with TestClient(app):
        alice = login("alice@example.com")
        doc_id = alice.post("/api/documents", json={"title": "Round trip"}).json()["id"]
        html = "<h1>Title</h1><p><strong>bold</strong> and <em>italic</em> and <u>under</u></p><ul><li>one</li></ul>"
        assert alice.patch(f"/api/documents/{doc_id}", json={"content_html": html}).status_code == 200
        got = alice.get(f"/api/documents/{doc_id}").json()
        assert got["content_html"] == html
        assert got["title"] == "Round trip"
