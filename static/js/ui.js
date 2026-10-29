/**
 * ui.js - Interactive UI Controllers for Spotify Web Streaming Interface
 */

let allTracks = [];
let allPlaylists = [];
let currentView = 'home';
let currentPlaylistId = null;
let parsedLyrics = [];

// Format seconds into MM:SS
function formatTime(sec) {
  if (isNaN(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Dynamic Spotify Greeting
function getGreeting() {
  const hr = new Date().getHours();
  if (hr < 12) return "Good morning";
  if (hr < 18) return "Good afternoon";
  return "Good evening";
}

// Parse LRC style timestamps: [00:15.50] Lyric line
function parseLrcLyrics(lrcText) {
  if (!lrcText) return [];
  const lines = lrcText.split('\n');
  const result = [];
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/;

  lines.forEach(line => {
    const match = timeRegex.exec(line);
    if (match) {
      const min = parseInt(match[1]);
      const sec = parseInt(match[2]);
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0')) : 0;
      const totalSec = min * 60 + sec + ms / 1000;
      const text = line.replace(timeRegex, '').trim();
      if (text) {
        result.push({ time: totalSec, text: text });
      }
    } else if (line.trim()) {
      result.push({ time: -1, text: line.trim() });
    }
  });
  return result;
}

// Document Ready
document.addEventListener('DOMContentLoaded', () => {
  initPlayerControls();
  initNavigation();
  initDragAndDrop();
  initModals();
  initKeyboardShortcuts();
  loadInitialData();

  // Attach Visualizer Canvas
  const canvas = document.getElementById('audioVisualizer');
  if (canvas) {
    window.spotifyPlayer.attachVisualizer(canvas);
  }
});

function initPlayerControls() {
  const player = window.spotifyPlayer;
  const btnPlay = document.getElementById('btnPlay');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnShuffle = document.getElementById('btnShuffle');
  const btnRepeat = document.getElementById('btnRepeat');
  const progressSlider = document.getElementById('progressSlider');
  const volumeSlider = document.getElementById('volumeSlider');
  const btnMute = document.getElementById('btnMute');
  const btnLikeCurrent = document.getElementById('btnLikeCurrent');

  btnPlay.addEventListener('click', () => player.togglePlay());
  btnPrev.addEventListener('click', () => player.prev());
  btnNext.addEventListener('click', () => player.next());

  btnShuffle.addEventListener('click', () => {
    const isShuff = player.toggleShuffle();
    btnShuffle.classList.toggle('text-[#1DB954]', isShuff);
    btnShuffle.classList.toggle('text-white', isShuff);
  });

  btnRepeat.addEventListener('click', () => {
    const mode = player.toggleRepeat();
    btnRepeat.classList.toggle('text-[#1DB954]', mode !== 'off');
    btnRepeat.title = `Repeat: ${mode.toUpperCase()}`;
    const badge = document.getElementById('repeatModeBadge');
    if (badge) {
      badge.textContent = mode === 'one' ? '1' : '';
      badge.classList.toggle('hidden', mode !== 'one');
    }
  });

  // Progress Bar
  progressSlider.addEventListener('input', (e) => {
    const pct = parseFloat(e.target.value) / 100;
    player.seekPercent(pct);
  });

  // Volume Bar
  volumeSlider.addEventListener('input', (e) => {
    player.setVolume(parseFloat(e.target.value) / 100);
  });

  btnMute.addEventListener('click', () => player.toggleMute());

  // Like currently playing
  btnLikeCurrent.addEventListener('click', () => {
    if (!player.currentTrack) return;
    toggleTrackLike(player.currentTrack.id);
  });

  // Player Callbacks
  player.on('stateChange', ({ isPlaying }) => {
    const iconPlay = document.getElementById('iconPlay');
    const iconPause = document.getElementById('iconPause');
    if (isPlaying) {
      iconPlay.classList.add('hidden');
      iconPause.classList.remove('hidden');
    } else {
      iconPlay.classList.remove('hidden');
      iconPause.classList.add('hidden');
    }
    updateActivePlayingRow();
  });

  player.on('timeUpdate', ({ currentTime, duration }) => {
    document.getElementById('timeCurrent').textContent = formatTime(currentTime);
    document.getElementById('timeDuration').textContent = formatTime(duration);
    if (duration > 0) {
      const pct = (currentTime / duration) * 100;
      progressSlider.value = pct;
      progressSlider.style.background = `linear-gradient(to right, #1DB954 ${pct}%, #4d4d4d ${pct}%)`;
    }
    syncLyrics(currentTime);
  });

  player.on('trackChange', (track) => {
    document.getElementById('currentTitle').textContent = track.title;
    document.getElementById('currentArtist').textContent = track.artist;
    document.getElementById('currentCover').src = track.cover_url;

    // Update heart state
    btnLikeCurrent.classList.toggle('text-[#1DB954]', track.is_favorite === 1);
    btnLikeCurrent.classList.toggle('text-slate-400', track.is_favorite !== 1);

    updateActivePlayingRow();
    renderQueueList();

    // Prepare lyrics
    parsedLyrics = parseLrcLyrics(track.lyrics);
    renderLyricsView();
  });

  player.on('volumeChange', ({ volume, isMuted }) => {
    volumeSlider.value = isMuted ? 0 : volume * 100;
    const volPct = isMuted ? 0 : volume * 100;
    volumeSlider.style.background = `linear-gradient(to right, #1DB954 ${volPct}%, #4d4d4d ${volPct}%)`;

    // Icon updates
    const iconVolHigh = document.getElementById('iconVolHigh');
    const iconVolMuted = document.getElementById('iconVolMuted');
    if (isMuted || volume === 0) {
      iconVolHigh.classList.add('hidden');
      iconVolMuted.classList.remove('hidden');
    } else {
      iconVolHigh.classList.remove('hidden');
      iconVolMuted.classList.add('hidden');
    }
  });
}

function initNavigation() {
  document.getElementById('navHome').addEventListener('click', () => switchView('home'));
  document.getElementById('navSearch').addEventListener('click', () => switchView('search'));
  document.getElementById('navLibrary').addEventListener('click', () => switchView('library'));
  document.getElementById('navLiked').addEventListener('click', () => switchView('liked'));

  // Search input live trigger
  const searchInput = document.getElementById('searchInput');
  let searchTimer = null;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      performSearch(e.target.value.trim());
    }, 250);
  });

  // Right sidebar toggles (Lyrics & Queue)
  document.getElementById('btnToggleLyrics').addEventListener('click', () => toggleDrawer('lyrics'));
  document.getElementById('btnToggleQueue').addEventListener('click', () => toggleDrawer('queue'));
  document.getElementById('btnToggleEq').addEventListener('click', () => openEqualizerModal());
}

