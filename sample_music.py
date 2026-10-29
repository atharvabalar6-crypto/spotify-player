"""
sample_music.py - Synthesizes high-quality chill, lo-fi, and synthwave sample tracks
using Python's standard wave and math modules so the Spotify server works out-of-the-box.
"""

import os
import wave
import math
import struct
import random

SAMPLE_RATE = 44100

def generate_tone(freq, duration, sample_rate=SAMPLE_RATE, volume=0.5, wave_type='sine'):
    num_samples = int(duration * sample_rate)
    samples = []
    for i in range(num_samples):
        t = i / sample_rate
        if wave_type == 'sine':
            val = math.sin(2 * math.pi * freq * t)
        elif wave_type == 'triangle':
            val = 2 * abs(2 * (t * freq - math.floor(t * freq + 0.5))) - 1
        elif wave_type == 'soft_saw':
            val = 0.6 * math.sin(2 * math.pi * freq * t) + 0.3 * math.sin(4 * math.pi * freq * t) + 0.1 * math.sin(6 * math.pi * freq * t)
        else:
            val = math.sin(2 * math.pi * freq * t)
            
        # Envelope: Attack, Decay, Sustain, Release
        env = 1.0
        fade_in = min(1.0, i / (sample_rate * 0.05))
        fade_out = min(1.0, (num_samples - i) / (sample_rate * 0.08))
        env = fade_in * fade_out
        
        samples.append(val * volume * env)
    return samples

def note_to_freq(note_name):
    notes = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4,
             'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9,
             'A#': 10, 'Bb': 10, 'B': 11}
    pitch = note_name[:-1]
    octave = int(note_name[-1])
    semitone = notes[pitch] + (octave + 1) * 12
    # A4 = 69 = 440 Hz
    return 440.0 * (2.0 ** ((semitone - 69) / 12.0))

def create_wav_file(filename, samples, sample_rate=SAMPLE_RATE):
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with wave.open(filename, 'w') as wav:
        wav.setnchannels(2)  # Stereo
        wav.setsampwidth(2)  # 16-bit
        wav.setframerate(sample_rate)
        
        frames = bytearray()
        for s in samples:
            # Clamp between -1.0 and 1.0
            clamped = max(-0.95, min(0.95, s))
            int_sample = int(clamped * 32767)
            # Stereo (duplicate to L & R with subtle phase shimmer)
            frames.extend(struct.pack('<hh', int_sample, int_sample))
            
        wav.writeframes(frames)
    print(f"Generated sample track: {os.path.basename(filename)} ({len(samples)/sample_rate:.1f}s)")

def synthesize_midnight_horizon(filepath):
    # 30-second chillwave chord progression: Am - F - C - G
    progression = [
        (['A3', 'C4', 'E4'], ['A4', 'C5', 'E5', 'C5'], 'soft_saw'),
        (['F3', 'A3', 'C4'], ['F4', 'A4', 'C5', 'A4'], 'soft_saw'),
        (['C3', 'E3', 'G3'], ['G4', 'C5', 'E5', 'C5'], 'soft_saw'),
        (['G3', 'B3', 'D4'], ['B4', 'D5', 'G5', 'D5'], 'soft_saw'),
    ]
    
    total_samples = []
    chord_duration = 3.6  # seconds per chord
    repetitions = 2       # ~29 seconds total
    
    for _ in range(repetitions):
        for chord_notes, arp_notes, wtype in progression:
            chord_len = int(chord_duration * SAMPLE_RATE)
            mixed = [0.0] * chord_len
            
            # Pad chord
            for cn in chord_notes:
                cfreq = note_to_freq(cn)
                s = generate_tone(cfreq, chord_duration, volume=0.22, wave_type='triangle')
                for i in range(min(len(s), chord_len)):
                    mixed[i] += s[i]
                    
            # Arpeggiated melodic lead
            arp_step = chord_duration / len(arp_notes)
            for idx, an in enumerate(arp_notes):
                afreq = note_to_freq(an)
                s = generate_tone(afreq, arp_step * 1.5, volume=0.28, wave_type=wtype)
                start_i = int(idx * arp_step * SAMPLE_RATE)
                for i in range(len(s)):
                    if start_i + i < chord_len:
                        mixed[start_i + i] += s[i]
                        
            # Soft lo-fi rhythm beat tick
            beat_step = chord_duration / 8
            for b in range(8):
                b_start = int(b * beat_step * SAMPLE_RATE)
                click = generate_tone(80.0 if b % 2 == 0 else 160.0, 0.08, volume=0.35, wave_type='sine')
                for i in range(len(click)):
                    if b_start + i < chord_len:
                        mixed[b_start + i] += click[i]
                        
            total_samples.extend(mixed)
            
    create_wav_file(filepath, total_samples)

