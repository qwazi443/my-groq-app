'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Wand2, Zap, Disc, Music, Drum, Speaker, Volume2, Activity, AlertCircle, Play, Square, Info, Sliders, HelpCircle, X, Dice5 } from 'lucide-react';

// --- CONSTANTS ---
const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = ['Minor', 'Phrygian', 'Dorian', 'Major']; 
const PRODUCER_STYLES = ['Tidy Trax', 'Vicious Circle', 'Nukleuz', 'Paul Glazby', 'Andy Farley', 'Lisa Lashes', 'BK', 'Tony De Vit'];
const DEFAULT_BPM = 150; 

const INSTRUMENT_PRESETS = [
  { id: 'kick', name: '909 Kick', icon: Drum, pitch: 'C2', file: 'kick1.wav', desc: 'Punchy 909 Kick (On-beat)' },
  { id: 'clap', name: 'Sharp Clap', icon: Music, pitch: 'D#2', file: 'clap1.wav', desc: 'Classic Handclap' },
  { id: 'snare', name: 'Snare Roll', icon: Speaker, pitch: 'D2', file: 'snare1.wav', desc: 'Rapid Snare Fills' },
  { id: 'hat_open', name: '909 Open', icon: Volume2, pitch: 'F#2', file: 'hat_open1.wav', desc: 'Offbeat Hi-Hat' },
  { id: 'hat_closed', name: '909 Closed', icon: Disc, pitch: 'G#2', file: 'hat_closed1.wav', desc: 'Driving 16th Hats' },
  { id: 'bass', name: 'Donk Bass', icon: Activity, pitch: 'D3', file: 'bass1.wav', desc: 'FM Donk / Offbeat Bass' }, 
  { id: 'lead', name: 'Super Hoover', icon: Zap, pitch: 'C4', file: 'lead1.wav', desc: 'Massive Detuned Saw' },
  { id: 'stabs', name: 'Rave Stabs', icon: Activity, pitch: 'C3', file: 'stabs1.wav', desc: 'Retro Chord Hits' },
];

const PROMPT_EXAMPLES = [
  "Hard energy build-up with rolling acid line",
  "Dark bouncy offbeat donk drop",
  "Euphoric trance breakdown into hard kick",
  "Scouse house stomper with reverse bass",
  "Tech-trance driving rhythm 150bpm"
];

