# Spotify — Personal Self-Hosted Music Streaming Server

A personal, self-hosted music streaming server and web player styled after Spotify's desktop & web interface.

Built with a lightweight **Python (Flask)** backend with HTTP Range-based audio streaming and a **Modern HTML5 / Tailwind CSS / Vanilla JS** frontend.

---

## 🌟 Key Features

1. **Authentic Spotify UI & Dark Theme**:
   - Signature Spotify green (`#1DB954`), deep dark background (`#121212`), elevated surfaces (`#181818`), and hover card animations.
   - Dynamic greetings ("Good morning", "Good afternoon", "Good evening") based on current time.
   - Top 6 quick-play cards with hover play-button reveal.

2. **HTTP Range-Based Audio Streaming**:
   - Native HTTP `206 Partial Content` streaming with `Range: bytes=START-END`.
   - Allows instant seeking and scrubbing forward/backward anywhere in a track without having to download the entire audio file.

3. **Real-Time Audio Spectrum Visualizer**:
   - Powered by Web Audio API (`AudioContext` and `AnalyserNode`).
   - Live canvas rendering with animated green gradient spectrum frequency bars bouncing to the music.

4. **5-Band Graphic Equalizer & Sound Presets**:
   - 5-band parametric equalizer (60Hz, 310Hz, 1kHz, 6kHz, 16kHz) utilizing `BiquadFilterNode`.
   - One-click presets: **Bass Boost**, **Vocal**, **Pop**, **Rock**, **Electronic**, and **Flat**.

5. **Synchronized Karaoke Scrolling Lyrics**:
   - Parses standard timestamped LRC lyrics (`[00:15.50] ...`).
   - Automatically highlights the currently active singing line in bold white and scrolls smoothly to center.
   - Click any lyric line to jump playback directly to that timestamp.

6. **Drag & Drop Audio Uploader**:
   - Simply drag and drop any audio file (`.mp3`, `.flac`, `.m4a`, `.wav`, `.ogg`, `.aac`) onto the browser window.
   - The server automatically saves the file, parses metadata (Title, Artist, Album), extracts embedded album artwork, and indexes it into your library.

7. **Starter Atmospheric Music Library Out-of-the-Box**:
   - Synthesizes 5 atmospheric ambient, lo-fi, and synthwave starter tracks with complete lyrics, artists, and album covers if your music folder is empty.

8. **Playlists, Liked Songs & Search**:
   - Add/remove songs to custom playlists with customizable color badges.
   - Dedicated "Liked Songs" view with heart toggles and instant library search.

9. **Native OS Media Keys Integration (MediaSession API)**:
   - Synchronizes current song title, artist, and album artwork with Windows / macOS / mobile lock-screen media overlays.
   - Responds to hardware keyboard Play, Pause, Next, and Previous media keys.

---

## 🚀 Quick Start Guide

### 1. Requirements
Ensure Python 3.9+ is installed. Install the lightweight dependencies:
```bash
pip install -r requirements.txt
```

### 2. Run the Server
Double-click `run.bat` or run:
```bash
python app.py
```

### 3. Open Web Player
Open your browser and navigate to:
👉 **[http://localhost:8080](http://localhost:8080)**

---

## 📁 Folder Structure

```
D:\Projects\code\Spotify\
├── app.py                     # Flask server with Range streaming & REST APIs
├── database.py                # SQLite database (tracks, playlists, favorites, history)
├── music_manager.py           # Audio scanner, ID3/metadata reader, cover art extractor
├── sample_music.py            # Starter music synthesizer for instant out-of-the-box play
├── requirements.txt           # Python dependencies (Flask, mutagen)
├── run.bat                    # Windows 1-click launcher
├── README.md                  # Complete documentation
├── music/                     # Place your local MP3 / audio files here
├── uploads/                   # Files uploaded via browser drag-and-drop
├── cache/covers/              # Extracted and cached album artwork
├── static/
│   ├── css/spotify.css        # Spotify styling, custom sliders, scrollbars
│   └── js/
│       ├── player.js          # Audio engine, visualizer, equalizer, queue
│       └── ui.js              # Spotify views, lyrics sync, modals, keyboard events
└── templates/
    └── index.html             # Full Spotify Web Player interface
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Space` | Play / Pause |
| `Arrow Right` | Seek Forward 5 Seconds |
| `Arrow Left` | Seek Backward 5 Seconds |
| `Arrow Up` | Increase Volume (+5%) |
| `Arrow Down` | Decrease Volume (-5%) |
| `M` | Mute / Unmute |
| `L` | Toggle Like (Save to Liked Songs) |

