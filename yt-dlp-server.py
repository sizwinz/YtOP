#!/usr/bin/env python3
"""
yt-dlp Local Bridge Server
Listens on http://127.0.0.1:9898
Endpoints:
  GET  /health              → sanity check
  GET  /formats?url=...     → returns all available formats as JSON
  POST /download            → triggers yt-dlp download (non-blocking)
  GET  /progress?url=...    → SSE stream of live yt-dlp output (optional)
"""

import json
import os
import re
import subprocess
import sys
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import pystray
    from PIL import Image, ImageDraw
    TRAY_AVAILABLE = True
except ImportError:
    TRAY_AVAILABLE = False

# Regular expression to parse yt-dlp download progress
# Matches: [download]  12.3% of 45.67MiB at  5.12MiB/s ETA 00:08
progress_re = re.compile(
    r"\[download\]\s+(\d+\.\d+)%\s+of\s+~?([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)"
)

# Global progress store
download_progress = {}
progress_lock = threading.Lock()


def update_progress(key, data):
    with progress_lock:
        if key not in download_progress:
            download_progress[key] = {}
        download_progress[key].update(data)


# ─────────────────────────────────────────────
# CONFIG  (edit these to match your system)
# ─────────────────────────────────────────────
import shutil
PORT        = 9898
DOWNLOAD_DIR = os.path.join(os.path.expanduser("~"), "Downloads", "ytOP")
ALLOWED_ORIGIN = "https://www.youtube.com"

# Resolve binaries (prioritize PATH, fallback to common WinGet/user paths)
resolved_ytdlp = shutil.which("yt-dlp")
if resolved_ytdlp:
    YTDLP_BIN = resolved_ytdlp
else:
    winget_ytdlp = os.path.join(os.path.expanduser("~"), "AppData", "Local", "Microsoft", "WinGet", "Links", "yt-dlp.exe")
    if os.path.exists(winget_ytdlp):
        YTDLP_BIN = winget_ytdlp
    else:
        YTDLP_BIN = "yt-dlp"

resolved_ffmpeg = shutil.which("ffmpeg")
if resolved_ffmpeg:
    FFMPEG_BIN = resolved_ffmpeg
else:
    winget_ffmpeg = os.path.join(os.path.expanduser("~"), "AppData", "Local", "Microsoft", "WinGet", "Links", "ffmpeg.exe")
    if os.path.exists(winget_ffmpeg):
        FFMPEG_BIN = winget_ffmpeg
    else:
        FFMPEG_BIN = "ffmpeg"
# ─────────────────────────────────────────────

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Active download processes {url_hash: Popen}
active_downloads: dict = {}
download_lock = threading.Lock()


def fmt_size(b):
    """Convert bytes to human-readable string."""
    if b is None:
        return "~"
    for unit in ("B", "KB", "MB", "GB"):
        if b < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.1f} TB"


