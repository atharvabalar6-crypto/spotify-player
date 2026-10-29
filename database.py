"""
database.py - SQLite storage for Spotify self-hosted streaming server
Tracks, playlists, favorites, play history, and metadata.
"""

import os
import sqlite3
import time

DB_PATH = os.path.join(os.path.dirname(__file__), "spotify.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Tracks table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        artist TEXT DEFAULT 'Unknown Artist',
        album TEXT DEFAULT 'Unknown Album',
        genre TEXT DEFAULT 'Chill / Lo-Fi',
        year TEXT DEFAULT '',
        duration_seconds REAL DEFAULT 0.0,
        bitrate INTEGER DEFAULT 320,
        file_format TEXT DEFAULT 'mp3',
        has_cover INTEGER DEFAULT 0,
        play_count INTEGER DEFAULT 0,
        is_favorite INTEGER DEFAULT 0,
        lyrics TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Playlists table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        cover_color TEXT DEFAULT '#1DB954',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Playlist tracks mapping
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS playlist_tracks (
        playlist_id INTEGER NOT NULL,
        track_id INTEGER NOT NULL,
        position INTEGER DEFAULT 0,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (playlist_id, track_id),
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    )
    """)

    # Listening history
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id INTEGER NOT NULL,
        played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    )
    """)

    # Create default playlists if none exist
    cursor.execute("SELECT COUNT(*) FROM playlists")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO playlists (name, description, cover_color) VALUES (?, ?, ?)",
                       ("Chill Beats & Focus", "Mellow rhythms and relaxing instrumental vibrations", "#3b82f6"))
        cursor.execute("INSERT INTO playlists (name, description, cover_color) VALUES (?, ?, ?)",
                       ("Late Night Drive", "Atmospheric synthwave and midnight melodies", "#ec4899"))
        cursor.execute("INSERT INTO playlists (name, description, cover_color) VALUES (?, ?, ?)",
                       ("Daily Motivation", "Uplifting tempo and energetic harmonies", "#eab308"))

    conn.commit()
    conn.close()

def get_all_tracks(sort_by="title"):
    conn = get_connection()
    allowed_sorts = {
        "title": "title COLLATE NOCASE ASC",
        "artist": "artist COLLATE NOCASE ASC, title COLLATE NOCASE ASC",
        "album": "album COLLATE NOCASE ASC, title COLLATE NOCASE ASC",
        "recent": "id DESC",
        "plays": "play_count DESC, id DESC"
    }
    order_clause = allowed_sorts.get(sort_by, "title COLLATE NOCASE ASC")
    rows = conn.execute(f"SELECT * FROM tracks ORDER BY {order_clause}").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_track_by_id(track_id):
    conn = get_connection()
    row = conn.execute("SELECT * FROM tracks WHERE id = ?", (track_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def toggle_favorite(track_id):
    conn = get_connection()
    row = conn.execute("SELECT is_favorite FROM tracks WHERE id = ?", (track_id,)).fetchone()
    if not row:
        conn.close()
        return None
    new_status = 0 if row["is_favorite"] == 1 else 1
    conn.execute("UPDATE tracks SET is_favorite = ? WHERE id = ?", (new_status, track_id))
    conn.commit()
    conn.close()
    return new_status

def get_favorites():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM tracks WHERE is_favorite = 1 ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def record_play(track_id):
    conn = get_connection()
    conn.execute("UPDATE tracks SET play_count = play_count + 1 WHERE id = ?", (track_id,))
    conn.execute("INSERT INTO history (track_id) VALUES (?)", (track_id,))
    conn.commit()
    conn.close()

def get_history(limit=20):
    conn = get_connection()
    rows = conn.execute("""
        SELECT h.id as history_id, h.played_at, t.*
        FROM history h
        JOIN tracks t ON h.track_id = t.id
        ORDER BY h.id DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_playlists():
    conn = get_connection()
    rows = conn.execute("""
        SELECT p.*, COUNT(pt.track_id) as track_count
        FROM playlists p
        LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
        GROUP BY p.id
        ORDER BY track_count DESC, p.name COLLATE NOCASE ASC, p.id ASC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_playlist_details(playlist_id):
    conn = get_connection()
    p_row = conn.execute("SELECT * FROM playlists WHERE id = ?", (playlist_id,)).fetchone()
    if not p_row:
        conn.close()
        return None
    tracks = conn.execute("""
        SELECT t.*, pt.position, pt.added_at
        FROM playlist_tracks pt
        JOIN tracks t ON pt.track_id = t.id
        WHERE pt.playlist_id = ?
        ORDER BY pt.position ASC, pt.added_at ASC
    """, (playlist_id,)).fetchall()
    conn.close()
    return {
        "playlist": dict(p_row),
        "tracks": [dict(t) for t in tracks]
    }

def create_playlist(name, description="", cover_color="#1DB954"):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO playlists (name, description, cover_color) VALUES (?, ?, ?)",
                   (name, description, cover_color))
    p_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return p_id

def add_track_to_playlist(playlist_id, track_id):
    conn = get_connection()
    pos_row = conn.execute("SELECT MAX(position) as max_pos FROM playlist_tracks WHERE playlist_id = ?", (playlist_id,)).fetchone()
    next_pos = (pos_row["max_pos"] or 0) + 1
    try:
        conn.execute("INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)",
                     (playlist_id, track_id, next_pos))
        conn.commit()
        success = True
    except sqlite3.IntegrityError:
        success = False
    conn.close()
    return success

def remove_track_from_playlist(playlist_id, track_id):
    conn = get_connection()
    conn.execute("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?", (playlist_id, track_id))
    conn.commit()
    conn.close()
    return True

def search_tracks(query):
    conn = get_connection()
    q = f"%{query}%"
    rows = conn.execute("""
        SELECT * FROM tracks
        WHERE title LIKE ? OR artist LIKE ? OR album LIKE ? OR genre LIKE ?
        ORDER BY title COLLATE NOCASE ASC
    """, (q, q, q, q)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_stats():
    conn = get_connection()
    total_tracks = conn.execute("SELECT COUNT(*) FROM tracks").fetchone()[0]
    total_artists = conn.execute("SELECT COUNT(DISTINCT artist) FROM tracks").fetchone()[0]
    total_albums = conn.execute("SELECT COUNT(DISTINCT album) FROM tracks").fetchone()[0]
    total_playlists = conn.execute("SELECT COUNT(*) FROM playlists").fetchone()[0]
    total_seconds = conn.execute("SELECT SUM(duration_seconds) FROM tracks").fetchone()[0] or 0.0
    conn.close()
    return {
        "total_tracks": total_tracks,
        "total_artists": total_artists,
        "total_albums": total_albums,
        "total_playlists": total_playlists,
        "total_duration_minutes": round(total_seconds / 60, 1)
    }

if __name__ == "__main__":
    init_db()
    print("Spotify database initialized successfully.")

