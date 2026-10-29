/**
 * player.js - Core Audio Engine for Spotify Self-Hosted Streaming Player
 * Features HTML5 Audio, Web Audio API Equalizer, Visualizer, Queue, and MediaSession.
 */

class SpotifyPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.crossOrigin = 'anonymous';

    this.currentTrack = null;
    this.queue = [];
    this.currentIndex = -1;
    this.originalQueue = [];

    this.isPlaying = false;
    this.isMuted = false;
    this.volume = 0.8;
    this.isShuffle = false;
    this.repeatMode = 'all'; // 'off' | 'all' | 'one'

    // Web Audio API components
    this.audioCtx = null;
    this.sourceNode = null;
    this.analyser = null;
    this.eqFilters = [];
    this.visualizerCanvas = null;
    this.canvasCtx = null;
    this.isVisualizerRunning = false;

    // Listeners callback registry
    this.callbacks = {
      trackChange: [],
      timeUpdate: [],
      stateChange: [],
      queueChange: [],
      volumeChange: []
    };

    this.initAudioEvents();
  }

  initAudioEvents() {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.notify('stateChange', { isPlaying: true });
      this.initWebAudio();
      if (this.currentTrack) {
        fetch(`/api/history/${this.currentTrack.id}`, { method: 'POST' }).catch(() => {});
      }
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.notify('stateChange', { isPlaying: false });
    });

    this.audio.addEventListener('timeupdate', () => {
      this.notify('timeUpdate', {
        currentTime: this.audio.currentTime,
        duration: this.audio.duration || this.currentTrack?.duration_seconds || 0
      });
    });

    this.audio.addEventListener('ended', () => {
      if (this.repeatMode === 'one') {
        this.audio.currentTime = 0;
        this.audio.play();
      } else {
        this.next();
      }
    });

    this.audio.addEventListener('error', (e) => {
      console.warn("Audio playback error:", e);
    });
  }

  on(event, cb) {
    if (this.callbacks[event]) {
      this.callbacks[event].push(cb);
    }
  }

  notify(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(cb => cb(data));
    }
  }

  initWebAudio() {
    if (this.audioCtx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();

      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;

      // Create 5-band Graphic Equalizer (60Hz, 310Hz, 1kHz, 6kHz, 16kHz)
      const freqs = [60, 310, 1000, 6000, 16000];
      let lastNode = this.sourceNode;

      this.eqFilters = freqs.map((f, i) => {
        const filter = this.audioCtx.createBiquadFilter();
        if (i === 0) filter.type = 'lowshelf';
        else if (i === freqs.length - 1) filter.type = 'highshelf';
        else filter.type = 'peaking';
        filter.frequency.value = f;
        filter.gain.value = 0;
        lastNode.connect(filter);
        lastNode = filter;
        return filter;
      });

      lastNode.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);

      this.startVisualizer();
    } catch (e) {
      console.log("Web Audio Context not supported or cross-origin restricted:", e);
    }
  }

  playTrack(track, queue = null, index = null) {
    if (!track) return;
    this.currentTrack = track;

    if (queue) {
      this.queue = [...queue];
      this.originalQueue = [...queue];
      this.currentIndex = index !== null ? index : this.queue.findIndex(t => t.id === track.id);
      this.notify('queueChange', { queue: this.queue, currentIndex: this.currentIndex });
    }

    this.audio.src = track.stream_url || `/api/stream/${track.id}`;
    this.audio.volume = this.isMuted ? 0 : this.volume;
    
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    this.audio.play().catch(e => console.log("Autoplay prevented:", e));
    this.notify('trackChange', track);
    this.updateMediaSession(track);
  }

  togglePlay() {
    if (!this.currentTrack && this.queue.length > 0) {
      this.playTrack(this.queue[0], this.queue, 0);
      return;
    }
    if (this.audio.paused) {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      this.audio.play();
    } else {
      this.audio.pause();
    }
  }

  next() {
    if (this.queue.length === 0) return;
    let nextIdx = this.currentIndex + 1;
    if (nextIdx >= this.queue.length) {
      if (this.repeatMode === 'all') {
        nextIdx = 0;
      } else {
        return; // End of playlist
      }
    }
    this.currentIndex = nextIdx;
    this.playTrack(this.queue[nextIdx], this.queue, nextIdx);
  }

  prev() {
    if (this.audio.currentTime > 3.0) {
      this.audio.currentTime = 0;
      return;
    }
    if (this.queue.length === 0) return;
    let prevIdx = this.currentIndex - 1;
    if (prevIdx < 0) {
      prevIdx = this.queue.length - 1;
    }
    this.currentIndex = prevIdx;
    this.playTrack(this.queue[prevIdx], this.queue, prevIdx);
  }

  seek(seconds) {
    if (this.audio.duration) {
      this.audio.currentTime = Math.max(0, min(seconds, this.audio.duration));
    }
  }

  seekPercent(fraction) {
    const dur = this.audio.duration || this.currentTrack?.duration_seconds || 0;
    if (dur > 0) {
      this.audio.currentTime = Math.max(0, Math.min(fraction * dur, dur));
    }
  }

  setVolume(fraction) {
    this.volume = Math.max(0, Math.min(1, fraction));
    if (this.volume > 0) this.isMuted = false;
    this.audio.volume = this.isMuted ? 0 : this.volume;
    this.notify('volumeChange', { volume: this.volume, isMuted: this.isMuted });
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.audio.volume = this.isMuted ? 0 : this.volume;
    this.notify('volumeChange', { volume: this.volume, isMuted: this.isMuted });
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    if (this.isShuffle) {
      // Shuffle queue preserving current track at head
      const remaining = this.queue.filter(t => t.id !== this.currentTrack?.id);
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      this.queue = this.currentTrack ? [this.currentTrack, ...remaining] : remaining;
      this.currentIndex = 0;
    } else {
      this.queue = [...this.originalQueue];
      this.currentIndex = this.queue.findIndex(t => t.id === this.currentTrack?.id);
    }
    this.notify('queueChange', { queue: this.queue, currentIndex: this.currentIndex });
    return this.isShuffle;
  }

  toggleRepeat() {
    const modes = ['off', 'all', 'one'];
    const nextMode = modes[(modes.indexOf(this.repeatMode) + 1) % modes.length];
    this.repeatMode = nextMode;
    return this.repeatMode;
  }

  setEqualizerGain(bandIndex, gainDb) {
    if (this.eqFilters[bandIndex]) {
      this.eqFilters[bandIndex].gain.value = gainDb;
    }
  }

  applyEqPreset(presetName) {
    const presets = {
      'flat': [0, 0, 0, 0, 0],
      'bass': [6, 4, 1, 0, -1],
      'vocal': [-2, 2, 5, 2, -1],
      'pop': [-1, 2, 4, 3, 1],
      'rock': [5, 3, -1, 3, 5],
      'electronic': [4, 2, 0, 3, 4]
    };
    const gains = presets[presetName.toLowerCase()] || presets['flat'];
    gains.forEach((g, idx) => this.setEqualizerGain(idx, g));
    return gains;
  }

  attachVisualizer(canvasElement) {
    this.visualizerCanvas = canvasElement;
    this.canvasCtx = canvasElement.getContext('2d');
    this.startVisualizer();
  }

  startVisualizer() {
    if (this.isVisualizerRunning || !this.visualizerCanvas || !this.analyser) return;
    this.isVisualizerRunning = true;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const renderFrame = () => {
      if (!this.isVisualizerRunning) return;
      requestAnimationFrame(renderFrame);

      if (!this.isPlaying) {
        // Draw static minimal idle baseline
        this.canvasCtx.clearRect(0, 0, this.visualizerCanvas.width, this.visualizerCanvas.height);
        this.canvasCtx.fillStyle = 'rgba(29, 185, 84, 0.2)';
        this.canvasCtx.fillRect(0, this.visualizerCanvas.height - 2, this.visualizerCanvas.width, 2);
        return;
      }

      this.analyser.getByteFrequencyData(dataArray);

      const width = this.visualizerCanvas.width;
      const height = this.visualizerCanvas.height;
      this.canvasCtx.clearRect(0, 0, width, height);

      const numBars = 28;
      const barWidth = (width / numBars) - 2;
      let x = 0;

      for (let i = 0; i < numBars; i++) {
        const dataIndex = Math.floor((i / numBars) * bufferLength * 0.75);
        const val = dataArray[dataIndex] || 0;
        const barHeight = Math.max(3, (val / 255) * height);

        // Spotify Green gradient to Cyan/Purple
        const grad = this.canvasCtx.createLinearGradient(0, height, 0, height - barHeight);
        grad.addColorStop(0, '#1DB954');
        grad.addColorStop(1, '#1ed760');

        this.canvasCtx.fillStyle = grad;
        this.canvasCtx.beginPath();
        this.canvasCtx.roundRect(x, height - barHeight, barWidth, barHeight, 2);
        this.canvasCtx.fill();

        x += barWidth + 2;
      }
    };

    renderFrame();
  }

  updateMediaSession(track) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: [
          { src: `/api/cover/${track.id}`, sizes: '300x300', type: 'image/svg+xml' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => this.togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => this.togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) this.seek(details.seekTime);
      });
    }
  }
}

// Global player instance
window.spotifyPlayer = new SpotifyPlayer();