function switchView(viewName, meta = null) {
  currentView = viewName;

  // Nav highlighting
  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('text-white'));
  const activeNav = document.getElementById(`nav${viewName.charAt(0).toUpperCase() + viewName.slice(1)}`);
  if (activeNav) activeNav.classList.add('text-white');

  // Containers
  document.getElementById('viewHome').classList.toggle('hidden', viewName !== 'home');
  document.getElementById('viewSearch').classList.toggle('hidden', viewName !== 'search');
  document.getElementById('viewLiked').classList.toggle('hidden', viewName !== 'liked');
  document.getElementById('viewPlaylist').classList.toggle('hidden', viewName !== 'playlist');

  if (viewName === 'home') {
    renderHomeView();
  } else if (viewName === 'search') {
    document.getElementById('searchInput').focus();
  } else if (viewName === 'liked') {
    loadLikedView();
  } else if (viewName === 'playlist' && meta?.id) {
    loadPlaylistView(meta.id);
  }

  // Scroll to top of main view
  document.getElementById('mainContent').scrollTop = 0;
}

function toggleDrawer(type) {
  const drawer = document.getElementById('rightDrawer');
  const lyricsContent = document.getElementById('drawerLyrics');
  const queueContent = document.getElementById('drawerQueue');

  const isCurrentlyOpen = !drawer.classList.contains('hidden');
  const isSameType = (type === 'lyrics' && !lyricsContent.classList.contains('hidden')) ||
                     (type === 'queue' && !queueContent.classList.contains('hidden'));

  if (isCurrentlyOpen && isSameType) {
    drawer.classList.add('hidden');
  } else {
    drawer.classList.remove('hidden');
    lyricsContent.classList.toggle('hidden', type !== 'lyrics');
    queueContent.classList.toggle('hidden', type !== 'queue');
  }
}

