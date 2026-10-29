"""
music_manager.py - Scans directories, extracts audio metadata & album artwork,
and manages the music catalog for the Spotify server.
"""

import os
import re
import hashlib
import sqlite3
import wave
import contextlib
from database import get_connection

SUPPORTED_EXTENSIONS = ('.mp3', '.flac', '.m4a', '.wav', '.ogg', '.aac', '.wma')

# Optional mutagen import with robust fallback
try:
    import mutagen
    from mutagen.id3 import ID3, APIC
    from mutagen.flac import FLAC
    from mutagen.mp4 import MP4
    MUTAGEN_AVAILABLE = True
except ImportError:
    MUTAGEN_AVAILABLE = False

COVER_CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache", "covers")

def get_gradient_svg(title, artist, color_seed=None):
    """Generates an aesthetic SVG album cover for tracks lacking embedded artwork."""
    gradients = [
        ("#1DB954", "#191414"),
        ("#8B5CF6", "#1E1B4B"),
        ("#EC4899", "#831843"),
        ("#3B82F6", "#172554"),
        ("#F59E0B", "#78350F"),
        ("#06B6D4", "#164E63"),
        ("#10B981", "#064E3B"),
        ("#6366F1", "#312E81"),
    ]
    seed = (color_seed or abs(hash(title + artist))) % len(gradients)
    c1, c2 = gradients[seed]
    
    # Initials
    initials = "".join([w[0] for w in title.split()[:2] if w]).upper() or "SP"

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
  <defs>
    <linearGradient id="grad_{seed}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{c1}" />
      <stop offset="100%" stop-color="{c2}" />
    </linearGradient>
  </defs>
  <rect width="300" height="300" rx="16" fill="url(#grad_{seed})" />
  <!-- Musical vinyl grooves decoration -->
  <circle cx="150" cy="150" r="110" stroke="rgba(255,255,255,0.08)" stroke-width="2" fill="none" />
  <circle cx="150" cy="150" r="85" stroke="rgba(255,255,255,0.12)" stroke-width="2" fill="none" />
  <circle cx="150" cy="150" r="60" stroke="rgba(255,255,255,0.15)" stroke-width="2" fill="none" />
  <circle cx="150" cy="150" r="28" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.3)" stroke-width="2" />
  <text x="150" y="157" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">{initials}</text>
  <!-- Subtle Spotify waveform symbol -->
  <g fill="rgba(255,255,255,0.25)" transform="translate(110, 240)">
    <rect x="0" y="10" width="8" height="20" rx="4" />
    <rect x="16" y="0" width="8" height="30" rx="4" />
    <rect x="32" y="6" width="8" height="24" rx="4" />
    <rect x="48" y="14" width="8" height="16" rx="4" />
    <rect x="64" y="2" width="8" height="28" rx="4" />
  </g>