def synthesize_deep_focus(filepath):
    # Binaural meditative ambient chords with pentatonic bell tones
    scale = ['D4', 'F4', 'G4', 'A4', 'C5', 'D5']
    chord_sequence = [
        ['D3', 'A3', 'F4'],
        ['Bb2', 'F3', 'D4'],
        ['G2', 'D3', 'Bb3'],
        ['A2', 'E3', 'C#4']
    ]
    
    total_samples = []
    step_duration = 4.0
    
    for loop in range(2):
        for cidx, chord in enumerate(chord_sequence):
            step_len = int(step_duration * SAMPLE_RATE)
            mixed = [0.0] * step_len
            
            # Warm sub-bass & root
            for n in chord:
                freq = note_to_freq(n)
                tone = generate_tone(freq, step_duration, volume=0.25, wave_type='sine')
                for i in range(step_len):
                    mixed[i] += tone[i]
                    
            # Gentle bell chimes
            bell_note = scale[(cidx * 2 + loop) % len(scale)]
            bell = generate_tone(note_to_freq(bell_note), 2.5, volume=0.3, wave_type='sine')
            start = int(0.5 * SAMPLE_RATE)
            for i in range(len(bell)):
                if start + i < step_len:
                    mixed[start + i] += bell[i]
                    
            total_samples.extend(mixed)
            
    create_wav_file(filepath, total_samples)

def synthesize_neon_raindrops(filepath):
    # Uplifting arpeggio melody in E Major (E4, G#4, B4, E5)
    chords = [
        ('E3', ['E4', 'G#4', 'B4', 'E5']),
        ('C#3', ['C#4', 'E4', 'G#4', 'C#5']),
        ('A2', ['A3', 'C#4', 'E4', 'A4']),
        ('B2', ['B3', 'D#4', 'F#4', 'B4']),
    ]
    total_samples = []
    dur = 3.5
    for loop in range(2):
        for root, melody in chords:
            step_len = int(dur * SAMPLE_RATE)
            mixed = [0.0] * step_len
            # Root bass
            base_s = generate_tone(note_to_freq(root), dur, volume=0.3, wave_type='soft_saw')
            for i in range(step_len):
                mixed[i] += base_s[i]
            # Fast raindrop arpeggios
            sub_step = dur / 8
            for step_i in range(8):
                note = melody[step_i % len(melody)]
                plink = generate_tone(note_to_freq(note), 0.35, volume=0.25, wave_type='triangle')
                st = int(step_i * sub_step * SAMPLE_RATE)
                for i in range(len(plink)):
                    if st + i < step_len:
                        mixed[st + i] += plink[i]
            total_samples.extend(mixed)
    create_wav_file(filepath, total_samples)

def synthesize_starlight_reverie(filepath):
    # Calming piano-like peaceful melody in C Major
    notes = ['C4', 'E4', 'G4', 'B4', 'A4', 'F4', 'D4', 'G4', 'C4']
    total_samples = []
    for n in notes:
        freq = note_to_freq(n)
        s = generate_tone(freq, 2.5, volume=0.35, wave_type='sine')
        # Sub harmony
        sub = generate_tone(freq / 2.0, 2.5, volume=0.2, wave_type='sine')
        for i in range(len(s)):
            s[i] += sub[i]
        total_samples.extend(s[:int(2.2 * SAMPLE_RATE)])
    create_wav_file(filepath, total_samples)