// Static fallback tracks for serverless / GitHub Pages deployment
const STATIC_FALLBACK_TRACKS = [
  {
    "id": 49,
    "title": "Missing Piece",
    "artist": "John Michael Howell",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 131.34,
    "duration_formatted": "2:11",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 1,
    "lyrics": "[00:01.00] Missing Piece - John Michael Howell\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #1 in My playlist #2"
  },
  {
    "id": 50,
    "title": "A Thousand Years",
    "artist": "John Michael Howell, JVKE, ZVC",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 181.44,
    "duration_formatted": "3:01",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 1,
    "lyrics": "[00:01.00] A Thousand Years - John Michael Howell, JVKE, ZVC\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #2 in My playlist #2"
  },
  {
    "id": 51,
    "title": "There's Nothing Holdin' Me Back",
    "artist": "Shawn Mendes",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 205.02,
    "duration_formatted": "3:25",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 1,
    "lyrics": "[00:01.00] There's Nothing Holdin' Me Back - Shawn Mendes\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #3 in My playlist #2"
  },
  {
    "id": 52,
    "title": "Mood",
    "artist": "Dreaming High",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 149.16,
    "duration_formatted": "2:29",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 1,
    "lyrics": "[00:01.00] Mood - Dreaming High\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #4 in My playlist #2"
  },
  {
    "id": 53,
    "title": "Youngblood",
    "artist": "5 Seconds of Summer",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 203.41,
    "duration_formatted": "3:23",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 1,
    "lyrics": "[00:01.00] Youngblood - 5 Seconds of Summer\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #5 in My playlist #2"
  },
  {
    "id": 54,
    "title": "Counting Stars",
    "artist": "OneRepublic",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 283.05,
    "duration_formatted": "4:43",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Counting Stars - OneRepublic\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #6 in My playlist #2"
  },
  {
    "id": 55,
    "title": "Stereo Hearts (feat. Adam Levine)",
    "artist": "Gym Class Heroes, Adam Levine",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 216.74,
    "duration_formatted": "3:36",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Stereo Hearts (feat. Adam Levine) - Gym Class Heroes, Adam Levine\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #7 in My playlist #2"
  },
  {
    "id": 56,
    "title": "Let Me Down Slowly",
    "artist": "Alec Benjamin",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 169.18,
    "duration_formatted": "2:49",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Let Me Down Slowly - Alec Benjamin\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #8 in My playlist #2"
  },
  {
    "id": 57,
    "title": "Cradles",
    "artist": "Sub Urban",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 218.64,
    "duration_formatted": "3:38",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Cradles - Sub Urban\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #9 in My playlist #2"
  },
  {
    "id": 58,
    "title": "No Lie",
    "artist": "Sean Paul, Dua Lipa",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 228.53,
    "duration_formatted": "3:48",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] No Lie - Sean Paul, Dua Lipa\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #10 in My playlist #2"
  },
  {
    "id": 59,
    "title": "death bed (coffee for your head)",
    "artist": "Powfu, beabadoobee",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 173.78,
    "duration_formatted": "2:53",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] death bed (coffee for your head) - Powfu, beabadoobee\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #11 in My playlist #2"
  },
  {
    "id": 60,
    "title": "Unstoppable",
    "artist": "Sia",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 220.06,
    "duration_formatted": "3:40",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Unstoppable - Sia\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #12 in My playlist #2"
  },
  {
    "id": 61,
    "title": "Shape of You",
    "artist": "Ed Sheeran",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 235.01,
    "duration_formatted": "3:55",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Shape of You - Ed Sheeran\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #13 in My playlist #2"
  },
  {
    "id": 62,
    "title": "Night Changes",
    "artist": "One Direction",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 231.53,
    "duration_formatted": "3:51",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Night Changes - One Direction\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #14 in My playlist #2"
  },
  {
    "id": 63,
    "title": "The Nights",
    "artist": "Avicii",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 175.68,
    "duration_formatted": "2:55",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] The Nights - Avicii\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #15 in My playlist #2"
  },
  {
    "id": 64,
    "title": "Rasputin",
    "artist": "Boney M.",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 267.77,
    "duration_formatted": "4:27",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Rasputin - Boney M.\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #16 in My playlist #2"
  },
  {
    "id": 65,
    "title": "Magic",
    "artist": "John Michael Howell",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 177.08,
    "duration_formatted": "2:57",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Magic - John Michael Howell\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #17 in My playlist #2"
  },
  {
    "id": 66,
    "title": "Way down We Go",
    "artist": "KALEO",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 214.13,
    "duration_formatted": "3:34",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Way down We Go - KALEO\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #18 in My playlist #2"
  },
  {
    "id": 67,
    "title": "Hips Don't Lie (feat. Wyclef Jean)",
    "artist": "Shakira, Wyclef Jean",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 218.22,
    "duration_formatted": "3:38",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Hips Don't Lie (feat. Wyclef Jean) - Shakira, Wyclef Jean\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #19 in My playlist #2"
  },
  {
    "id": 68,
    "title": "Stitches",
    "artist": "Shawn Mendes",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 206.05,
    "duration_formatted": "3:26",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Stitches - Shawn Mendes\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #20 in My playlist #2"
  },
  {
    "id": 69,
    "title": "Scars To Your Beautiful",
    "artist": "Alessia Cara",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 230.39,
    "duration_formatted": "3:50",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Scars To Your Beautiful - Alessia Cara\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #21 in My playlist #2"
  },
  {
    "id": 70,
    "title": "Demons",
    "artist": "Imagine Dragons",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 177.17,
    "duration_formatted": "2:57",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Demons - Imagine Dragons\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #22 in My playlist #2"
  },
  {
    "id": 71,
    "title": "Thunder",
    "artist": "Imagine Dragons",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 187.25,
    "duration_formatted": "3:07",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Thunder - Imagine Dragons\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #23 in My playlist #2"
  },
  {
    "id": 72,
    "title": "Somebody That I Used To Know",
    "artist": "Gotye, Kimbra",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 245.02,
    "duration_formatted": "4:05",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Somebody That I Used To Know - Gotye, Kimbra\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #24 in My playlist #2"
  },
  {
    "id": 73,
    "title": "End of Beginning",
    "artist": "Djo",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 159.31,
    "duration_formatted": "2:39",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] End of Beginning - Djo\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #25 in My playlist #2"
  },
  {
    "id": 74,
    "title": "Dracula",
    "artist": "Tame Impala",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 233.34,
    "duration_formatted": "3:53",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Dracula - Tame Impala\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #26 in My playlist #2"
  },
  {
    "id": 75,
    "title": "BANG",
    "artist": "Unroyal",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 123.53,
    "duration_formatted": "2:03",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] BANG - Unroyal\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #27 in My playlist #2"
  },
  {
    "id": 76,
    "title": "Skyfall",
    "artist": "Adele",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 289.32,
    "duration_formatted": "4:49",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Skyfall - Adele\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #28 in My playlist #2"
  },
  {
    "id": 77,
    "title": "lovely (with Khalid)",
    "artist": "Billie Eilish, Khalid",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 200.48,
    "duration_formatted": "3:20",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] lovely (with Khalid) - Billie Eilish, Khalid\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #29 in My playlist #2"
  },
  {
    "id": 78,
    "title": "Payphone",
    "artist": "Maroon 5, Wiz Khalifa",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 231.46,
    "duration_formatted": "3:51",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Payphone - Maroon 5, Wiz Khalifa\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #30 in My playlist #2"
  },
  {
    "id": 79,
    "title": "Rockabye (feat. Sean Paul & Anne-Marie)",
    "artist": "Clean Bandit, Anne-Marie, Sean Paul",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 253.89,
    "duration_formatted": "4:13",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Rockabye (feat. Sean Paul & Anne-Marie) - Clean Bandit, Anne-Marie, Sean Paul\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #31 in My playlist #2"
  },
  {
    "id": 80,
    "title": "Hall of Fame (feat. will.i.am)",
    "artist": "The Script, will.i.am",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 201.15,
    "duration_formatted": "3:21",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Hall of Fame (feat. will.i.am) - The Script, will.i.am\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #32 in My playlist #2"
  },
  {
    "id": 81,
    "title": "Hymn for the Weekend",
    "artist": "Coldplay",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 259.07,
    "duration_formatted": "4:19",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Hymn for the Weekend - Coldplay\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #33 in My playlist #2"
  },
  {
    "id": 82,
    "title": "Dusk Till Dawn (feat. Sia) - Radio Edit",
    "artist": "ZAYN, Sia",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 239.21,
    "duration_formatted": "3:59",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Dusk Till Dawn (feat. Sia) - Radio Edit - ZAYN, Sia\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #34 in My playlist #2"
  },
  {
    "id": 83,
    "title": "Bad Liar",
    "artist": "Imagine Dragons",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 260.44,
    "duration_formatted": "4:20",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Bad Liar - Imagine Dragons\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #35 in My playlist #2"
  },
  {
    "id": 84,
    "title": "Someone You Loved",
    "artist": "Lewis Capaldi",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 182.83,
    "duration_formatted": "3:02",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Someone You Loved - Lewis Capaldi\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #36 in My playlist #2"
  },
  {
    "id": 85,
    "title": "Memories",
    "artist": "Maroon 5",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 190.73,
    "duration_formatted": "3:10",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Memories - Maroon 5\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #37 in My playlist #2"
  },
  {
    "id": 86,
    "title": "Se\u00f1orita",
    "artist": "Shawn Mendes, Camila Cabello",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 190.96,
    "duration_formatted": "3:10",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Se\u00f1orita - Shawn Mendes, Camila Cabello\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #38 in My playlist #2"
  },
  {
    "id": 87,
    "title": "Blinding Lights",
    "artist": "The Weeknd",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 203.22,
    "duration_formatted": "3:23",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Blinding Lights - The Weeknd\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #39 in My playlist #2"
  },
  {
    "id": 88,
    "title": "Talking to the Moon",
    "artist": "Bruno Mars",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 214.51,
    "duration_formatted": "3:34",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Talking to the Moon - Bruno Mars\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #40 in My playlist #2"
  },
  {
    "id": 89,
    "title": "Something Just Like This",
    "artist": "The Chainsmokers, Coldplay",
    "album": "My playlist #2",
    "genre": "Pop / Electronic / Indie",
    "year": "2024",
    "duration_seconds": 247.13,
    "duration_formatted": "4:07",
    "stream_url": "https://raw.githubusercontent.com/atharvabalar6-crypto/spotify-player/main/music/Midnight_Horizon.wav",
    "is_favorite": 0,
    "lyrics": "[00:01.00] Something Just Like This - The Chainsmokers, Coldplay\n[00:15.00] Streaming in Lossless FLAC format\n[00:30.00] Position #41 in My playlist #2"
  }
];