def get_formats(url: str) -> dict:
    """
    Run yt-dlp --dump-json and parse format list.
    Returns a dict with title, thumbnail, duration, and categorised formats.
    """
    cmd = [
        YTDLP_BIN,
        "--dump-json",
        "--no-playlist",
        "--no-warnings",
        "--extractor-args", "youtube:formats=missing_pot",   # include all formats
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=45)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "yt-dlp returned non-zero exit code")

    raw = json.loads(result.stdout)
    formats_raw = raw.get("formats", [])

    video_only = []
    audio_only = []
    combined   = []  # muxed streams (rare on YouTube but kept for completeness)

    seen_heights = set()   # deduplicate Video+Audio pairings later

    # Best audio format id for pairing (prefer m4a/mp4a for compatibility)
    best_audio = None
    for f in formats_raw:
        if f.get("vcodec", "none") == "none" and f.get("acodec", "none") != "none":
            if best_audio is None:
                best_audio = f
            else:
                # prefer higher abr
                if (f.get("abr") or 0) > (best_audio.get("abr") or 0):
                    best_audio = f

    for f in formats_raw:
        vcodec = f.get("vcodec", "none")
        acodec = f.get("acodec", "none")
        has_v = vcodec and vcodec != "none"
        has_a = acodec and acodec != "none"
        height = f.get("height")
        fps    = f.get("fps")
        fsize  = f.get("filesize") or f.get("filesize_approx")
        fid    = f.get("format_id")
        ext    = f.get("ext", "?")
        note   = f.get("format_note", "")
        tbr    = f.get("tbr")

        entry = {
            "format_id": fid,
            "ext":       ext,
            "note":      note,
            "filesize":  fsize,
            "filesize_hr": fmt_size(fsize),
            "tbr":       tbr,
        }

        if has_v and not has_a:
            # Video-only stream
            entry.update({
                "type":       "video",
                "height":     height,
                "width":      f.get("width"),
                "fps":        fps,
                "vcodec":     vcodec,
                "resolution": f.get("resolution") or (f"{f.get('width')}x{height}" if height else "?"),
                "hdr":        "HDR" in note or "hdr" in note.lower(),
            })
            video_only.append(entry)

            # Build a paired Video+Audio entry
            if height and height not in seen_heights and best_audio:
                audio_fsize = best_audio.get("filesize") or best_audio.get("filesize_approx") or 0
                total_fsize = (fsize or 0) + audio_fsize or None
                paired = dict(entry)
                paired.update({
                    "type":       "video+audio",
                    "format_id":  f"{fid}+{best_audio['format_id']}",
                    "audio_ext":  best_audio.get("ext", "m4a"),
                    "abr":        best_audio.get("abr"),
                    "acodec":     best_audio.get("acodec"),
                    "filesize":   total_fsize,
                    "filesize_hr": fmt_size(total_fsize),
                    "merge_ext":  "mp4",   # ffmpeg will mux to mp4
                })
                combined.append(paired)
                seen_heights.add(height)

        elif has_a and not has_v:
            # Audio-only stream
            entry.update({
                "type":   "audio",
                "acodec": acodec,
                "abr":    f.get("abr"),
                "asr":    f.get("asr"),
            })
            audio_only.append(entry)

        elif has_v and has_a:
            # Muxed (rare on YouTube)
            entry.update({
                "type":       "muxed",
                "height":     height,
                "fps":        fps,
                "vcodec":     vcodec,
                "acodec":     acodec,
                "resolution": f.get("resolution") or f"{f.get('width')}x{height}",
            })
            combined.append(entry)

    # Sort: video by height desc, audio by abr desc
    video_only.sort(key=lambda x: (x.get("height") or 0, x.get("fps") or 0), reverse=True)
    combined.sort(key=lambda x: (x.get("height") or 0, x.get("fps") or 0), reverse=True)
    audio_only.sort(key=lambda x: x.get("abr") or 0, reverse=True)

    return {
        "title":     raw.get("title", ""),
        "thumbnail": raw.get("thumbnail", ""),
        "duration":  raw.get("duration"),
        "uploader":  raw.get("uploader", ""),
        "video_audio": combined,
        "video_only":  video_only,
        "audio_only":  audio_only,
    }


