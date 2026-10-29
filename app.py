"""
app.py - High-Performance Self-Hosted Spotify Streaming Server
Provides HTTP Range-based audio streaming, metadata extraction, playlists, and REST APIs.
"""

import os
import re
import mimetypes
import hashlib
from flask import Flask, request, Response, jsonify, render_template, send_file, abort

import database
from music_manager import (
    scan_and_sync_directories,
    get_gradient_svg,
    seed_sample_metadata,
    COVER_CACHE_DIR,
    SUPPORTED_EXTENSIONS
)
from sample_music import generate_all_sample_tracks

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MUSIC_DIR = os.path.join(BASE_DIR, "music")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200 MB max upload

def format_duration(seconds):
    """Converts seconds into mm:ss string."""
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{mins}:{secs:02d}"

def init_server():
    """Initializes database and starter music library."""
    os.makedirs(MUSIC_DIR, exist_ok=True)
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    os.makedirs(COVER_CACHE_DIR, exist_ok=True)
    
    database.init_db()

    # If music folder is empty, generate atmospheric sample tracks
    existing_music = [f for f in os.listdir(MUSIC_DIR) if f.lower().endswith(SUPPORTED_EXTENSIONS)]
    if len(existing_music) < 3:
        samples_info = generate_all_sample_tracks(MUSIC_DIR)
        scan_and_sync_directories([MUSIC_DIR, UPLOADS_DIR])
        seed_sample_metadata(samples_info)
    else:
        scan_and_sync_directories([MUSIC_DIR, UPLOADS_DIR])

# Execute initialization
init_server()

# =============================================================================
# FRONTEND VIEWS
# =============================================================================
@app.route("/")
def index():
    return render_template("index.html")

# =============================================================================
# AUDIO STREAMING WITH HTTP RANGE SUPPORT (SEEK & SCRUB SUPPORT)
# =============================================================================
@app.route("/api/stream/<int:track_id>")
def stream_audio(track_id):
    track = database.get_track_by_id(track_id)
    if not track or not os.path.exists(track["file_path"]):
        return jsonify({"error": "Audio file not found on disk"}), 404

    filepath = track["file_path"]
    file_size = os.path.getsize(filepath)
    mime_type, _ = mimetypes.guess_type(filepath)
    if not mime_type:
        mime_type = "audio/mpeg" if filepath.endswith(".mp3") else "audio/wav"

    range_header = request.headers.get('Range', None)
    if not range_header:
        # Full file transmission
        with open(filepath, 'rb') as f:
            data = f.read()
        resp = Response(data, 200, mimetype=mime_type, direct_passthrough=True)
        resp.headers.add('Accept-Ranges', 'bytes')
        resp.headers.add('Content-Length', str(file_size))
        return resp

    # Parse byte range (e.g. bytes=1048576- or bytes=0-1048575)
    byte_match = re.search(r'bytes=(\d+)-(\d*)', range_header)
    if not byte_match:
        abort(416)

    start = int(byte_match.group(1))
    end = int(byte_match.group(2)) if byte_match.group(2) else file_size - 1

    if start >= file_size or end >= file_size or start > end:
        resp = Response("Requested Range Not Satisfiable", 416)
        resp.headers.add('Content-Range', f'bytes */{file_size}')
        return resp

    chunk_length = end - start + 1

    def generate_chunks():
        with open(filepath, 'rb') as f:
            f.seek(start)
            remaining = chunk_length
            while remaining > 0:
                chunk_to_read = min(64 * 1024, remaining)
                data = f.read(chunk_to_read)
                if not data:
                    break
                remaining -= len(data)
                yield data

    resp = Response(generate_chunks(), 206, mimetype=mime_type, direct_passthrough=True)
    resp.headers.add('Accept-Ranges', 'bytes')
    resp.headers.add('Content-Range', f'bytes {start}-{end}/{file_size}')
    resp.headers.add('Content-Length', str(chunk_length))
    return resp

# =============================================================================
# ALBUM ARTWORK API
# =============================================================================
@app.route("/api/cover/<int:track_id>")
def get_cover_art(track_id):
    track = database.get_track_by_id(track_id)
    if not track:
        abort(404)

    # Check for cached embedded cover
    if track.get("has_cover") == 1:
        cov_hash = hashlib.md5(track["file_path"].encode('utf-8')).hexdigest()
        for ext in ['.jpg', '.png', '.jpeg']:
            cov_path = os.path.join(COVER_CACHE_DIR, f"{cov_hash}{ext}")
            if os.path.exists(cov_path):
                return send_file(cov_path)

    # Serve custom SVG dynamic artwork with track initials and Spotify styling
    svg_code = get_gradient_svg(track["title"], track["artist"], color_seed=track["id"])
    return Response(svg_code, mimetype="image/svg+xml")

# =============================================================================
# TRACK & MUSIC APIs
# =============================================================================
@app.route("/api/tracks")
def api_get_tracks():
    sort_by = request.args.get("sort", "title")
    tracks = database.get_all_tracks(sort_by=sort_by)
    for t in tracks:
        t["duration_formatted"] = format_duration(t["duration_seconds"])
        t["stream_url"] = f"/api/stream/{t['id']}"
        t["cover_url"] = f"/api/cover/{t['id']}"
    return jsonify({"success": True, "tracks": tracks, "total": len(tracks)})

