# -*- coding: utf-8 -*-
"""שרת מקומי: סוגיות התפילין, עזרים ומבחנים לפי סוגיא."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from datetime import datetime
import json
import os
import re
import shutil
import sys
import urllib.parse
import webbrowser

ROOT = Path(__file__).resolve().parent
MATERIALS = ROOT / "חומרים"
REGISTRY = MATERIALS / "רישום.json"
PORT = 8877
SUGYA_LETTERS = {
    "a": "א", "b": "ב", "c": "ג", "d": "ד", "e": "ה", "f": "ו", "g": "ז",
    "h": "ח", "i": "ט", "j": "י", "k": "יא", "l": "יב", "m": "יג",
}
LETTER_TO_ID = {v: k for k, v in SUGYA_LETTERS.items()}
SAFE_NAME = re.compile(r"[^\w\u0590-\u05FF\-_. ]+", re.UNICODE)
YOUTUBE_RE = re.compile(
    r"(?:youtu\.be/|youtube(?:-nocookie)?\.com/(?:embed/|shorts/|live/|watch\?(?:[^#]*&)?v=)|[?&]v=)([\w-]{11})",
    re.I,
)


def sugya_dir(sugya_id):
    letter = SUGYA_LETTERS.get(sugya_id) or sugya_id
    return MATERIALS / ("סוגיא " + letter)


def role_dir(sugya_id, role):
    return sugya_dir(sugya_id) / role


def links_path(sugya_id):
    return sugya_dir(sugya_id) / "קישורים.json"


def sugya_from_path(path):
    for part in Path(path).parts:
        if part.startswith("סוגיא "):
            name = part.replace("סוגיא ", "", 1)
            if name in LETTER_TO_ID:
                return LETTER_TO_ID[name]
    return None


def safe(name):
    name = SAFE_NAME.sub("", Path(name).name).strip() or "קובץ"
    return name[:80]


def send_json(handler, payload, code=200):
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)


def read_json_file(path, fallback):
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json_file(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def pdf_to_pages(pdf_path, dest):
    import pymupdf

    dest.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(pdf_path)
    mat = pymupdf.Matrix(2.0, 2.0)
    pages = []
    for i, page in enumerate(doc):
        name = "p%02d.jpg" % (i + 1)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        pix.save(dest / name, jpg_quality=88)
        pages.append(name)
    return pages


def item_from_meta(meta_path, role, sugya_id):
    meta = read_json_file(meta_path, None)
    if not meta:
        return None
    rel = meta_path.parent.relative_to(ROOT).as_posix()
    pages = ["/%s/%s" % (rel, p) for p in meta.get("pages") or []]
    file_url = ("/%s/%s" % (rel, meta["file"])) if meta.get("file") else ""
    return {
        "id": meta.get("id") or rel,
        "name": meta.get("name") or meta_path.parent.name,
        "role": meta.get("role") or role,
        "type": meta.get("type") or "pages",
        "pages": pages,
        "file": file_url,
        "path": rel,
        "sugya": meta.get("sugya") or sugya_id or sugya_from_path(meta_path),
    }


def collect_folder_items(base, role, sugya_id, items, seen):
    folder = base / role
    if not folder.exists():
        return
    for meta_path in folder.rglob("meta.json"):
        item = item_from_meta(meta_path, role, sugya_id)
        if not item or item["id"] in seen:
            continue
        seen.add(item["id"])
        items.append(item)


def collect_links(path, sugya_id, items, seen):
    for link in read_json_file(path, []):
        if link.get("id") in seen:
            continue
        seen.add(link.get("id"))
        link = dict(link)
        link["sugya"] = link.get("sugya") or sugya_id
        items.append(link)


def collect_sugya(sugya_id):
    items = []
    seen = set()
    base = sugya_dir(sugya_id)
    for role in ("עזרים", "מבחנים", "סרטונים"):
        collect_folder_items(base, role, sugya_id, items, seen)
    collect_links(links_path(sugya_id), sugya_id, items, seen)
    return items


def write_registry():
    items = []
    if MATERIALS.exists():
        for folder in MATERIALS.glob("סוגיא *"):
            name = folder.name.replace("סוגיא ", "", 1)
            sugya_id = LETTER_TO_ID.get(name)
            if not sugya_id:
                continue
            items.extend(collect_sugya(sugya_id))
    write_json_file(REGISTRY, {"items": items})
    return items


def list_materials(sugya_id):
    return collect_sugya(sugya_id)


def parse_multipart(handler):
    ctype = handler.headers.get("Content-Type", "")
    length = int(handler.headers.get("Content-Length", "0") or 0)
    body = handler.rfile.read(length)
    match = re.search(r"boundary=([^;]+)", ctype)
    if not match:
        return {}, {}
    boundary = match.group(1).strip().strip('"').encode("ascii", "ignore")
    fields = {}
    files = {}
    for part in body.split(b"--" + boundary):
        if not part or part in (b"--\r\n", b"--", b"--\n"):
            continue
        if part.startswith(b"--"):
            continue
        head, sep, data = part.partition(b"\r\n\r\n")
        if not sep:
            continue
        data = data.rstrip(b"\r\n")
        header = head.decode("utf-8", "replace")
        name_m = re.search(r'name="([^"]+)"', header)
        if not name_m:
            continue
        name = name_m.group(1)
        file_m = re.search(r'filename="([^"]*)"', header)
        if file_m:
            files[name] = {"filename": file_m.group(1), "data": data}
        else:
            fields[name] = data.decode("utf-8", "replace")
    return fields, files


def youtube_id(url):
    found = YOUTUBE_RE.search(url or "")
    return found.group(1) if found else ""


def unique_folder(parent, stem):
    dest = parent / stem
    if not dest.exists():
        return dest
    stamp = datetime.now().strftime("%H%M%S")
    return parent / (stem + " " + stamp)


def save_file_item(sugya_id, role, raw_name, data):
    name = safe(raw_name)
    folder = unique_folder(role_dir(sugya_id, role), Path(name).stem)
    folder.mkdir(parents=True, exist_ok=True)
    original = folder / name
    original.write_bytes(data)
    ext = original.suffix.lower()
    pages = []
    kind = "file"
    if ext == ".pdf":
        pages = pdf_to_pages(original, folder)
        kind = "pages"
    elif ext in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        pages = [name]
        kind = "pages"
    elif ext in (".mp4", ".webm", ".mov", ".m4v"):
        kind = "video"
    meta = {
        "id": folder.name,
        "name": name,
        "role": role,
        "type": kind,
        "pages": pages,
        "file": name,
        "sugya": sugya_id,
    }
    write_json_file(folder / "meta.json", meta)
    write_registry()
    return meta


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        path = urllib.parse.unquote(urllib.parse.urlparse(self.path).path)
        if path in ("/", "/index.html") or path.endswith("/index.html"):
            self.send_header("Cache-Control", "no-store")
        if path.startswith("/חומרים/"):
            self.send_header("Content-Disposition", "inline")
            self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/materials":
            q = urllib.parse.parse_qs(parsed.query)
            sugya = (q.get("sugya", ["a"])[0] or "a").strip()
            if sugya not in SUGYA_LETTERS:
                return send_json(self, {"items": []}, 400)
            return send_json(self, {"items": list_materials(sugya)})
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/upload":
            fields, files = parse_multipart(self)
            upload = files.get("file")
            if not upload or not upload.get("data"):
                return send_json(self, {"ok": False, "error": "חסר קובץ"}, 400)
            sugya = (fields.get("sugya") or "a").strip()
            if sugya not in SUGYA_LETTERS:
                return send_json(self, {"ok": False}, 400)
            role = fields.get("role", "עזרים")
            if role not in ("עזרים", "מבחנים", "סרטונים"):
                role = "עזרים"
            meta = save_file_item(sugya, role, upload["filename"] or fields.get("name") or "קובץ", upload["data"])
            return send_json(self, {"ok": True, "item": meta})

        if parsed.path == "/api/youtube":
            raw = self.rfile.read(int(self.headers.get("Content-Length", "0") or 0))
            try:
                body = json.loads(raw.decode("utf-8"))
            except Exception:
                return send_json(self, {"ok": False}, 400)
            vid = youtube_id(body.get("url", ""))
            if not vid:
                return send_json(self, {"ok": False, "error": "לא זוהה קישור יוטיוב"}, 400)
            sugya = (body.get("sugya") or "a").strip()
            if sugya not in SUGYA_LETTERS:
                return send_json(self, {"ok": False}, 400)
            dest = links_path(sugya)
            links = read_json_file(dest, [])
            item = {
                "id": "yt-" + vid + "-" + datetime.now().strftime("%H%M%S"),
                "name": body.get("title") or "סרטון יוטיוב",
                "role": "youtube",
                "type": "youtube",
                "youtubeId": vid,
                "url": "https://www.youtube.com/watch?v=" + vid,
                "sugya": sugya,
            }
            links.append(item)
            write_json_file(dest, links)
            write_registry()
            return send_json(self, {"ok": True, "item": item})

        if parsed.path == "/api/delete":
            raw = self.rfile.read(int(self.headers.get("Content-Length", "0") or 0))
            try:
                body = json.loads(raw.decode("utf-8"))
            except Exception:
                return send_json(self, {"ok": False}, 400)
            if body.get("youtubeId"):
                sugya = (body.get("sugya") or "a").strip()
                dest = links_path(sugya)
                links = [x for x in read_json_file(dest, []) if x.get("id") != body.get("id")]
                write_json_file(dest, links)
                write_registry()
                return send_json(self, {"ok": True})
            rel = body.get("path") or ""
            target = (ROOT / rel).resolve()
            try:
                target.relative_to(MATERIALS.resolve())
            except ValueError:
                return send_json(self, {"ok": False}, 400)
            if target.is_dir():
                shutil.rmtree(target, ignore_errors=True)
            elif target.exists():
                target.unlink()
            write_registry()
            return send_json(self, {"ok": True})

        self.send_error(404)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    MATERIALS.mkdir(exist_ok=True)
    if not REGISTRY.exists():
        write_json_file(REGISTRY, {"items": []})
    try:
        write_registry()
    except Exception as exc:
        print("registry skip", exc, flush=True)
    os.chdir(ROOT)
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = "http://127.0.0.1:%s/" % PORT
    print("Open", url, flush=True)
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("closed")