def trigger_download(url: str, format_id: str, merge_ext: str = "mp4",
                     output_dir: str = DOWNLOAD_DIR) -> str:
    """
    Spawn yt-dlp as a background process.
    Returns a status string.
    """
    output_tmpl = os.path.join(output_dir, "%(title)s [%(id)s].%(ext)s")
    cmd = [
        YTDLP_BIN,
        "-f", format_id,
    ]
    if FFMPEG_BIN != "ffmpeg":
        cmd.extend(["--ffmpeg-location", FFMPEG_BIN])
    cmd.extend([
        "--merge-output-format", merge_ext,
        "--no-playlist",
        "--add-metadata",
        "--embed-thumbnail",
        "-o", output_tmpl,
        url,
    ])
    key = f"{url}|{format_id}"
    with download_lock:
        if key in active_downloads:
            proc = active_downloads[key]
            if proc.poll() is None:
                return "already_running"
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        active_downloads[key] = proc

    # Log output in a daemon thread
    def _log():
        update_progress(key, {
            "status": "downloading",
            "percent": "0.0",
            "speed": "~",
            "eta": "~"
        })
        last_error = ""
        for line in proc.stdout:
            print(f"[yt-dlp] {line}", end="")
            if "error:" in line.lower():
                last_error = line.strip()
            match = progress_re.search(line)
            if match:
                percent, total_size, speed, eta = match.groups()
                update_progress(key, {
                    "status": "downloading",
                    "percent": percent,
                    "speed": speed,
                    "eta": eta
                })
            elif "merging" in line.lower() or "ffmpeg" in line.lower() or "merger" in line.lower():
                update_progress(key, {"status": "merging"})
            elif "already has been downloaded" in line.lower():
                update_progress(key, {"status": "completed", "percent": "100.0"})

        exit_code = proc.wait()
        print(f"[yt-dlp] Process exited: {exit_code}")
        with download_lock:
            active_downloads.pop(key, None)

        if exit_code == 0:
            update_progress(key, {"status": "completed", "percent": "100.0"})
        else:
            err_msg = last_error or f"Exit code {exit_code}"
            if err_msg.upper().startswith("ERROR:"):
                err_msg = err_msg[6:].strip()
            update_progress(key, {"status": "error", "error": err_msg})


    t = threading.Thread(target=_log, daemon=True)
    t.start()
    return "started"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Suppress default noisy logging; print cleaner output
        print(f"  {self.address_string()} → {args[0]}")

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/health":
            # Check yt-dlp is reachable
            try:
                v = subprocess.check_output([YTDLP_BIN, "--version"],
                                            text=True, timeout=5).strip()
                
                # Check if ffmpeg is reachable
                ffmpeg_ok = False
                try:
                    subprocess.run([FFMPEG_BIN, "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=2)
                    ffmpeg_ok = True
                except Exception:
                    pass

                self._json(200, {
                    "status": "ok",
                    "yt_dlp_version": v,
                    "download_dir": DOWNLOAD_DIR,
                    "ffmpeg_installed": ffmpeg_ok
                })
            except Exception as e:
                self._json(503, {"status": "error", "detail": str(e)})

        elif parsed.path == "/formats":
            url = params.get("url", [None])[0]
            if not url:
                return self._json(400, {"error": "Missing ?url= parameter"})
            try:
                data = get_formats(url)
                self._json(200, data)
            except Exception as e:
                self._json(500, {"error": str(e)})

        elif parsed.path == "/progress":
            url = params.get("url", [None])[0]
            format_id = params.get("format_id", [None])[0]
            if not url or not format_id:
                return self._json(400, {"error": "Missing ?url= or ?format_id= parameter"})
            key = f"{url}|{format_id}"
            with progress_lock:
                progress = download_progress.get(key, {"status": "not_started"})
            self._json(200, progress)

        else:
            self._json(404, {"error": "Not found"})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/download":
            return self._json(404, {"error": "Not found"})

        length = int(self.headers.get("Content-Length", 0))
        body   = self.rfile.read(length)
        try:
            payload = json.loads(body)
        except Exception:
            return self._json(400, {"error": "Invalid JSON"})

        url       = payload.get("url")
        format_id = payload.get("format_id")
        merge_ext = payload.get("merge_ext", "mp4")
        out_dir   = payload.get("output_dir", DOWNLOAD_DIR)

        if not url or not format_id:
            return self._json(400, {"error": "Missing url or format_id"})

        try:
            status = trigger_download(url, format_id, merge_ext, out_dir)
            self._json(200, {"status": status, "output_dir": out_dir})
        except Exception as e:
            self._json(500, {"error": str(e)})


def run_tray(server_obj):
    def stop_action(icon, item):
        icon.stop()
        server_obj.shutdown()
        print("Server stopped from system tray.")
        os._exit(0)

    def open_dir(icon, item):
        os.startfile(DOWNLOAD_DIR)

    def open_github(icon, item):
        import webbrowser
        webbrowser.open("https://github.com/sizwinz/YtOP")

    # Generate icon in memory
    try:
        image = Image.new('RGB', (64, 64), color=(15, 15, 15))
        dc = ImageDraw.Draw(image)
        dc.ellipse((8, 8, 56, 56), fill=(255, 0, 0))
        dc.rectangle((28, 16, 36, 32), fill=(255, 255, 255))
        dc.polygon([(32, 48), (18, 30), (46, 30)], fill=(255, 255, 255))
    except Exception:
        # Fallback 1x1 red block if drawing fails
        image = Image.new('RGB', (64, 64), color=(255, 0, 0))

    menu = pystray.Menu(
        pystray.MenuItem("ytOP Server Running", lambda: None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Open Downloads Folder", open_dir),
        pystray.MenuItem("Open GitHub Repository", open_github),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Stop Server", stop_action)
    )

    icon = pystray.Icon("ytOP", image, "ytOP Local Server", menu)
    icon.run()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("██╗░░░██╗████████╗░█████╗░██████╗░")
    print("╚██╗░██╔╝╚══██╔══╝██╔══██╗██╔══██╗")
    print("░╚████╔╝░░░░██║░░░██║░░██║██████╔╝")
    print("░░╚██╔╝░░░░░██║░░░██║░░██║██╔═══╝░")
    print("░░░██║░░░░░░██║░░░╚█████╔╝██║░░░░░")
    print("░░░╚═╝░░░░░░╚═╝░░░░╚════╝░╚═╝░░░░░")
    print("╔══════════════════════════════════════════════════════╗")
    print("║   ytOP: yt-dlp Local Bridge Server                   ║")
    print(f"║   URL:      http://127.0.0.1:{PORT:<29}║")
    print(f"║   Save path: {DOWNLOAD_DIR[:39]:<40}║")
    print("║   GitHub:   https://github.com/sizwinz/YtOP       ║")
    print("║   Author:   sizwinz                               ║")
    if TRAY_AVAILABLE:
        print("║   System Tray: Active (Pystray enabled)              ║")
    else:
        print("║   System Tray: Inactive (pip install pystray Pillow) ║")
    print("╚══════════════════════════════════════════════════════╝")

    if TRAY_AVAILABLE:
        # Start server in a background thread
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        # Run pystray in the main thread (blocking)
        try:
            run_tray(server)
        except Exception as e:
            print(f"Failed to start tray: {e}. Falling back to console mode.")
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
    else:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
            sys.exit(0)