@app.route("/api/track/<int:track_id>")
def api_get_track(track_id):
    track = database.get_track_by_id(track_id)
    if not track:
        return jsonify({"success": False, "error": "Track not found"}), 404
    track["duration_formatted"] = format_duration(track["duration_seconds"])
    track["stream_url"] = f"/api/stream/{track['id']}"
    track["cover_url"] = f"/api/cover/{track['id']}"
    return jsonify({"success": True, "track": track})

@app.route("/api/like/<int:track_id>", methods=["POST"])
def api_toggle_like(track_id):
    new_status = database.toggle_favorite(track_id)
    if new_status is None:
        return jsonify({"success": False, "error": "Track not found"}), 404
    return jsonify({"success": True, "is_favorite": new_status})

@app.route("/api/liked")
def api_get_liked():
    tracks = database.get_favorites()
    for t in tracks:
        t["duration_formatted"] = format_duration(t["duration_seconds"])
        t["stream_url"] = f"/api/stream/{t['id']}"
        t["cover_url"] = f"/api/cover/{t['id']}"
    return jsonify({"success": True, "tracks": tracks, "total": len(tracks)})

@app.route("/api/history/<int:track_id>", methods=["POST"])
def api_record_play(track_id):
    database.record_play(track_id)
    return jsonify({"success": True})

@app.route("/api/history")
def api_get_history():
    history = database.get_history(limit=20)
    for t in history:
        t["duration_formatted"] = format_duration(t["duration_seconds"])
        t["stream_url"] = f"/api/stream/{t['id']}"
        t["cover_url"] = f"/api/cover/{t['id']}"
    return jsonify({"success": True, "history": history})

# =============================================================================
# PLAYLISTS APIs
# =============================================================================
@app.route("/api/playlists", methods=["GET"])
def api_get_playlists():
    playlists = database.get_playlists()
    return jsonify({"success": True, "playlists": playlists})

@app.route("/api/playlists", methods=["POST"])
def api_create_playlist():
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"success": False, "error": "Playlist name is required"}), 400
    desc = data.get("description", "").strip()
    color = data.get("color", "#1DB954")
    p_id = database.create_playlist(name, desc, color)
    return jsonify({"success": True, "id": p_id, "name": name})

@app.route("/api/playlists/<int:playlist_id>")
def api_get_playlist(playlist_id):
    details = database.get_playlist_details(playlist_id)
    if not details:
        return jsonify({"success": False, "error": "Playlist not found"}), 404
    for t in details["tracks"]:
        t["duration_formatted"] = format_duration(t["duration_seconds"])
        t["stream_url"] = f"/api/stream/{t['id']}"
        t["cover_url"] = f"/api/cover/{t['id']}"
    return jsonify({"success": True, **details})

@app.route("/api/playlists/<int:playlist_id>/add", methods=["POST"])
def api_add_to_playlist(playlist_id):
    data = request.get_json() or {}
    track_id = data.get("track_id")
    if not track_id:
        return jsonify({"success": False, "error": "track_id is required"}), 400
    res = database.add_track_to_playlist(playlist_id, track_id)
    return jsonify({"success": res})

@app.route("/api/playlists/<int:playlist_id>/remove/<int:track_id>", methods=["DELETE"])
def api_remove_from_playlist(playlist_id, track_id):
    res = database.remove_track_from_playlist(playlist_id, track_id)
    return jsonify({"success": res})

# =============================================================================
# SEARCH & STATS
# =============================================================================
@app.route("/api/search")
def api_search():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"success": True, "tracks": []})
    tracks = database.search_tracks(q)
    for t in tracks:
        t["duration_formatted"] = format_duration(t["duration_seconds"])
        t["stream_url"] = f"/api/stream/{t['id']}"
        t["cover_url"] = f"/api/cover/{t['id']}"
    return jsonify({"success": True, "tracks": tracks, "query": q, "total": len(tracks)})

@app.route("/api/stats")
def api_stats():
    stats = database.get_stats()
    return jsonify({"success": True, **stats})

# =============================================================================
# FILE UPLOAD & RE-SCAN APIs
# =============================================================================
@app.route("/api/upload", methods=["POST"])
def api_upload_audio():
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "No file uploaded"}), 400
    f = request.files['file']
    if not f or f.filename == '':
        return jsonify({"success": False, "error": "Empty filename"}), 400

    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        return jsonify({"success": False, "error": f"Unsupported format. Allowed: {', '.join(SUPPORTED_EXTENSIONS)}"}), 400

    safe_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', f.filename)
    dest_path = os.path.join(UPLOADS_DIR, safe_name)
    f.save(dest_path)

    # Re-scan to index new song
    scan_and_sync_directories([MUSIC_DIR, UPLOADS_DIR])
    return jsonify({"success": True, "message": f"Successfully uploaded and indexed {safe_name}"})

@app.route("/api/scan", methods=["POST"])
def api_trigger_scan():
    res = scan_and_sync_directories([MUSIC_DIR, UPLOADS_DIR])
    return jsonify({"success": True, **res})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print(f"🎵 Spotify Streaming Server running on http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)

