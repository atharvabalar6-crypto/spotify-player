import os
import sys
import json
import re
import shutil
import sqlite3
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
import mutagen
from mutagen.flac import FLAC

FFMPEG_PATH = r"C:\Users\athar\AppData\Local\Python\pythoncore-3.14-64\Scripts\ffmpeg.exe"
YTDLP_PATH = r"C:\Users\athar\AppData\Local\Python\pythoncore-3.14-64\Scripts\yt-dlp.exe"

MUSIC_DIR = r"D:\Projects\code\music"
SPOTIFY_DIR = r"D:\Projects\code\Spotify"
SPOTIFY_MUSIC_DIR = os.path.join(SPOTIFY_DIR, "music")
DB_PATH = os.path.join(SPOTIFY_DIR, "spotify.db")

os.makedirs(MUSIC_DIR, exist_ok=True)
os.makedirs(SPOTIFY_MUSIC_DIR, exist_ok=True)

def clean_filename(s):
    # Fix known encoding artifacts
    s = s.replace('\ufffd', 'ñ').replace('', 'ñ')
    s = s.replace('\xa0', ' ').replace('\u200b', '')
    # Strip forbidden Windows filename characters
    s = re.sub(r'[<>:"/\\|?*]', '', s)
    return s.strip()

def clean_metadata(s):
    s = s.replace('\ufffd', 'ñ').replace('', 'ñ')
    s = s.replace('\xa0', ' ').replace('\u200b', '')
    return s.strip()

# Load tracklist from next_data.json
with open(r"D:\Projects\code\next_data.json", encoding="utf-8") as f:
    data = json.load(f)

entity = data['props']['pageProps']['state']['data']['entity']
raw_track_list = entity.get('trackList', [])
playlist_title = entity.get('title', 'My playlist #2')

tracks = []
for idx, t in enumerate(raw_track_list, 1):
    title = clean_metadata(t.get('title', ''))
    artist = clean_metadata(t.get('subtitle', ''))
    duration_ms = t.get('duration', 0)
    
    file_title = clean_filename(title)
    file_artist = clean_filename(artist)
    filename = f"{idx:02d} - {file_title} - {file_artist}.flac"
    filepath = os.path.join(MUSIC_DIR, filename)
    
    # Precise search query
    query = f"{artist} - {title} official audio"
    
    tracks.append({
        "index": idx,
        "title": title,
        "artist": artist,
        "filename": filename,
        "filepath": filepath,
        "query": query,
        "duration_sec": round(duration_ms / 1000.0, 1) if duration_ms else 0.0
    })

print(f"Loaded {len(tracks)} tracks for playlist '{playlist_title}'.")

def download_track(item):
    idx = item["index"]
    filepath = item["filepath"]
    out_template = filepath.replace(".flac", ".%(ext)s")
    
    # Check if FLAC already exists and is valid (> 100KB)
    if os.path.exists(filepath) and os.path.getsize(filepath) > 100000:
        print(f"[{idx:02d}/41] Already exists: {item['title']} by {item['artist']}")
        tag_flac(filepath, item)
        return {"index": idx, "status": "exists", "track": item}

    print(f"[{idx:02d}/41] Downloading: {item['title']} - {item['artist']}...")
    
    cmd = [
        YTDLP_PATH,
        f"ytsearch1:{item['query']}",
        "-x",
        "--audio-format", "flac",
        "--audio-quality", "0",
        "--ffmpeg-location", FFMPEG_PATH,
        "--embed-thumbnail",
        "-o", out_template,
        "--no-playlist",
        "--retries", "3"
    ]
    
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        # Fallback query without 'official audio'
        alt_cmd = [
            YTDLP_PATH,
            f"ytsearch1:{item['artist']} {item['title']}",
            "-x",
            "--audio-format", "flac",
            "--audio-quality", "0",
            "--ffmpeg-location", FFMPEG_PATH,
            "--embed-thumbnail",
            "-o", out_template,
            "--no-playlist"
        ]
        res = subprocess.run(alt_cmd, capture_output=True, text=True)

    if os.path.exists(filepath):
        tag_flac(filepath, item)
        print(f"[{idx:02d}/41] Successfully completed: {item['title']}")
        return {"index": idx, "status": "downloaded", "track": item}
    else:
        print(f"[{idx:02d}/41] FAILED: {item['title']} - {res.stderr[:200]}")
        return {"index": idx, "status": "failed", "track": item}