def synthesize_cyberpunk_pulse(filepath):
    # Driving electronic synthwave bassline
    bass_notes = ['A2', 'A2', 'C3', 'A2', 'D3', 'C3', 'G2', 'E2']
    total_samples = []
    step_time = 0.4
    for rep in range(8):
        for b in bass_notes:
            freq = note_to_freq(b)
            s = generate_tone(freq, step_time, volume=0.38, wave_type='soft_saw')
            # High pulse
            hi = generate_tone(freq * 2.0, step_time * 0.4, volume=0.15, wave_type='triangle')
            for i in range(len(hi)):
                s[i] += hi[i]
            total_samples.extend(s)
    create_wav_file(filepath, total_samples)

def generate_all_sample_tracks(music_dir):
    print("=" * 60)
    print("SYNTHESIZING SPOTIFY STARTER MUSIC LIBRARY...")
    print("=" * 60)
    
    tracks_info = [
        ("Midnight_Horizon.wav", synthesize_midnight_horizon, {
            "title": "Midnight Horizon",
            "artist": "Aether Wave",
            "album": "Neon Retrospect",
            "genre": "Synthwave / Chill",
            "year": "2026",
            "lyrics": "[00:01.00] Cruising along the digital highway...\n[00:08.00] Neon lights reflecting in the rearview mirror\n[00:15.00] Soft analog synthesizers guide the way\n[00:22.00] Endless horizon under the midnight sky"
        }),
        ("Deep_Focus_Resonance.wav", synthesize_deep_focus, {
            "title": "Deep Focus Resonance",
            "artist": "Zenith Sound Lab",
            "album": "Alpha State Vol. 1",
            "genre": "Lo-Fi Ambient",
            "year": "2026",
            "lyrics": "[00:01.00] (Gentle meditative hum begins)\n[00:08.00] Slow down your thoughts and breathe\n[00:16.00] Pentatonic chimes resonate in harmony\n[00:24.00] Complete clarity and deep focus achieved"
        }),
        ("Neon_Raindrops.wav", synthesize_neon_raindrops, {
            "title": "Neon Raindrops",
            "artist": "Tokyo Driftwood",
            "album": "Midnight in Shibuya",
            "genre": "Electro Chill",
            "year": "2026",
            "lyrics": "[00:01.00] Rain tapping softly against the cafe window\n[00:07.00] City reflections shimmering in emerald and violet\n[00:14.00] Step into the rhythm of the rainy evening\n[00:21.00] Lost in the glow of the metropolitan night"
        }),
        ("Starlight_Reverie.wav", synthesize_starlight_reverie, {
            "title": "Starlight Reverie",
            "artist": "Celeste & Strings",
            "album": "Quiet Constellations",
            "genre": "Acoustic Ambient",
            "year": "2025",
            "lyrics": "[00:01.00] Starlight gleaming through quiet constellations\n[00:06.00] Soft acoustic piano notes gently fall\n[00:12.00] In the peaceful silence of the evening\n[00:18.00] Reverie and calm embrace the night"
        }),
        ("Cyberpunk_Pulse.wav", synthesize_cyberpunk_pulse, {
            "title": "Cyberpunk Pulse",
            "artist": "Hyperion Zero",
            "album": "Overdrive 2099",
            "genre": "Cyberpunk / Darksynth",
            "year": "2026",
            "lyrics": "[00:01.00] Bassline engaging... High voltage pulse active\n[00:07.00] Accelerating through cybernetic corridors\n[00:14.00] Synths firing at maximum overdrive\n[00:20.00] Pure electronic velocity"
        }),
    ]

    results = []
    for fname, func, meta in tracks_info:
        fpath = os.path.join(music_dir, fname)
        if not os.path.exists(fpath):
            func(fpath)
        else:
            print(f"Sample track already exists: {fname}")
        results.append((fpath, meta))

    return results

if __name__ == "__main__":
    target = os.path.join(os.path.dirname(__file__), "music")
    generate_all_sample_tracks(target)

