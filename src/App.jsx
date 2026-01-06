'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Wand2, Zap, Disc, Music, Drum, Speaker, Volume2, Activity, AlertCircle, Play, Square } from 'lucide-react';

// --- CONSTANTS ---
const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = ['Minor', 'Major', 'Phrygian', 'Dorian', 'Blues', 'Aeolian'];
const PRODUCER_STYLES = ['Generic', 'Tony De Vit', 'BK', 'Lisa Lashes', 'Tidy Boys', 'Nukleuz', 'Paul Glazby', 'Andy Farley', 'Tripoli Trax', 'Vicious Circle', 'Fireball'];

const INSTRUMENT_PRESETS = [
  { id: 'kick', name: 'Kick', icon: Drum, pitch: 'C2', file: 'kick1.wav' },
  { id: 'clap', name: 'Clap', icon: Music, pitch: 'D#2', file: 'clap1.wav' },
  { id: 'snare', name: 'Snare', icon: Speaker, pitch: 'D2', file: 'snare1.wav' },
  { id: 'hat_open', name: 'Open Hat', icon: Volume2, pitch: 'F#2', file: 'hat_open1.wav' },
  { id: 'hat_closed', name: 'Closed Hat', icon: Disc, pitch: 'G#2', file: 'hat_closed1.wav' },
  { id: 'bass', name: 'Bass', icon: Activity, pitch: 'D3', file: 'bass1.wav' }, 
  { id: 'lead', name: 'Lead', icon: Zap, pitch: 'C4', file: 'lead1.wav' },
  { id: 'stabs', name: 'Stabs', icon: Activity, pitch: 'C3', file: 'stabs1.wav' },
  { id: 'hoover', name: 'Hoover', icon: Disc, pitch: 'F3', file: 'hoover1.wav' },
];

const RHYTHM_LIB = {
  OFFBEAT: [2, 6, 10, 14],
  GALLOP: [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15],
  ROLLING: [0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15],
  DEMENTED: [0, 3, 6, 8, 11, 14],
  BROKEN: [0, 3, 8, 11, 14],
  SPEED: Array.from({ length: 16 }, (_, i) => i),
  TECH: [2, 4, 6, 10, 12, 14],
  BOUNCE: [0, 3, 6, 9, 12],
  HARD: [0, 4, 8, 12],
  SYNCO: [0, 3, 6, 9, 12, 15]
};

const MELODY_LIB = [
  { name: 'The Donk', pattern: [0, 0, 12, 0, 0, 0, 12, 0], rhythm: 'GALLOP' },
  { name: 'Siren', pattern: [0, 0, 0, 0], rhythm: 'OFFBEAT' },
  { name: 'Arp Up', pattern: [0, 2, 4, 7, 12, 7, 4, 2], rhythm: 'SPEED' },
  { name: 'Acid Walk', pattern: [0, -1, 0, 2, 0, -2, 0, 5], rhythm: 'ROLLING' },
];

// --- UTILS ---
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const noteToMidiNum = (noteStr) => {
  if (!noteStr) return 0;
  const note = noteStr.replace(/[0-9-]/g, '');
  const octave = parseInt(noteStr.replace(/[^0-9-]/g, '') || '3', 10);
  const idx = KEYS.indexOf(note);
  return (octave + 1) * 12 + idx;
};

const noteFromScale = (root, scale, degree, octave) => {
  const intervals = {
    Major: [0, 2, 4, 5, 7, 9, 11],
    Minor: [0, 2, 3, 5, 7, 8, 10],
    Phrygian: [0, 1, 3, 5, 7, 8, 10],
    Dorian: [0, 2, 3, 5, 7, 9, 10],
    Blues: [0, 3, 5, 6, 7, 10],
    Aeolian: [0, 2, 3, 5, 7, 8, 10],
  }[scale] || [0, 2, 3, 5, 7, 8, 10];

  const rootIndex = KEYS.indexOf(root);
  const normalizedDegree = ((degree % intervals.length) + intervals.length) % intervals.length;
  const octaveShift = Math.floor(degree / intervals.length);
  const noteIndex = (rootIndex + intervals[normalizedDegree]) % 12;
  const finalOctave = octave + octaveShift + Math.floor((rootIndex + intervals[normalizedDegree]) / 12);
  
  return `${KEYS[noteIndex]}${finalOctave}`;
};