function getSvgCoverDataUrl(title, artist, id) {
  const gradients = [
    ["#1DB954", "#191414"],
    ["#8B5CF6", "#1E1B4B"],
    ["#EC4899", "#831843"],
    ["#3B82F6", "#172554"],
    ["#F59E0B", "#78350F"],
    ["#06B6D4", "#164E63"]
  ];
  const [c1, c2] = gradients[(id || 0) % gradients.length];
  const initials = (title || "SP").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    <defs><linearGradient id="g_${id}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>
    <rect width="300" height="300" rx="16" fill="url(#g_${id})"/>
    <circle cx="150" cy="150" r="100" stroke="rgba(255,255,255,0.1)" stroke-width="2" fill="none"/>
    <circle cx="150" cy="150" r="75" stroke="rgba(255,255,255,0.15)" stroke-width="2" fill="none"/>
    <circle cx="150" cy="150" r="28" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
    <text x="150" y="157" font-family="sans-serif" font-size="20" font-weight="bold" fill="#fff" text-anchor="middle" dominant-baseline="middle">${initials}</text>
  </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

// Initial Data Fetch
async function loadInitialData() {
  try {
    const [tracksRes, playlistsRes, statsRes] = await Promise.all([
      fetch('/api/tracks').then(r => r.json()),
      fetch('/api/playlists').then(r => r.json()),
      fetch('/api/stats').then(r => r.json())
    ]);

    if (tracksRes && tracksRes.success) allTracks = tracksRes.tracks;
    if (playlistsRes && playlistsRes.success) allPlaylists = playlistsRes.playlists;

    document.getElementById('homeGreeting').textContent = getGreeting();
    renderSidebarPlaylists();
    renderHomeView();
    updateStatsHeader(statsRes);
  } catch (err) {
    console.log("Static / GitHub Pages mode active. Loading client-side library...");
    allTracks = STATIC_FALLBACK_TRACKS.map(t => {
      t.cover_url = getSvgCoverDataUrl(t.title, t.artist, t.id);
      return t;
    });
    allPlaylists = [
      { id: 4, name: "My playlist #2", description: "Imported from Spotify (41 Lossless FLAC Tracks)", track_count: 41, cover_color: "#1DB954" },
      { id: 1, name: "Chill Beats & Focus", track_count: 5, cover_color: "#3b82f6" },
      { id: 2, name: "Late Night Drive", track_count: 3, cover_color: "#ec4899" },
      { id: 3, name: "Daily Motivation", track_count: 4, cover_color: "#eab308" }
    ];
    document.getElementById('homeGreeting').textContent = getGreeting();
    renderSidebarPlaylists();
    renderHomeView();
    updateStatsHeader({ total_tracks: 46, total_artists: 38, total_duration_minutes: 154.2 });
  }
}

function updateStatsHeader(stats) {
  if (!stats) return;
  const statsEl = document.getElementById('libraryStatsBadge');
  if (statsEl) {
    statsEl.textContent = `${stats.total_tracks} songs • ${stats.total_artists} artists • ${stats.total_duration_minutes} mins`;
  }
}

function renderSidebarPlaylists() {
  const container = document.getElementById('sidebarPlaylists');
  container.innerHTML = allPlaylists.map(p => `
    <div class="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer truncate transition flex items-center justify-between group"
         onclick="switchView('playlist', { id: ${p.id} })">
      <div class="flex items-center gap-2 truncate">
        <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${p.cover_color || '#1DB954'}"></span>
        <span class="truncate">${p.name}</span>
      </div>
      <span class="text-xs text-slate-500 group-hover:text-slate-400">${p.track_count || 0}</span>
    </div>
  `).join('');
}

function renderHomeView() {
  // Top 6 Quick Cards
  const topTracks = allTracks.slice(0, 6);
  const quickCards = document.getElementById('homeQuickCards');
  quickCards.innerHTML = topTracks.map(t => `
    <div class="flex items-center bg-[#242424]/60 hover:bg-[#282828] rounded-md overflow-hidden cursor-pointer group transition shadow-md relative"
         onclick="playTrackFromList(${t.id})">
      <img src="${t.cover_url}" class="w-16 h-16 object-cover shadow-sm flex-shrink-0" alt="${t.title}" />
      <span class="font-bold text-sm text-white px-3 truncate flex-1">${t.title}</span>
      <button class="w-10 h-10 rounded-full bg-[#1DB954] text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition transform scale-90 group-hover:scale-100 mr-3 shadow-lg flex-shrink-0 hover:bg-[#1ed760]"
              onclick="event.stopPropagation(); playTrackFromList(${t.id})">
        <svg class="w-5 h-5 ml-0.5 fill-current" viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
      </button>
    </div>
  `).join('');

  // Made For You Grid Cards
  const cardsContainer = document.getElementById('homeTrackCards');
  cardsContainer.innerHTML = allTracks.map(t => `
    <div class="music-card bg-[#181818] p-4 rounded-xl cursor-pointer group flex flex-col relative"
         onclick="playTrackFromList(${t.id})">
      <div class="relative w-full aspect-square mb-3.5 rounded-lg overflow-hidden shadow-lg bg-slate-900">
        <img src="${t.cover_url}" class="w-full h-full object-cover" alt="${t.title}" />
        <button class="card-play-btn absolute bottom-2.5 right-2.5 w-11 h-11 rounded-full bg-[#1DB954] text-black flex items-center justify-center shadow-xl hover:scale-105 hover:bg-[#1ed760] transition"
                onclick="event.stopPropagation(); playTrackFromList(${t.id})">
          <svg class="w-5 h-5 ml-0.5 fill-current" viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
        </button>
      </div>
      <div class="font-bold text-sm text-white truncate mb-1">${t.title}</div>
      <div class="text-xs text-slate-400 truncate mb-1.5">${t.artist}</div>
      <div class="text-[11px] text-slate-500 truncate mt-auto flex items-center justify-between">
        <span>${t.genre || 'Single'}</span>
        <span>${t.duration_formatted}</span>
      </div>
    </div>
  `).join('');

  // Table of All Songs
  renderTrackTable(allTracks, 'homeTrackTable');
}

function renderTrackTable(tracks, tableId) {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;

  tbody.innerHTML = tracks.map((t, idx) => `
    <tr class="group hover:bg-white/10 rounded-md transition cursor-pointer text-sm text-slate-300"
        id="track-row-${t.id}"
        onclick="playTrackFromList(${t.id})">
      <td class="w-10 py-3 px-3 text-center text-slate-400 group-hover:text-white">
        <span class="row-num group-hover:hidden">${idx + 1}</span>
        <button class="hidden group-hover:inline-block text-white" onclick="event.stopPropagation(); playTrackFromList(${t.id})">
          <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
        </button>
      </td>
      <td class="py-2.5 px-3">
        <div class="flex items-center gap-3">
          <img src="${t.cover_url}" class="w-10 h-10 rounded object-cover flex-shrink-0" />
          <div class="truncate">
            <div class="font-semibold text-white truncate row-title">${t.title}</div>
            <div class="text-xs text-slate-400 truncate">${t.artist}</div>
          </div>
        </div>
      </td>
      <td class="py-2.5 px-3 text-slate-400 truncate hidden md:table-cell">${t.album}</td>
      <td class="py-2.5 px-3 text-right">
        <div class="flex items-center justify-end gap-3">
          <button class="heart-btn text-slate-500 hover:text-white transition ${t.is_favorite === 1 ? '!text-[#1DB954]' : ''}"
                  onclick="event.stopPropagation(); toggleTrackLike(${t.id})">
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
          <span class="text-xs text-slate-400">${t.duration_formatted}</span>
          <button class="text-slate-500 hover:text-white transition" title="Add to playlist"
                  onclick="event.stopPropagation(); openAddToPlaylistModal(${t.id})">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  updateActivePlayingRow();
}

function playTrackFromList(trackId) {
  const track = allTracks.find(t => t.id === trackId);
  if (!track) return;
  window.spotifyPlayer.playTrack(track, allTracks);
}

function updateActivePlayingRow() {
  const cur = window.spotifyPlayer.currentTrack;
  const isPlaying = window.spotifyPlayer.isPlaying;

  document.querySelectorAll('tr[id^="track-row-"]').forEach(row => {
    row.classList.remove('playing-row', 'bg-white/10');
    const titleEl = row.querySelector('.row-title');
    if (titleEl) titleEl.classList.remove('text-[#1DB954]');
    const numEl = row.querySelector('.row-num');
    if (numEl && numEl.dataset.originalNum) {
      numEl.innerHTML = numEl.dataset.originalNum;
    }
  });

  if (cur) {
    const activeRow = document.getElementById(`track-row-${cur.id}`);
    if (activeRow) {
      activeRow.classList.add('playing-row', 'bg-white/10');
      const titleEl = activeRow.querySelector('.row-title');
      if (titleEl) titleEl.classList.add('text-[#1DB954]');

      const numEl = activeRow.querySelector('.row-num');
      if (numEl && isPlaying) {
        if (!numEl.dataset.originalNum) numEl.dataset.originalNum = numEl.innerHTML;
        numEl.innerHTML = `
          <div class="flex items-end justify-center gap-0.5 h-3.5">
            <span class="w-0.5 bg-[#1DB954] eq-bar-1"></span>
            <span class="w-0.5 bg-[#1DB954] eq-bar-2"></span>
            <span class="w-0.5 bg-[#1DB954] eq-bar-3"></span>
            <span class="w-0.5 bg-[#1DB954] eq-bar-4"></span>
          </div>
        `;
      }
    }
  }
}

// Like/Favorite
async function toggleTrackLike(trackId) {
  try {
    const res = await fetch(`/api/like/${trackId}`, { method: 'POST' }).then(r => r.json());
    if (res.success) {
      const track = allTracks.find(t => t.id === trackId);
      if (track) track.is_favorite = res.is_favorite;

      // Update current player like button if matches
      if (window.spotifyPlayer.currentTrack?.id === trackId) {
        const btn = document.getElementById('btnLikeCurrent');
        btn.classList.toggle('text-[#1DB954]', res.is_favorite === 1);
        btn.classList.toggle('text-slate-400', res.is_favorite !== 1);
      }

      // Update table rows
      document.querySelectorAll(`#track-row-${trackId} .heart-btn`).forEach(btn => {
        btn.classList.toggle('!text-[#1DB954]', res.is_favorite === 1);
      });

      if (currentView === 'liked') loadLikedView();
    }
  } catch (err) {
    console.error("Like toggle failed:", err);
  }
}