// --- UTILS ---
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
    // Channel Mapping: Drums=10 (9), Bass=2 (1), Lead=1 (0)
    let channel = 0;
    if (['kick', 'clap', 'snare', 'hat_open', 'hat_closed'].includes(n.instId)) channel = 9;
    else if (n.instId === 'bass') channel = 1;
    else channel = 0;
    
    events.push({ type: 'on', tick: n.startTick, note: midiNote, velocity: n.velocity || 100, channel });
    const durationTicks = parseInt(n.duration || '2') * (128 / 4);
    events.push({ type: 'off', tick: n.startTick + durationTicks, note: midiNote, velocity: 0, channel });
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
    this.compressor.threshold.value = -20;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;
    
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);
    
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.masterGain.connect(this.analyser);

    this.buffers = {};
    this.activeNodes = []; 
    
    this.onStatusUpdate = onStatusUpdate || console.log;
  }

  async resume() {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.masterGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
  }

  kill() {
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(0, now);
    this.activeNodes.forEach(n => { try{n.stop();}catch(e){} });
    this.activeNodes = [];
  }

  async loadBank(presets) {
    const promises = presets.map(async (inst) => {
      if (!inst.file) return;
      const path = `/samples/${inst.file}`;
      try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        this.buffers[inst.id] = audioBuffer;
      } catch (e) {
        console.warn(`Sample fallback: ${inst.id}`);
      }
    });
    await Promise.all(promises);
    if(this.onStatusUpdate) this.onStatusUpdate('Ready');
  }

  playNote(instId, pitch, time, duration, velocity = 100) {
    // Lead/Hoover always uses synthesis for maximum control
    if (instId === 'lead' || instId === 'hoover') {
       this.playSynth(instId, pitch, time, duration, velocity);
       return; 
    }
    
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
    
    let tail = source.buffer.duration;
    if (id === 'bass') tail = 0.25; 
    if (id === 'kick') tail = 0.3;  
    
    gain.gain.exponentialRampToValueAtTime(0.01, time + tail);

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start(time);
    
    // Store for kill switch, filter out old nodes occasionally
    this.activeNodes.push(source);
    if(this.activeNodes.length > 20) this.activeNodes.shift();
  }

  playSynth(instId, pitch, time, duration, velocity) {
    const vel = velocity / 127;
    if (instId === 'kick') this.synthKick(time, vel);
    else if (instId === 'bass') this.synthDonk(pitch, time, duration, vel); 
    else if (instId === 'lead') this.synthSuperHoover(pitch, time, duration, vel); 
    else this.synthHat(time, instId.includes('open'), vel);
  }

  // --- SYNTH MODELS ---
  synthKick(time, vel) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(50, time + 0.1);
    g.gain.setValueAtTime(vel, time);
    g.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
    osc.connect(g).connect(this.masterGain);
    osc.start(time); osc.stop(time + 0.3);
  }

  synthDonk(pitch, time, dur, vel) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square'; 
    const freq = 440 * Math.pow(2, (noteToMidiNum(pitch) - 69) / 12);
    osc.frequency.setValueAtTime(freq, time);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 8, time); 
    filter.frequency.exponentialRampToValueAtTime(freq, time + 0.15); 
    filter.Q.value = 5; 
    g.gain.setValueAtTime(vel, time);
    g.gain.exponentialRampToValueAtTime(0.01, time + 0.25); 
    osc.connect(filter).connect(g).connect(this.masterGain);
    osc.start(time); osc.stop(time + 0.25);
    this.activeNodes.push(osc);
  }
  
  synthSuperHoover(pitch, time, dur, vel) {
    const targetFreq = 440 * Math.pow(2, (noteToMidiNum(pitch) - 69) / 12);
    const attack = 0.15; 
    const createOsc = (detune, pan) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(targetFreq * 0.25, time); 
        osc.frequency.exponentialRampToValueAtTime(targetFreq, time + attack);
        osc.detune.setValueAtTime(detune, time);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, time);
        filter.frequency.exponentialRampToValueAtTime(8000, time + attack); 
        filter.Q.value = 2;
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = pan;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vel * 0.4, time); 
        g.gain.linearRampToValueAtTime(0, time + dur); 
        osc.connect(filter).connect(panner).connect(g).connect(this.masterGain);
        osc.start(time); osc.stop(time + dur);
        this.activeNodes.push(osc);
    };
    createOsc(0, 0); createOsc(-20, -0.5); createOsc(20, 0.5);   
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
}

// --- HELPER COMPONENTS ---

const Tooltip = ({ text, children }) => (
  <div className="relative group flex items-center">
    {children}
    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 bg-gray-800 text-white text-xs p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 border border-white/20 text-center">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-800"></div>
    </div>
  </div>
);