function writeMidiFile(notes) {
  const events = [];
  notes.forEach(n => {
    const midiNote = noteToMidiNum(n.pitch);
    const isDrum = ['kick', 'clap', 'snare', 'hat_open', 'hat_closed'].includes(n.instId);
    const channel = isDrum ? 9 : 0;
    
    events.push({ type: 'on', tick: n.startTick, note: midiNote, velocity: n.velocity || 100, channel });
    const durationTicks = parseInt(n.duration || '2') * (128 / 4);
    events.push({ type: 'off', tick: n.startTick + 100, note: midiNote, velocity: 0, channel });
  });
  events.sort((a, b) => a.tick - b.tick);

  const data = [
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x01, 0x00, 0x01, 0x00, 0x80,
    0x4d, 0x54, 0x72, 0x6b
  ];
  
  const trackData = [];
  let lastTick = 0;
  
  events.forEach(e => {
    let delta = e.tick - lastTick;
    lastTick = e.tick;
    
    let d = delta;
    const bytes = [];
    do {
      let b = d & 0x7f;
      d >>= 7;
      if (bytes.length > 0) b |= 0x80;
      bytes.unshift(b);
    } while (d > 0);
    trackData.push(...bytes);
    
    const status = (e.type === 'on' ? 0x90 : 0x80) | e.channel;
    trackData.push(status, e.note, e.velocity);
  });
  
  trackData.push(0x00, 0xff, 0x2f, 0x00);
  const len = trackData.length;
  data.push((len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff);
  data.push(...trackData);
  
  return new Uint8Array(data);
}

// --- AUDIO ENGINE ---
class AudioEngine {
  constructor(onStatusUpdate) {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;
    
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -10;
    this.compressor.ratio.value = 4;
    
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);
    
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.masterGain.connect(this.analyser);

    this.buffers = {};
    this.onStatusUpdate = onStatusUpdate || console.log;
  }

  async resume() {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  async loadBank(presets) {
    console.log("Loading samples...");
    const promises = presets.map(async (inst) => {
      if (inst.type === 'synth' || !inst.file) return;

      const path = `/samples/${inst.file}`;
      try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        this.buffers[inst.id] = audioBuffer;
        console.log(`Loaded ${inst.id}`);
      } catch (e) {
        console.warn(`Sample failed: ${path}, defaulting to synth.`);
      }
    });
    await Promise.all(promises);
    if(this.onStatusUpdate) this.onStatusUpdate('Ready');
  }

  playNote(instId, pitch, time, duration, velocity = 100) {
    if (this.buffers[instId]) {
      this.playSample(instId, time, velocity);
    } else {
      this.playSynth(instId, pitch, time, duration, velocity);
    }
  }

  playSample(id, time, velocity) {
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffers[id];
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(velocity / 127, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + source.buffer.duration);

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start(time);
  }

  playSynth(instId, pitch, time, duration, velocity) {
    const vel = velocity / 127;
    
    if (instId === 'kick') this.synthKick(time, vel);
    else if (instId === 'bass') this.synthBass(pitch, time, duration, vel);
    else if (instId === 'lead') this.synthLead(pitch, time, duration, vel);
    else if (instId.includes('hat')) this.synthHat(time, instId === 'hat_open', vel);
    else if (instId === 'clap') this.synthClap(time, vel);
  }

  synthKick(time, vel) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
    g.gain.setValueAtTime(vel, time);
    g.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
    osc.connect(g).connect(this.masterGain);
    osc.start(time); osc.stop(time + 0.5);
  }

  synthBass(pitch, time, dur, vel) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    const midi = noteToMidiNum(pitch);
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    osc.frequency.setValueAtTime(freq, time);
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 3, time);
    filter.frequency.exponentialRampToValueAtTime(freq, time + 0.2);

    g.gain.setValueAtTime(vel, time);
    g.gain.exponentialRampToValueAtTime(0.01, time + dur); 
    
    osc.connect(filter).connect(g).connect(this.masterGain);
    osc.start(time); osc.stop(time + dur);
  }
  
  synthLead(pitch, time, dur, vel) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    const freq = 440 * Math.pow(2, (noteToMidiNum(pitch) - 69) / 12);
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(vel * 0.4, time);
    g.gain.linearRampToValueAtTime(0, time + dur);
    osc.connect(g).connect(this.masterGain);
    osc.start(time); osc.stop(time + dur);
  }

  synthHat(time, isOpen, vel) {
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = isOpen ? 6000 : 9000;
    
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vel * 0.5, time);
    g.gain.exponentialRampToValueAtTime(0.01, time + (isOpen ? 0.3 : 0.05));
    
    noise.connect(filter).connect(g).connect(this.masterGain);
    noise.start(time);
  }
  
  synthClap(time, vel) {
      this.synthHat(time, false, vel * 1.5);
  }
}