def tag_flac(filepath, item):
    try:
        f = FLAC(filepath)
        f['title'] = item['title']
        f['artist'] = item['artist']
        f['album'] = playlist_title
        f['tracknumber'] = str(item['index'])
        f['totaltracks'] = str(len(tracks))
        f.save()
    except Exception as e:
        print(f"Error tagging {filepath}: {e}")

# Download in parallel using ThreadPoolExecutor (3 workers)
print("Starting parallel lossless FLAC downloads (3 concurrent workers)...")
results = []
with ThreadPoolExecutor(max_workers=3) as executor:
    futures = {executor.submit(download_track, t): t for t in tracks}
    for future in as_completed(futures):
        results.append(future.result())

# Sort results by index
results.sort(key=lambda r: r["index"])
success_count = sum(1 for r in results if r["status"] in ("downloaded", "exists"))
print(f"\nFinished downloading: {success_count}/{len(tracks)} tracks successful.")

# Generate M3U8 playlist in D:\Projects\code\music\
m3u8_path = os.path.join(MUSIC_DIR, f"{clean_filename(playlist_title)}.m3u8")
m3u_path = os.path.join(MUSIC_DIR, f"{clean_filename(playlist_title)}.m3u")
with open(m3u8_path, "w", encoding="utf-8") as m3u:
    m3u.write("#EXTM3U\n")
    for t in tracks:
        m3u.write(f"#EXTINF:{int(t['duration_sec'])},{t['artist']} - {t['title']}\n")
        m3u.write(f"{t['filename']}\n")

shutil.copyfile(m3u8_path, m3u_path)
print(f"Generated M3U8 and M3U playlists at:\n  {m3u8_path}\n  {m3u_path}")

# Now upload / copy to Spotify app folder D:\Projects\code\Spotify\music
print("\nSyncing tracks to Spotify server music directory...")
for t in tracks:
    src = t["filepath"]
    if os.path.exists(src):
        dst = os.path.join(SPOTIFY_MUSIC_DIR, t["filename"])
        if not os.path.exists(dst) or os.path.getsize(dst) != os.path.getsize(src):
            shutil.copy2(src, dst)

print("Music files synced to Spotify music folder.")

# Register in Spotify database
sys.path.insert(0, SPOTIFY_DIR)
import music_manager

print("Scanning music directory into Spotify database...")
scan_res = music_manager.scan_and_sync_directories([SPOTIFY_MUSIC_DIR, MUSIC_DIR])
print(f"Scan complete: {scan_res}")

# Add to playlists table and playlist_tracks in spotify.db
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Find or create playlist
cursor.execute("SELECT id FROM playlists WHERE name = ?", (playlist_title,))
row = cursor.fetchone()
if row:
    playlist_id = row['id']
    print(f"Existing playlist found with id={playlist_id}.")
    # Clear existing track mappings for fresh orientation
    cursor.execute("DELETE FROM playlist_tracks WHERE playlist_id = ?", (playlist_id,))
else:
    cursor.execute("""
        INSERT INTO playlists (name, description, cover_color)
        VALUES (?, ?, ?)
    """, (playlist_title, "Imported from Spotify: https://open.spotify.com/playlist/29FEirrmCmacrCetrJAGjy (41 Lossless FLAC tracks)", "#1DB954"))
    playlist_id = cursor.lastrowid
    print(f"Created new playlist '{playlist_title}' with id={playlist_id}.")

# Insert tracks in exact orientation (order 1..41)
added_count = 0
for t in tracks:
    # Match track in database by filename or title
    cursor.execute("""
        SELECT id FROM tracks 
        WHERE file_path LIKE ? OR title = ?
        LIMIT 1
    """, (f"%{t['filename']}", t['title']))
    db_track = cursor.fetchone()
    if db_track:
        track_id = db_track['id']
        cursor.execute("""
            INSERT OR REPLACE INTO playlist_tracks (playlist_id, track_id, position)
            VALUES (?, ?, ?)
        """, (playlist_id, track_id, t['index']))
        added_count += 1
    else:
        print(f"Warning: Track not found in DB for: {t['filename']}")

conn.commit()
conn.close()

print(f"\nAll done! Added {added_count} tracks to playlist '{playlist_title}' (id={playlist_id}) in exact order 1..41!")
