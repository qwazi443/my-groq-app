'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
// Using ONLY safe, older icons guaranteed to exist in v0.294.0
import { Download, Zap, Disc, Music, Speaker, Volume2, Activity, AlertCircle, Play, Square, Info, Sliders, HelpCircle, X, Settings, Box } from 'lucide-react';
import JSZip from 'jszip'; 

// --- ERROR BOUNDARY (Prevents White Screen) ---
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: '#FF00FF', padding: '50px', background: '#000', fontFamily: 'monospace' }}>
          <h1>CRITICAL SYSTEM FAILURE</h1>
          <p>The app crashed. Here is the error:</p>
          <pre style={{ border: '1px solid #333', padding: '20px' }}>{this.state.error.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- CONSTANTS ---
const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = ['Minor', 'Phrygian', 'Dorian', 'Major', 'Harmonic Minor']; 
const PRODUCER_STYLES = ['Tidy Trax', 'Vicious Circle', 'Nukleuz', 'Paul Glazby', 'Andy Farley', 'Lisa Lashes', 'BK', 'Tony De Vit'];
const DEFAULT_BPM = 150; 

// Replaced 'Drum' with 'Disc' (Safe)
const INSTRUMENT_PRESETS = [
  { id: 'kick', name: '909 Kick', icon: Disc, pitch: 'C2', file: 'kick1.wav', desc: 'Punchy 909 Kick (On-beat)' },
  { id: 'clap', name: 'Sharp Clap', icon: Music, pitch: 'D#2', file: 'clap1.wav', desc: 'Classic Handclap' },
  { id: 'snare', name: 'Snare Roll', icon: Speaker, pitch: 'D2', file: 'snare1.wav', desc: 'Rapid Snare Fills' },
  { id: 'hat_open', name: '909 Open', icon: Volume2, pitch: 'F#2', file: 'hat_open1.wav', desc: 'Offbeat Hi-Hat' },
  { id: 'hat_closed', name: '909 Closed', icon: Disc, pitch: 'G#2', file: 'hat_closed1.wav', desc: 'Driving 16th Hats' },
  { id: 'bass', name: 'Donk Bass', icon: Activity, pitch: 'D3', file: 'bass1.wav', desc: 'FM Donk / Offbeat Bass' }, 
  { id: 'lead', name: 'Alpha Hoover', icon: Zap, pitch: 'C4', file: 'lead1.wav', desc: 'Massive Pitch-Ramp Saw' },
  { id: 'hoover', name: 'Acid Screech', icon: Disc, pitch: 'F3', file: 'hoover1.wav', desc: 'Distorted 303 Square' },
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
    'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11]  
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
    let channel = 0;
    if (['kick', 'clap', 'snare', 'hat_open', 'hat_closed'].includes(n.instId)) channel = 9; 
    else if (n.instId === 'bass') channel = 1; 
    else if (n.instId === 'lead') channel = 0; 
    else if (n.instId === 'hoover') channel = 2; 
    else if (n.instId === 'stabs') channel = 3; 
    
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

function makeDistortionCurve(amount) {
  const k = typeof amount === 'number' ? amount : 50;
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

// --- AUDIO ENGINE ---
class AudioEngine {
  constructor(onStatusUpdate, onSampleStatus) {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;
    
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -12;
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);
    
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.masterGain.connect(this.analyser);

    this.distCurve = makeDistortionCurve(200); 

    this.buffers = {};
    this.activeNodes = []; 
    
    this.onStatusUpdate = onStatusUpdate || console.log;
    this.onSampleStatus = onSampleStatus || console.log;
    this.allowSynths = true; 
  }

  setAllowSynths(allowed) {
      this.allowSynths = allowed;
  }

  async resume() {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  kill() {
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(0, now);
    this.masterGain.gain.linearRampToValueAtTime(0.5, now + 0.1); 
    this.activeNodes.forEach(n => { try{n.stop();}catch(e){} });
    this.activeNodes = [];
  }

  async loadBank(presets) {
    const promises = presets.map(async (inst) => {
      if (!inst.file) return;
      // PATH HUNTER: Try relative paths first to fix Vercel lookup
      const possiblePaths = [
          `samples/${inst.file}`, 
          `/samples/${inst.file}`, 
          inst.file
      ];

      let loaded = false;
      for (const path of possiblePaths) {
          if (loaded) break;
          try {
            this.onSampleStatus(inst.id, 'loading');
            const response = await fetch(path);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const type = response.headers.get("content-type");
            if (type && type.includes("text/html")) throw new Error("HTML (404)");

            const arrayBuffer = await response.arrayBuffer();
            if (arrayBuffer.byteLength < 2000) throw new Error("Too small");

            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.buffers[inst.id] = audioBuffer;
            loaded = true;
            this.onSampleStatus(inst.id, 'success');
          } catch (e) {
            // Try next path
          }
      }
      
      if (!loaded) {
          console.warn(`All paths failed for ${inst.id}`);
          this.onSampleStatus(inst.id, 'error');
      }
    });
    await Promise.all(promises);
    if(this.onStatusUpdate) this.onStatusUpdate('Ready');
  }

  playNote(instId, pitch, time, duration, velocity = 100) {
    if (!this.buffers[instId] && !this.allowSynths) return;

    // 1. FORCE SYNTH FOR LEAD & HOOVER
    if (instId === 'lead' || instId === 'hoover') {
       this.playSynth(instId, pitch, time, duration, velocity);
       return; 
    }
    
    // 2. PLAY SAMPLE IF EXISTS
    if (this.buffers[instId]) {
      this.playSample(instId, time, velocity);
    } else {
      this.playSynth(instId, pitch, time, duration, velocity);
    }
  }

  preview(instId) {
    this.resume();
    const now = this.ctx.currentTime;
    const pitch = instId === 'bass' ? 'D3' : instId === 'lead' ? 'C4' : 'C3';
    this.playNote(instId, pitch, now, '1', 100);
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
    this.activeNodes.push(source);
    if(this.activeNodes.length > 40) this.activeNodes.shift();
  }

  playSynth(instId, pitch, time, duration, velocity) {
    if (!this.allowSynths) return;
    const vel = velocity / 127;
    if (instId === 'kick') this.synthKick(time, vel);
    else if (instId === 'bass') this.synthDonk(pitch, time, duration, vel); 
    else if (instId === 'lead') this.synthMassiveHoover(pitch, time, duration, vel); 
    else if (instId === 'hoover') this.synthAcidScreech(pitch, time, duration, vel); 
    else this.synthHat(time, instId.includes('open'), vel);
  }

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
  
  synthMassiveHoover(pitch, time, dur, vel) {
    const targetFreq = 440 * Math.pow(2, (noteToMidiNum(pitch) - 69) / 12);
    const attack = 0.15; 
    const createOsc = (detune, pan, type = 'sawtooth', octShift = 0) => {
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(targetFreq * 0.5, time); 
        osc.frequency.exponentialRampToValueAtTime(targetFreq * (octShift === -1 ? 0.5 : 1), time + attack);
        osc.detune.setValueAtTime(detune, time);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, time);
        filter.frequency.exponentialRampToValueAtTime(12000, time + attack); 
        filter.Q.value = 1;
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = pan;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vel * 0.25, time); 
        g.gain.linearRampToValueAtTime(0, time + dur); 
        osc.connect(filter).connect(panner).connect(g).connect(this.masterGain);
        osc.start(time); osc.stop(time + dur);
        this.activeNodes.push(osc);
    };
    createOsc(0, 0); createOsc(-25, -0.6); createOsc(25, 0.6); createOsc(-10, -0.3); createOsc(10, 0.3); createOsc(0, 0, 'square', -1);
  }

  synthAcidScreech(pitch, time, dur, vel) {
    const freq = 440 * Math.pow(2, (noteToMidiNum(pitch) - 69) / 12);
    const osc = this.ctx.createOscillator();
    osc.type = 'square'; 
    osc.frequency.setValueAtTime(freq, time);
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.distCurve;
    shaper.oversample = '4x';
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, time);
    filter.frequency.exponentialRampToValueAtTime(2500, time + 0.1); 
    filter.frequency.exponentialRampToValueAtTime(freq, time + dur);
    filter.Q.value = 15; 
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vel * 0.5, time);
    g.gain.exponentialRampToValueAtTime(0.01, time + dur);
    osc.connect(filter).connect(shaper).connect(g).connect(this.masterGain);
    osc.start(time); osc.stop(time + dur);
    this.activeNodes.push(osc);
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

// --- COMPONENTS ---

// Manual Check Icon because 'Check' might not exist in old Lucide
const CheckIcon = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>;
const AlertIcon = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;

const HelpModal = ({ onClose, sampleStatus }) => (
  <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
    <div className="bg-[#111] border-2 border-[#39FF14] rounded-2xl max-w-lg w-full p-6 relative shadow-[0_0_50px_rgba(57,255,20,0.2)]">
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X size={24} /></button>
      <h2 className="text-2xl font-black text-[#39FF14] mb-4 uppercase">System Status</h2>
      
      <div className="grid grid-cols-2 gap-2 mb-6 text-xs font-mono border border-white/10 p-4 rounded bg-black/50">
        {Object.entries(sampleStatus).map(([id, status]) => (
            <div key={id} className="flex items-center justify-between border-b border-white/5 pb-1">
                <span className="uppercase text-gray-400">{id}</span>
                {status === 'success' && <span className="text-[#39FF14] flex items-center gap-1"><CheckIcon/> WAV OK</span>}
                {status === 'error' && <span className="text-[#FF00FF] flex items-center gap-1"><AlertIcon/> SYNTH</span>}
                {status === 'loading' && <span className="text-gray-500">...</span>}
            </div>
        ))}
      </div>
      <button onClick={onClose} className="w-full mt-6 bg-[#39FF14] text-black font-bold py-3 rounded hover:opacity-90">CLOSE</button>
    </div>
  </div>
);

// --- MAIN COMPONENT ---
function HardHouseGenerator() {
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [selectedKey, setSelectedKey] = useState('F');
  const [selectedScale, setSelectedScale] = useState('Minor');
  const [selectedStyle, setSelectedStyle] = useState('Tidy Trax');
  const [density, setDensity] = useState(0.7);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPattern, setCurrentPattern] = useState([]);
  const [selectedInstruments, setSelectedInstruments] = useState(['kick', 'hat_open', 'bass', 'lead']);
  const [errorMsg, setErrorMsg] = useState('');
  const [audioStatus, setAudioStatus] = useState('Init...');
  const [showHelp, setShowHelp] = useState(true);
  const [sampleStatus, setSampleStatus] = useState({});
  const [allowSynths, setAllowSynths] = useState(true);

  const isPlayingRef = useRef(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!window.HARDHOUSE_AUDIO) {
      window.HARDHOUSE_AUDIO = new AudioEngine(
          (status) => setAudioStatus(status),
          (id, status) => setSampleStatus(prev => ({...prev, [id]: status}))
      );
      window.HARDHOUSE_AUDIO.loadBank(INSTRUMENT_PRESETS);
    } else {
      setAudioStatus('Ready');
    }
  }, []);

  useEffect(() => {
      if (window.HARDHOUSE_AUDIO) window.HARDHOUSE_AUDIO.setAllowSynths(allowSynths);
  }, [allowSynths]);

  // VISUALIZER
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
    const getVel = (base) => base + Math.floor(Math.random() * 20 - 10);
    
    for (let step = 0; step < 16; step++) {
      if (instrumentsToUse.includes('kick') && step % 4 === 0) {
        notes.push({ instId: 'kick', pitch: 'C2', duration: '1', velocity: 127, startTick: step * 128 });
      }
      
      if (instrumentsToUse.includes('bass')) {
         if ([2, 6, 10, 14].includes(step)) {
            notes.push({ instId: 'bass', pitch: noteFromScale(selectedKey, selectedScale, 0, 2), duration: '2', velocity: getVel(115), startTick: step * 128 });
         }
      }

      if (instrumentsToUse.includes('lead')) {
        const baseChance = [0, 4, 8, 12].includes(step) ? 0.3 : 0.8; 
        if (Math.random() < baseChance * density) {
            const octaveJump = Math.random() > 0.7 ? 1 : 0;
            const degree = [0, 2, 3, 5, 7][Math.floor(Math.random() * 5)];
            notes.push({ 
                instId: 'lead', 
                pitch: noteFromScale(selectedKey, selectedScale, degree, 4 + octaveJump), 
                duration: Math.random() > 0.5 ? '1' : '2', 
                velocity: getVel(90), 
                startTick: step * 128 
            });
        }
      }

      if (instrumentsToUse.includes('hoover')) {
         if (Math.random() < 0.2 * density) {
             const degree = [0, 5, 7][Math.floor(Math.random() * 3)];
             notes.push({ 
                 instId: 'hoover', 
                 pitch: noteFromScale(selectedKey, selectedScale, degree, 3), 
                 duration: '1', 
                 velocity: getVel(100), 
                 startTick: step * 128 
             });
         }
      }

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

    const instrumentsToUse = selectedInstruments.length > 0 ? selectedInstruments : INSTRUMENT_PRESETS.map(i => i.id);

    setIsGenerating(true);
    setTimeout(() => {
        const notes = generateProceduralPattern(instrumentsToUse);
        setCurrentPattern(notes);
        setIsPlaying(true);
        scheduleLoop(notes);
        setIsGenerating(false);
    }, 600);
  };

  const handlePreview = (instId, e) => {
    e.stopPropagation();
    if (window.HARDHOUSE_AUDIO) window.HARDHOUSE_AUDIO.preview(instId);
  };

  const handleDownloadMidi = async () => {
    if (currentPattern.length === 0) return;
    const zip = new JSZip();
    const fullMidi = writeMidiFile(currentPattern);
    zip.file("full_pattern.mid", fullMidi);
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hardhouse_kit.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const toggleInstrument = (id) =>
    setSelectedInstruments((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  return (
    <main className="min-h-screen bg-[#050505] text-white font-sans selection:bg-[#39FF14] selection:text-black">
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} sampleStatus={sampleStatus} />}
      
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
        <header className="flex flex-col md:flex-row justify-between items-center gap-6 border-b border-white/10 pb-6">
          <div className="text-center md:text-left">
            <h1 className="text-5xl md:text-7xl font-black italic tracking-tighter uppercase">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF00FF] to-[#39FF14]">HARDHOUSE</span>
              <span className="text-white">.AI</span>
            </h1>
            <div className="flex items-center gap-2 text-[#39FF14] font-mono text-xs uppercase mt-2">
              <div className={`h-2 w-2 rounded-full ${audioStatus === 'Ready' ? 'bg-[#39FF14]' : 'bg-red-500 animate-pulse'}`} />
              <span>v17.2 Safe Mode</span>
            </div>
          </div>
          <div className="flex gap-2">
              <button 
                onClick={() => setAllowSynths(!allowSynths)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold transition-all ${allowSynths ? 'bg-[#FF00FF]/10 border-[#FF00FF] text-[#FF00FF]' : 'bg-gray-800 border-gray-600 text-gray-400'}`}
              >
                {allowSynths ? 'Backup Synths: ON' : 'Backup Synths: OFF'}
              </button>
              <button onClick={() => setShowHelp(true)} className="flex items-center gap-2 bg-[#222] hover:bg-[#333] px-4 py-2 rounded-full border border-white/20 text-gray-200 text-sm font-bold">
                <HelpCircle size={16} /> Asset Status
              </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <section className="lg:col-span-4 space-y-6">
             {/* SIMPLIFIED CONTROLS FOR SAFETY */}
             <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                    <span className="text-[#39FF14] font-bold uppercase text-xs">BPM</span>
                    <input type="number" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} className="bg-[#222] text-white p-1 rounded w-16 text-center" />
                </div>
             </div>
          </section>

          <section className="lg:col-span-8 space-y-6">
            <div className="bg-black border-2 border-white/10 rounded-2xl p-1 h-64 relative">
              <canvas ref={canvasRef} width={800} height={256} className="w-full h-full rounded-xl opacity-90" />
            </div>
            <div className="flex gap-4">
              <button onClick={handleLaunch} className="flex-1 py-6 bg-[#39FF14] text-black font-black text-2xl uppercase rounded-xl hover:opacity-90">
                {isPlaying ? "STOP" : "GENERATE DROP"}
              </button>
              <button onClick={handleDownloadMidi} className="px-8 border-2 border-white/20 text-white font-bold uppercase rounded-xl hover:border-white">
                <Package size={20} />
              </button>
            </div>
          </section>
        </div>

        <section>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
            {INSTRUMENT_PRESETS.map((inst) => (
              <button
                key={inst.id}
                onClick={() => toggleInstrument(inst.id)}
                className={`p-3 pt-8 pb-4 rounded-lg border flex flex-col items-center gap-2 relative overflow-hidden ${selectedInstruments.includes(inst.id) ? 'border-[#39FF14] bg-[#39FF14]/10 text-[#39FF14]' : 'border-white/10 bg-white/5 text-gray-500'}`}
              >
                <div onClick={(e) => handlePreview(inst.id, e)} className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-white text-white hover:text-black rounded-full z-10">
                    <Volume1 size={12} />
                </div>
                {/* STATUS DOT */}
                <div className={`absolute top-2 left-2 w-2 h-2 rounded-full ${sampleStatus[inst.id] === 'success' ? 'bg-[#39FF14]' : sampleStatus[inst.id] === 'error' ? 'bg-[#FF00FF]' : 'bg-gray-600'}`} />
                <inst.icon size={24} />
                <span className="text-[10px] font-bold uppercase tracking-widest">{inst.name}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <HardHouseGenerator />
    </ErrorBoundary>
  );
}