// --- MAIN COMPONENT ---
export default function HardHouseGenerator() {
  const [bpm, setBpm] = useState(150);
  const [selectedKey, setSelectedKey] = useState('F');
  const [selectedScale, setSelectedScale] = useState('Minor');
  const [selectedStyle, setSelectedStyle] = useState('Generic');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPattern, setCurrentPattern] = useState([]);
  const [selectedInstruments, setSelectedInstruments] = useState(['kick', 'hat_open', 'bass', 'lead']);
  const [errorMsg, setErrorMsg] = useState('');
  const [audioStatus, setAudioStatus] = useState('Initializing...');

  // --- THE MASTER SWITCH (Prevents Echo) ---
  const isPlayingRef = useRef(false);
  const canvasRef = useRef(null);

  // --- GLOBAL INIT ---
  useEffect(() => {
    if (!window.HARDHOUSE_AUDIO) {
      window.HARDHOUSE_AUDIO = new AudioEngine((status) => setAudioStatus(status));
      window.HARDHOUSE_AUDIO.loadBank(INSTRUMENT_PRESETS);
    } else {
      setAudioStatus('Ready');
    }
  }, []);

  // Visualizer Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !window.HARDHOUSE_AUDIO) return;
    const ctx = canvas.getContext('2d');
    const analyser = window.HARDHOUSE_AUDIO.analyser;
    if (!ctx) return;

    let animationId;
    const draw = () => {
      animationId = requestAnimationFrame(draw);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = canvas.width / dataArray.length;
      let x = 0;

      for (let i = 0; i < dataArray.length; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        if (i < 5) ctx.fillStyle = `rgb(57, 255, 20)`; // Bass - Green
        else if (i < 20) ctx.fillStyle = `rgb(0, 255, 255)`; // Mids - Cyan
        else ctx.fillStyle = `rgb(255, 0, 255)`; // Highs - Pink

        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth;
      }
    };
    if (isPlaying) draw();
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying]);

  // --- RECURSIVE LOOP (GUARDED) ---
  const scheduleLoop = useCallback((notes) => {
    // 1. THE KILL SWITCH: If this is false, STOP IMMEDIATELY.
    if (!isPlayingRef.current) return;

    if (!window.HARDHOUSE_AUDIO || !window.HARDHOUSE_AUDIO.ctx) return;
    const ctx = window.HARDHOUSE_AUDIO.ctx;
    
    if (ctx.state === 'closed') return;

    const step = (60 / bpm) / 4;
    const now = ctx.currentTime + 0.1;

    notes.forEach(n => {
      const start = now + (n.startTick / 128) * step;
      const dur = parseInt(n.duration || '2') * step;
      window.HARDHOUSE_AUDIO.playNote(n.instId, n.pitch, start, dur, n.velocity || 100);
    });

    setTimeout(() => scheduleLoop(notes), (16 * step) * 1000);
  }, [bpm]);

  // --- STOP LOGIC ---
  const stopPlayback = useCallback(() => {
    // Flip the switch immediately
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  // --- CHAOS MODE ---
  const generateLocalPattern = () => {
    const notes = [];
    const leadBase = pickRandom(MELODY_LIB);
    
    const leadRhythm = RHYTHM_LIB[pickRandom(Object.keys(RHYTHM_LIB))];
    const bassRhythm = RHYTHM_LIB[pickRandom(['OFFBEAT', 'ROLLING', 'GALLOP', 'HARD'])];
    const hatRhythm = Math.random() > 0.5 ? RHYTHM_LIB.OFFBEAT : RHYTHM_LIB.SPEED;

    for (let step = 0; step < 16; step++) {
      if (selectedInstruments.includes('kick') && step % 4 === 0) {
        notes.push({ instId: 'kick', pitch: 'C2', duration: '1', velocity: 127, startTick: step * 128 });
      }
      if (selectedInstruments.includes('bass') && bassRhythm.includes(step)) {
        notes.push({ instId: 'bass', pitch: noteFromScale(selectedKey, selectedScale, 0, 2), duration: '2', velocity: 110, startTick: step * 128 });
      }
      if (selectedInstruments.includes('lead') && leadRhythm.includes(step)) {
        const mutation = Math.random() > 0.8 ? (Math.random() > 0.5 ? 2 : -2) : 0;
        const degree = leadBase.pattern[step % leadBase.pattern.length] + mutation;
        notes.push({ instId: 'lead', pitch: noteFromScale(selectedKey, selectedScale, degree, 4), duration: '2', velocity: 100, startTick: step * 128 });
      }
      if (selectedInstruments.includes('hat_open') && step % 4 === 2) {
        notes.push({ instId: 'hat_open', pitch: 'F#2', duration: '2', velocity: 90, startTick: step * 128 });
      }
       if (selectedInstruments.includes('hat_closed') && !hatRhythm.includes(step) && step % 2 === 0) {
        notes.push({ instId: 'hat_closed', pitch: 'G#2', duration: '1', velocity: 60, startTick: step * 128 });
      }
    }
    return notes;
  };

  const handleLaunch = async () => {
    // TOGGLE OFF
    if (isPlaying) { 
      stopPlayback(); 
      return; 
    }

    // TOGGLE ON
    if (!window.HARDHOUSE_AUDIO) return;
    await window.HARDHOUSE_AUDIO.resume();

    // 1. FLIP THE MASTER SWITCH ON
    isPlayingRef.current = true;
    setErrorMsg('');

    if (prompt.trim()) {
      setIsGenerating(true);
      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            prompt, 
            instruments: selectedInstruments, 
            key: selectedKey, 
            scale: selectedScale, 
            bpm 
          }),
        });

        const json = await response.json();
        
        if (!response.ok || !json.data) throw new Error("AI Failed");
        
        if (json.data && Array.isArray(json.data)) {
          const aiNotes = json.data.map((n) => ({
            instId: n.instId.toLowerCase(),
            pitch: n.pitch,
            duration: n.duration || '2',
            velocity: n.velocity || 100,
            startTick: (n.step || 0) * 128
          })).filter((n) => selectedInstruments.includes(n.instId));

          setCurrentPattern(aiNotes);
          setIsPlaying(true);
          scheduleLoop(aiNotes);
        }
      } catch (error) {
        console.warn("AI Generation failed, falling back to local chaos.", error);
        setErrorMsg('AI Offline - Using Chaos Mode');
        const notes = generateLocalPattern(); 
        setCurrentPattern(notes);
        setIsPlaying(true);
        scheduleLoop(notes);
      } finally {
        setIsGenerating(false);
      }
    } 
    else {
      const notes = generateLocalPattern();
      setCurrentPattern(notes);
      setIsPlaying(true);
      scheduleLoop(notes);
    }
  };

  const handleDownloadMidi = () => {
    if (currentPattern.length === 0) return;
    const midiBytes = writeMidiFile(currentPattern);
    const blob = new Blob([midiBytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hardhouse_pattern_${Date.now()}.mid`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSmartSuggest = () => {
    if (selectedInstruments.includes('hoover')) {
      setSelectedKey('F#'); setSelectedScale('Minor');
    } else {
      setSelectedKey('F'); setSelectedScale('Minor');
    }
  };

  const toggleInstrument = (id) =>
    setSelectedInstruments((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  return (
    <div className="min-h-screen bg-[#050505] text-white py-12 px-6 font-sans selection:bg-[#39FF14] selection:text-black">
      <div className="max-w-6xl mx-auto space-y-12">
        
        <header className="text-center space-y-4">
          <h1 className="text-7xl md:text-9xl font-black italic tracking-tighter uppercase relative inline-block">
            <span className="text-[#FF00FF] drop-shadow-[0_0_15px_#FF00FF] animate-pulse">HARDHOUSE</span>
            <span className="text-[#39FF14] drop-shadow-[0_0_15px_#39FF14]">.AI</span>
          </h1>
          <div className="flex justify-center items-center gap-4 text-[#39FF14] font-bold tracking-[0.5em] text-xs uppercase">
            <span className="animate-flicker">Status: {audioStatus}</span>
            <div className={`h-2 w-2 rounded-full ${audioStatus === 'Ready' ? 'bg-[#39FF14]' : 'bg-red-500 animate-pulse'}`} />
            <span>Ver 5.0 (Final)</span>
          </div>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="relative group">
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="DESCRIBE THE DROP..."
                className="w-full bg-black border-4 border-[#39FF14]/20 rounded-3xl p-8 text-2xl text-[#39FF14] placeholder:text-[#39FF14]/10 focus:outline-none focus:border-[#39FF14] focus:shadow-[0_0_40px_rgba(57,255,20,0.1)] transition-all min-h-[160px] font-black uppercase"
              />
              {isGenerating && (
                <div className="absolute inset-0 bg-black/80 rounded-3xl flex items-center justify-center backdrop-blur-sm border-2 border-[#FF00FF]">
                   <div className="text-[#FF00FF] font-black animate-bounce tracking-widest text-xl">RIPPIN' THE SAMPLE...</div>
                </div>
              )}
               {errorMsg && (
                <div className="absolute bottom-4 right-4 flex items-center gap-2 text-[#FF00FF] font-black text-xs uppercase bg-black/50 px-3 py-1 rounded-full border border-[#FF00FF]">
                   <AlertCircle size={12} /> {errorMsg}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white/5 p-6 rounded-3xl border border-white/10">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-slate-500">Key</label>
                <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} className="w-full bg-transparent text-[#39FF14] font-black focus:outline-none cursor-pointer">
                  {KEYS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-slate-500">Scale</label>
                <select value={selectedScale} onChange={(e) => setSelectedScale(e.target.value)} className="w-full bg-transparent text-[#39FF14] font-black focus:outline-none cursor-pointer">
                  {SCALES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-black text-slate-500">BPM</label>
                <select value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="w-full bg-transparent text-[#39FF14] font-black focus:outline-none cursor-pointer">
                  {[140, 150, 160, 170, 180].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                 <label className="text-[10px] uppercase font-black text-slate-500">Style</label>
                 <select value={selectedStyle} onChange={(e) => setSelectedStyle(e.target.value)} className="w-full bg-transparent text-[#FF00FF] font-black focus:outline-none cursor-pointer">
                  {PRODUCER_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-full pt-2">
                 <button onClick={handleSmartSuggest} className="w-full flex items-center justify-center gap-2 py-2 text-[10px] font-black uppercase bg-[#39FF14] text-black rounded-xl hover:scale-105 transition-transform">
                   <Wand2 size={14} /> Smart Sync
                 </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center bg-white/5 rounded-3xl border border-white/10 p-8 space-y-6">
             <button
              onClick={handleLaunch}
              className={`w-48 h-48 rounded-full border-8 flex flex-col items-center justify-center gap-2 transition-all duration-500 active:scale-90 ${
                isPlaying ? 'border-[#FF00FF] bg-[#FF00FF]/10 shadow-[0_0_50px_#FF00FF]' : 'border-[#39FF14] bg-[#39FF14]/10 shadow-[0_0_50px_#39FF14]'
              }`}
             >
               {isPlaying ? <Square size={48} className="text-[#FF00FF]" /> : <Play size={48} className="text-[#39FF14]" />}
               <span className={`font-black text-sm uppercase tracking-widest ${isPlaying ? 'text-[#FF00FF]' : 'text-[#39FF14]'}`}>
                {isPlaying ? 'STOP' : 'LAUNCH'}
               </span>
             </button>
             <canvas ref={canvasRef} width={300} height={80} className="w-full h-20 opacity-50" />
             <button
              onClick={handleDownloadMidi}
              disabled={currentPattern.length === 0}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest border-2 transition-all ${
                currentPattern.length > 0 
                ? 'bg-[#39FF14] border-white text-black hover:scale-105' 
                : 'bg-transparent border-white/10 text-white/20 cursor-not-allowed'
              }`}
            >
              <Download size={16} /> Extract MIDI
            </button>
          </div>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {INSTRUMENT_PRESETS.map((inst) => (
            <button
              key={inst.id}
              onClick={() => toggleInstrument(inst.id)}
              className={`p-6 rounded-[2rem] border-2 flex flex-col items-center gap-3 transition-all ${
                selectedInstruments.includes(inst.id) ? 'border-[#39FF14] bg-[#39FF14]/10 shadow-[0_0_15px_rgba(57,255,20,0.2)]' : 'border-white/10 bg-white/5 grayscale opacity-50'
              }`}
            >
              <inst.icon size={24} className={selectedInstruments.includes(inst.id) ? 'text-[#39FF14]' : 'text-white'} />
              <span className="text-[10px] font-black uppercase tracking-widest">{inst.name}</span>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}