// Liked View
async function loadLikedView() {
  try {
    const res = await fetch('/api/liked').then(r => r.json());
    if (res.success) {
      document.getElementById('likedCountBadge').textContent = `${res.total} songs`;
      renderTrackTable(res.tracks, 'likedTrackTable');
    }
  } catch (err) {
    console.error("Failed to fetch liked songs:", err);
  }
}

// Playlist View
async function loadPlaylistView(playlistId) {
  currentPlaylistId = playlistId;
  try {
    const res = await fetch(`/api/playlists/${playlistId}`).then(r => r.json());
    if (res.success) {
      document.getElementById('playlistName').textContent = res.playlist.name;
      document.getElementById('playlistDesc').textContent = res.playlist.description || "Created for your listening pleasure";
      document.getElementById('playlistMetaBadge').textContent = `${res.tracks.length} songs`;
      document.getElementById('playlistHeaderCover').style.backgroundColor = res.playlist.cover_color || '#1DB954';
      renderTrackTable(res.tracks, 'playlistTrackTable');
    }
  } catch (err) {
    console.warn("Using client-side playlist fallback:", err);
    const p = allPlaylists.find(x => x.id === playlistId) || { name: "My playlist #2", description: "Imported from Spotify: https://open.spotify.com/playlist/29FEirrmCmacrCetrJAGjy (41 Lossless FLAC Tracks)", cover_color: "#1DB954" };
    document.getElementById('playlistName').textContent = p.name;
    document.getElementById('playlistDesc').textContent = p.description || "Created for your listening pleasure";
    const filtered = allTracks.filter(t => t.album === p.name || playlistId === 4 || p.id === 4);
    document.getElementById('playlistMetaBadge').textContent = `${filtered.length} songs`;
    document.getElementById('playlistHeaderCover').style.backgroundColor = p.cover_color || '#1DB954';
    renderTrackTable(filtered, 'playlistTrackTable');
  }
}