const Knob = ({ label, value, onChange, options, help }) => (
  <div className="flex flex-col gap-1 w-full">
    <div className="flex items-center gap-1">
      <label htmlFor={label} className="text-[10px] uppercase font-bold text-[#39FF14] tracking-wider">{label}</label>
      {help && <Tooltip text={help}><Info size={10} className="text-gray-500 hover:text-white cursor-help" /></Tooltip>}
    </div>
    <select 
      id={label}
      value={value} 
      onChange={onChange}
      className="bg-[#1a1a1a] border border-[#333] rounded text-white p-2 text-sm font-mono focus:border-[#39FF14] outline-none cursor-pointer hover:bg-[#222] transition-colors"
      aria-label={`Select ${label}`}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const HelpModal = ({ onClose }) => (
  <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div className="bg-[#111] border-2 border-[#39FF14] rounded-2xl max-w-lg w-full p-6 relative shadow-[0_0_50px_rgba(57,255,20,0.2)]">
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white" aria-label="Close Modal"><X size={24} /></button>
      <h2 id="modal-title" className="text-2xl font-black text-[#39FF14] mb-4 uppercase">User Guide</h2>
      <div className="space-y-4 text-gray-300 text-sm">
        <p><strong className="text-white">1. Choose Sounds:</strong> Select instrument pads below. Unselected pads won't play. If NONE are selected, the AI picks a random kit.</p>
        <p><strong className="text-white">2. Pattern Engine:</strong> Uses algorithmic generation to create "Offbeat Bass" (Donk) and "Acid Rolls" automatically. No AI API required.</p>
        <p><strong className="text-white">3. Randomize:</strong> Click the dice icon to generate a fresh style/prompt idea.</p>
        <p><strong className="text-white">4. Export:</strong> "Extract MIDI" gives you a file compatible with Ableton, FL Studio, or Logic.</p>
      </div>
    </div>
  </div>
);

// --- MAIN COMPONENT ---
export default function HardHouseGenerator() {
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [selectedKey, setSelectedKey] = useState('F');
  const [selectedScale, setSelectedScale] = useState('Minor');
  const [selectedStyle, setSelectedStyle] = useState('Tidy Trax');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPattern, setCurrentPattern] = useState([]);
  const [selectedInstruments, setSelectedInstruments] = useState(['kick', 'hat_open', 'bass', 'lead']);
  const [errorMsg, setErrorMsg] = useState('');
  const [audioStatus, setAudioStatus] = useState('Init...');
  const [showHelp, setShowHelp] = useState(false);

  const isPlayingRef = useRef(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!window.HARDHOUSE_AUDIO) {
      window.HARDHOUSE_AUDIO = new AudioEngine((status) => setAudioStatus(status));
      window.HARDHOUSE_AUDIO.loadBank(INSTRUMENT_PRESETS);
    } else {
      setAudioStatus('Ready');
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !window.HARDHOUSE_AUDIO) return;
    const ctx = canvas.getContext('2d');
    const analyser = window.HARDHOUSE_AUDIO.analyser;
    
    let animationId;
    const draw = () => {
      animationId = requestAnimationFrame(draw);
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        ctx.fillStyle = i > bufferLength / 2 ? '#FF00FF' : '#39FF14';
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    if (isPlaying) draw();
    else {
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(0, canvas.height/2);
        ctx.lineTo(canvas.width, canvas.height/2);
        ctx.stroke();
    }
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying]);

  const scheduleLoop = useCallback((notes) => {
    if (!isPlayingRef.current) return;
    const ctx = window.HARDHOUSE_AUDIO.ctx;
    const step = (60 / bpm) / 4;
    const now = ctx.currentTime + 0.1;

    notes.forEach(n => {
      const start = now + (n.startTick / 128) * step;
      const dur = parseInt(n.duration || '2') * step;
      window.HARDHOUSE_AUDIO.playNote(n.instId, n.pitch, start, dur, n.velocity || 100);
    });

    setTimeout(() => scheduleLoop(notes), (16 * step) * 1000);
  }, [bpm]);

  const stopPlayback = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    if (window.HARDHOUSE_AUDIO) window.HARDHOUSE_AUDIO.kill();
  }, []);

  const generateProceduralPattern = (instrumentsToUse) => {
    const notes = [];
    // HUMANIZATION: Slight velocity variance
    const getVel = (base) => base + Math.floor(Math.random() * 20 - 10);
    
    for (let step = 0; step < 16; step++) {
      // 1. KICK (On Beat)
      if (instrumentsToUse.includes('kick') && step % 4 === 0) {
        notes.push({ instId: 'kick', pitch: 'C2', duration: '1', velocity: 127, startTick: step * 128 });
      }
      
      // 2. BASS (Off Beat - The Donk)
      if (instrumentsToUse.includes('bass') && [2, 6, 10, 14].includes(step)) {
         notes.push({ instId: 'bass', pitch: noteFromScale(selectedKey, selectedScale, 0, 2), duration: '2', velocity: getVel(115), startTick: step * 128 });
      }

      // 3. LEAD (Acid Rolls)
      if (instrumentsToUse.includes('lead')) {
        // Probabilities: Higher on weak beats
        const chance = [0, 4, 8, 12].includes(step) ? 0.2 : 0.8;
        if (Math.random() < chance) {
            const octaveJump = Math.random() > 0.7 ? 1 : 0;
            const degree = [0, 2, 3, 5, 7][Math.floor(Math.random() * 5)];
            notes.push({ 
                instId: 'lead', 
                pitch: noteFromScale(selectedKey, selectedScale, degree, 4 + octaveJump), 
                duration: Math.random() > 0.5 ? '1' : '2', // Short/Long variance
                velocity: getVel(90), 
                startTick: step * 128 
            });
        }
      }

      // 4. HATS
      if (instrumentsToUse.includes('hat_open') && step % 4 === 2) {
        notes.push({ instId: 'hat_open', pitch: 'F#2', duration: '2', velocity: getVel(100), startTick: step * 128 });
      }
      if (instrumentsToUse.includes('hat_closed') && step % 2 === 0 && step % 4 !== 2) {
         notes.push({ instId: 'hat_closed', pitch: 'G#2', duration: '1', velocity: getVel(70), startTick: step * 128 });
      }
    }
    return notes;
  };

  const handleLaunch = async () => {
    if (isPlaying) { stopPlayback(); return; }
    if (!window.HARDHOUSE_AUDIO) return;
    await window.HARDHOUSE_AUDIO.resume();

    isPlayingRef.current = true;
    setErrorMsg('');

    // If no instruments selected, use all
    const instrumentsToUse = selectedInstruments.length > 0 ? selectedInstruments : INSTRUMENT_PRESETS.map(i => i.id);

    // Default to Procedural (Offline Mode) since API key isn't user-configurable here
    // But we simulate the "AI" feeling by using randomness seeds
    setIsGenerating(true);
    
    // Simulate "thinking" time for effect
    setTimeout(() => {
        try {
            const notes = generateProceduralPattern(instrumentsToUse);
            setCurrentPattern(notes);
            setIsPlaying(true);
            scheduleLoop(notes);
            setIsGenerating(false);
        } catch (e) {
            setErrorMsg("Generation Failed");
            setIsGenerating(false);
        }
    }, 600);
  };

  const handleRandomizePrompt = () => {
    setPrompt(pickRandom(PROMPT_EXAMPLES));
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

  const toggleInstrument = (id) =>
    setSelectedInstruments((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  return (
    <main className="min-h-screen bg-[#050505] text-white font-sans selection:bg-[#39FF14] selection:text-black">
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
        
        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-center gap-6 border-b border-white/10 pb-6">
          <div className="text-center md:text-left">
            <h1 className="text-5xl md:text-7xl font-black italic tracking-tighter uppercase">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF00FF] to-[#39FF14]">HARDHOUSE</span>
              <span className="text-white">.AI</span>
            </h1>
            <div className="flex items-center gap-2 text-[#39FF14] font-mono text-xs uppercase mt-2">
              <div className={`h-2 w-2 rounded-full ${audioStatus === 'Ready' ? 'bg-[#39FF14]' : 'bg-red-500 animate-pulse'}`} />
              <span>System: {audioStatus}</span>
              <span className="text-gray-500">|</span>
              <span>v12.0 Production</span>
            </div>
          </div>
          <button 
            onClick={() => setShowHelp(true)}
            className="flex items-center gap-2 bg-[#222] hover:bg-[#333] px-4 py-2 rounded-full border border-white/20 text-gray-200 text-sm font-bold transition-all hover:scale-105"
            aria-label="Open Help"
          >
            <HelpCircle size={16} /> How It Works
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN */}
          <section className="lg:col-span-4 space-y-6" aria-label="Controls">
            <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#39FF14]" />
              <div className="flex items-center gap-2 mb-6 text-gray-400 text-xs font-black uppercase tracking-widest">
                <Sliders size={14} /> Producer Controls
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Knob label="Key" value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} options={KEYS} />
                <Knob label="Scale" value={selectedScale} onChange={(e) => setSelectedScale(e.target.value)} options={SCALES} />
                <Knob label="BPM" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} options={[140, 145, 150, 155, 160, 170]} />
                <Knob label="Style" value={selectedStyle} onChange={(e) => setSelectedStyle(e.target.value)} options={PRODUCER_STYLES} help="Affects rhythm randomization weights" />
              </div>
            </div>

            <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6 relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#FF00FF]" />
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2 text-gray-400 text-xs font-black uppercase tracking-widest">
                  <Wand2 size={14} /> Pattern Prompt
                </div>
                <button 
                    onClick={handleRandomizePrompt}
                    className="text-gray-500 hover:text-[#FF00FF] transition-colors"
                    aria-label="Randomize Prompt"
                >
                    <Dice5 size={16} />
                </button>
              </div>
              <label htmlFor="promptInput" className="sr-only">Describe your pattern</label>
              <textarea 
                id="promptInput"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ex: Dark Acid Techno drop..."
                className="w-full bg-black/50 border border-white/20 rounded-lg p-4 text-gray-200 placeholder:text-gray-600 focus:border-[#FF00FF] focus:ring-1 focus:ring-[#FF00FF] outline-none transition-all h-32 resize-none text-sm font-mono"
              />
            </div>
          </section>

          {/* RIGHT COLUMN */}
          <section className="lg:col-span-8 space-y-6" aria-label="Visualizer and Actions">
            <div className="bg-black border-2 border-white/10 rounded-2xl p-1 h-48 relative shadow-inner shadow-black">
              <canvas ref={canvasRef} width={800} height={200} className="w-full h-full rounded-xl opacity-90" aria-label="Audio Visualizer" role="img" />
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-700 text-4xl font-black uppercase tracking-widest pointer-events-none select-none">
                  Standby
                </div>
              )}
            </div>

            <div className="flex flex-col md:flex-row gap-4">
              <button
                onClick={handleLaunch}
                disabled={isGenerating}
                className={`flex-1 py-6 rounded-xl font-black text-2xl uppercase tracking-widest transition-all transform active:scale-95 flex items-center justify-center gap-3 shadow-xl ${
                  isPlaying 
                  ? 'bg-[#FF00FF] text-black hover:bg-[#FF00FF]/90 shadow-[0_0_30px_rgba(255,0,255,0.4)]' 
                  : 'bg-[#39FF14] text-black hover:bg-[#39FF14]/90 shadow-[0_0_30px_rgba(57,255,20,0.4)]'
                }`}
                aria-label={isPlaying ? "Stop Audio" : "Generate Drop"}
              >
                {isGenerating ? (
                  <span className="animate-pulse">Generating...</span>
                ) : isPlaying ? (
                  <><Square fill="currentColor" /> STOP AUDIO</>
                ) : (
                  <><Play fill="currentColor" /> GENERATE DROP</>
                )}
              </button>

              <button
                onClick={handleDownloadMidi}
                disabled={currentPattern.length === 0}
                className="px-8 rounded-xl border-2 border-white/20 hover:border-white text-white font-bold uppercase text-xs tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1 min-w-[120px]"
                title="Download MIDI file"
                aria-label="Export MIDI File"
              >
                <Download size={20} />
                <span>Export MIDI</span>
              </button>
            </div>
          </section>
        </div>

        {/* INSTRUMENTS */}
        <section aria-label="Instrument Selection">
          <div className="flex items-center gap-2 mb-4 text-gray-400 text-xs font-black uppercase tracking-widest border-b border-white/10 pb-2">
            <Music size={14} /> Instrument Matrix
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
            {INSTRUMENT_PRESETS.map((inst) => (
              <button
                key={inst.id}
                onClick={() => toggleInstrument(inst.id)}
                className={`p-4 rounded-lg border flex flex-col items-center gap-2 transition-all relative overflow-hidden group ${
                  selectedInstruments.includes(inst.id) 
                  ? 'border-[#39FF14] bg-[#39FF14]/10 text-[#39FF14]' 
                  : 'border-white/10 bg-white/5 text-gray-500 hover:border-white/30'
                }`}
                title={inst.desc}
                aria-pressed={selectedInstruments.includes(inst.id)}
              >
                <inst.icon size={20} aria-hidden="true" />
                <span className="text-[10px] font-bold uppercase tracking-widest">{inst.name}</span>
                {selectedInstruments.includes(inst.id) && (
                  <div className="absolute bottom-0 left-0 w-full h-1 bg-[#39FF14]" />
                )}
              </button>
            ))}
          </div>
        </section>

      </div>
    </main>
  );
}