</svg>"""
    return svg

def extract_metadata_from_file(filepath):
    """Extracts title, artist, album, duration, bitrate, and cover art bytes."""
    basename = os.path.basename(filepath)
    name_no_ext, ext = os.path.splitext(basename)
    ext = ext.lower()

    title = name_no_ext
    artist = "Unknown Artist"
    album = "Unknown Album"
    genre = "General"
    year = ""
    duration = 0.0
    bitrate = 320
    cover_data = None
    cover_mime = None

    # Guess from filename if pattern 'Artist - Title'
    if " - " in name_no_ext:
        parts = name_no_ext.split(" - ", 1)
        artist = parts[0].strip()
        title = parts[1].strip()

    # Use Mutagen if installed
    if MUTAGEN_AVAILABLE:
        try:
            m = mutagen.File(filepath)
            if m is not None:
                if hasattr(m.info, 'length') and m.info.length:
                    duration = float(m.info.length)
                if hasattr(m.info, 'bitrate') and m.info.bitrate:
                    bitrate = int(m.info.bitrate // 1000)

                # ID3 (MP3)
                if hasattr(m, 'tags') and m.tags:
                    tags = m.tags
                    # Title
                    for key in ['TIT2', 'title', '\xa9nam']:
                        if key in tags:
                            val = tags[key]
                            title = str(val[0]) if isinstance(val, (list, tuple)) else str(val)
                            break
                    # Artist
                    for key in ['TPE1', 'artist', '\xa9ART']:
                        if key in tags:
                            val = tags[key]
                            artist = str(val[0]) if isinstance(val, (list, tuple)) else str(val)
                            break
                    # Album
                    for key in ['TALB', 'album', '\xa9alb']:
                        if key in tags:
                            val = tags[key]
                            album = str(val[0]) if isinstance(val, (list, tuple)) else str(val)
                            break
                    # Genre
                    for key in ['TCON', 'genre', '\xa9gen']:
                        if key in tags:
                            val = tags[key]
                            genre = str(val[0]) if isinstance(val, (list, tuple)) else str(val)
                            break
                    # Year
                    for key in ['TDRC', 'date', '\xa9day']:
                        if key in tags:
                            val = tags[key]
                            year = str(val[0]) if isinstance(val, (list, tuple)) else str(val)
                            break

                    # Extract APIC cover art
                    for tag_val in tags.values():
                        if hasattr(tag_val, 'data') and hasattr(tag_val, 'mime'):
                            cover_data = tag_val.data
                            cover_mime = tag_val.mime
                            break
                    if not cover_data and hasattr(m, 'pictures') and m.pictures:
                        cover_data = m.pictures[0].data
                        cover_mime = m.pictures[0].mime
        except Exception as e:
            # Fallback to standard parsing
            pass

    # Fallback duration for WAV files using built-in wave module
    if duration == 0.0 and ext == '.wav':
        try:
            with contextlib.closing(wave.open(filepath, 'r')) as w:
                frames = w.getnframes()
                rate = w.getframerate()
                if rate > 0:
                    duration = float(frames) / float(rate)
        except Exception:
            pass

    # Cleanup title from underscores
    title = title.replace('_', ' ').strip()
    artist = artist.replace('_', ' ').strip()
    album = album.replace('_', ' ').strip()

    return {
        "file_path": os.path.abspath(filepath),
        "title": title or "Unknown Track",
        "artist": artist or "Unknown Artist",
        "album": album or "Single",
        "genre": genre or "General",
        "year": year,
        "duration_seconds": round(duration, 2),
        "bitrate": bitrate,
        "file_format": ext.lstrip('.'),
        "cover_data": cover_data,
        "cover_mime": cover_mime
    }

def scan_and_sync_directories(directories):
    """Scans audio directories, saves covers, and synchronizes SQLite database."""
    os.makedirs(COVER_CACHE_DIR, exist_ok=True)
    conn = get_connection()
    cursor = conn.cursor()

    existing_paths = {row["file_path"] for row in conn.execute("SELECT file_path FROM tracks").fetchall()}
    
    found_count = 0
    new_count = 0

    for d in directories:
        if not os.path.exists(d):
            continue
        for root, _, files in os.walk(d):
            for f in sorted(files):
                ext = os.path.splitext(f)[1].lower()
                if ext in SUPPORTED_EXTENSIONS:
                    found_count += 1
                    fpath = os.path.abspath(os.path.join(root, f))
                    
                    if fpath in existing_paths:
                        continue
                        
                    meta = extract_metadata_from_file(fpath)
                    
                    has_cover = 0
                    # Save embedded cover art if present
                    if meta.get("cover_data"):
                        cov_hash = hashlib.md5(fpath.encode('utf-8')).hexdigest()
                        c_ext = ".jpg" if "jpeg" in (meta.get("cover_mime") or "").lower() else ".png"
                        cov_path = os.path.join(COVER_CACHE_DIR, f"{cov_hash}{c_ext}")
                        try:
                            with open(cov_path, "wb") as cf:
                                cf.write(meta["cover_data"])
                            has_cover = 1
                        except Exception:
                            has_cover = 0

                    cursor.execute("""
                    INSERT OR IGNORE INTO tracks 
                    (file_path, title, artist, album, genre, year, duration_seconds, bitrate, file_format, has_cover)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        meta["file_path"],
                        meta["title"],
                        meta["artist"],
                        meta["album"],
                        meta["genre"],
                        meta["year"],
                        meta["duration_seconds"],
                        meta["bitrate"],
                        meta["file_format"],
                        has_cover
                    ))
                    new_count += 1

    conn.commit()
    conn.close()
    print(f"Music scan complete: found {found_count} audio files, {new_count} newly indexed.")
    return {"total_found": found_count, "newly_added": new_count}

def seed_sample_metadata(sample_meta_list):
    """Applies high-yield lyrics, titles, and artists to synthesized starter tracks."""
    conn = get_connection()
    for fpath, meta in sample_meta_list:
        abs_path = os.path.abspath(fpath)
        conn.execute("""
        UPDATE tracks 
        SET title = ?, artist = ?, album = ?, genre = ?, year = ?, lyrics = ?
        WHERE file_path = ?
        """, (
            meta["title"],
            meta["artist"],
            meta["album"],
            meta["genre"],
            meta.get("year", "2026"),
            meta.get("lyrics", ""),
            abs_path
        ))
    conn.commit()
    conn.close()

