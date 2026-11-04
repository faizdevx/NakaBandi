from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.spa import SpaFiles


def client(tmp_path):
    (tmp_path / "index.html").write_text("<h1>home</h1>")
    (tmp_path / "logo.txt").write_text("logo")
    (tmp_path.parent / "secret.txt").write_text("secret")
    app = FastAPI()
    app.get("/api/health")(lambda: {"ok": True})
    app.mount("/", SpaFiles(directory=tmp_path, html=True))
    return TestClient(app)


def test_serves_files_and_falls_back_to_index(tmp_path):
    c = client(tmp_path)
    assert c.get("/").text == "<h1>home</h1>"
    assert c.get("/logo.txt").text == "logo"
    assert c.get("/some/page").text == "<h1>home</h1>"


def test_api_routes_win_and_unknown_api_stays_404(tmp_path):
    c = client(tmp_path)
    assert c.get("/api/health").json() == {"ok": True}
    assert c.get("/api/nope").status_code == 404


def test_cannot_read_outside_the_folder(tmp_path):
    c = client(tmp_path)
    assert "secret" not in c.get("/..%2Fsecret.txt").text