// Search
async function performSearch(query) {
  if (!query) {
    document.getElementById('searchResults').innerHTML = '<div class="text-slate-400 text-sm">Type a song, artist, album, or genre name...</div>';
    return;
  }
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`).then(r => r.json());
    const container = document.getElementById('searchResults');
    if (!res.tracks || res.tracks.length === 0) {
      container.innerHTML = `<div class="text-slate-400 text-sm">No results found for "${query}"</div>`;
      return;
    }

    container.innerHTML = `
      <table class="w-full text-left border-collapse">
        <tbody id="searchTrackTable"></tbody>
      </table>
    `;
    renderTrackTable(res.tracks, 'searchTrackTable');
  } catch (err) {
    console.error("Search failed:", err);
  }
}

// Lyrics Sync
function renderLyricsView() {
  const container = document.getElementById('lyricsLinesContainer');
  if (!container) return;

  if (parsedLyrics.length === 0) {
    container.innerHTML = `
      <div class="h-64 flex flex-col items-center justify-center text-slate-500 text-sm italic">
        <span>No lyrics available for this track</span>
      </div>
    `;
    return;
  }

  container.innerHTML = parsedLyrics.map((l, i) => `
    <div id="lyric-${i}" class="lyrics-line text-lg md:text-xl font-bold text-slate-500 hover:text-white py-2 cursor-pointer transition"
         onclick="seekToLyricTime(${l.time})">
      ${l.text}
    </div>
  `).join('');
}

function syncLyrics(currentTime) {
  if (parsedLyrics.length === 0) return;
  let activeIndex = -1;
  for (let i = 0; i < parsedLyrics.length; i++) {
    if (parsedLyrics[i].time !== -1 && currentTime >= parsedLyrics[i].time) {
      activeIndex = i;
    }
  }

  document.querySelectorAll('.lyrics-line').forEach((el, idx) => {
    el.classList.toggle('active', idx === activeIndex);
  });

  if (activeIndex !== -1) {
    const activeEl = document.getElementById(`lyric-${activeIndex}`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

function seekToLyricTime(time) {
  if (time >= 0) window.spotifyPlayer.seek(time);
}

// Queue
function renderQueueList() {
  const container = document.getElementById('queueList');
  if (!container) return;
  const q = window.spotifyPlayer.queue;
  const curIdx = window.spotifyPlayer.currentIndex;

  if (q.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-500">Queue is empty</div>';
    return;
  }

  container.innerHTML = q.map((t, idx) => `
    <div class="flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/5 cursor-pointer text-xs ${idx === curIdx ? 'text-[#1DB954] font-bold bg-white/10' : 'text-slate-300'}"
         onclick="window.spotifyPlayer.playTrack(window.spotifyPlayer.queue[${idx}], null, ${idx})">
      <img src="${t.cover_url}" class="w-8 h-8 rounded object-cover flex-shrink-0" />
      <div class="truncate flex-1">
        <div class="truncate text-white">${t.title}</div>
        <div class="text-[11px] text-slate-400 truncate">${t.artist}</div>
      </div>
      <span class="text-slate-500">${t.duration_formatted}</span>
    </div>
  `).join('');
}

// Drag & Drop Uploader
function initDragAndDrop() {
  const overlay = document.getElementById('dropOverlay');

  ['dragenter', 'dragover'].forEach(eventName => {
    window.addEventListener(eventName, (e) => {
      e.preventDefault();
      overlay.classList.add('active');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    overlay.addEventListener(eventName, (e) => {
      e.preventDefault();
      overlay.classList.remove('active');
    }, false);
  });

  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    overlay.classList.remove('active');
    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    for (let f of files) {
      await uploadAudioFile(f);
    }
    await loadInitialData();
  });
}

async function uploadAudioFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    }).then(r => r.json());
    console.log("Upload result:", res);
  } catch (err) {
    console.error("Upload failed:", err);
  }
}

// Modals
function initModals() {
  // New Playlist Modal
  document.getElementById('btnCreatePlaylist').addEventListener('click', () => {
    document.getElementById('modalCreatePlaylist').classList.remove('hidden');
  });

  document.getElementById('btnSubmitPlaylist').addEventListener('click', async () => {
    const name = document.getElementById('inputPlaylistName').value.trim();
    const desc = document.getElementById('inputPlaylistDesc').value.trim();
    if (!name) return;

    const res = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc })
    }).then(r => r.json());

    if (res.success) {
      document.getElementById('modalCreatePlaylist').classList.add('hidden');
      document.getElementById('inputPlaylistName').value = '';
      document.getElementById('inputPlaylistDesc').value = '';
      loadInitialData();
    }
  });

  // Equalizer preset buttons
  document.querySelectorAll('.eq-preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const preset = e.target.dataset.preset;
      const gains = window.spotifyPlayer.applyEqPreset(preset);
      gains.forEach((g, i) => {
        const slider = document.getElementById(`eqSlider${i}`);
        if (slider) slider.value = g;
      });
    });
  });

  for (let i = 0; i < 5; i++) {
    const slider = document.getElementById(`eqSlider${i}`);
    if (slider) {
      slider.addEventListener('input', (e) => {
        window.spotifyPlayer.setEqualizerGain(i, parseFloat(e.target.value));
      });
    }
  }
}

function openAddToPlaylistModal(trackId) {
  const container = document.getElementById('playlistOptionsList');
  container.innerHTML = allPlaylists.map(p => `
    <div class="px-4 py-2.5 rounded-lg hover:bg-white/10 cursor-pointer text-sm font-semibold text-white flex items-center justify-between"
         onclick="addTrackToPlaylist(${p.id}, ${trackId})">
      <span>${p.name}</span>
      <span class="text-xs text-slate-400">+ Add</span>
    </div>
  `).join('');
  document.getElementById('modalAddToPlaylist').classList.remove('hidden');
}

async function addTrackToPlaylist(playlistId, trackId) {
  try {
    const res = await fetch(`/api/playlists/${playlistId}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track_id: trackId })
    }).then(r => r.json());

    document.getElementById('modalAddToPlaylist').classList.add('hidden');
    loadInitialData();
  } catch (err) {
    console.error("Failed to add to playlist:", err);
  }
}

function openEqualizerModal() {
  document.getElementById('modalEqualizer').classList.remove('hidden');
}

// Keyboard Shortcuts
function initKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // Ignore if user is typing in an input
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

    if (e.code === 'Space') {
      e.preventDefault();
      window.spotifyPlayer.togglePlay();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      window.spotifyPlayer.seek(window.spotifyPlayer.audio.currentTime + 5);
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      window.spotifyPlayer.seek(window.spotifyPlayer.audio.currentTime - 5);
    } else if (e.code === 'ArrowUp') {
      e.preventDefault();
      window.spotifyPlayer.setVolume(window.spotifyPlayer.volume + 0.05);
    } else if (e.code === 'ArrowDown') {
      e.preventDefault();
      window.spotifyPlayer.setVolume(window.spotifyPlayer.volume - 0.05);
    } else if (e.key.toLowerCase() === 'm') {
      window.spotifyPlayer.toggleMute();
    } else if (e.key.toLowerCase() === 'l') {
      if (window.spotifyPlayer.currentTrack) {
        toggleTrackLike(window.spotifyPlayer.currentTrack.id);
      }
    }
  });
}

