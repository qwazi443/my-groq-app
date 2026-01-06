'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Wand2, Zap, Disc, Music, Drum, Speaker, Volume2, Activity, AlertCircle, Play, Square, Info, Sliders, HelpCircle, X } from 'lucide-react';

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

const RHYTHM_LIB = {
  OFFBEAT: [2, 6, 10, 14], 
  GALLOP: [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15], 
  ROLLING: [0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15],
  ACID_ROLL: [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14], 
  DEMENTED: [0, 3, 6, 8, 11, 14],
  SPEED: Array.from({ length: 16 }, (_, i) => i),
};

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

// --- UK HARD HOUSE AUDIO ENGINE (V10) ---
class AudioEngine {
  constructor(onStatusUpdate) {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;
    
    // HARD COMPRESSION (The "Pump")
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 0;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;
    
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);
    
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048; // Higher res for visualizer
    this.masterGain.connect(this.analyser);

    this.buffers = {};
    
    // MONO TRACKERS
    this.activeBassNode = null;
    this.activeKickNode = null; 
    this.activeLeadNodes = []; 
    
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
    if (this.activeBassNode) { try{this.activeBassNode.stop();}catch(e){} this.activeBassNode = null; }
    if (this.activeKickNode) { try{this.activeKickNode.stop();}catch(e){} this.activeKickNode = null; }
    
    this.activeLeadNodes.forEach(n => { try{n.stop();}catch(e){} });
    this.activeLeadNodes = [];
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
    if (instId === 'bass' && this.activeBassNode) try { this.activeBassNode.stop(time); } catch(e){}
    if (instId === 'kick' && this.activeKickNode) try { this.activeKickNode.stop(time); } catch(e){}
    
    if (instId === 'lead') {
        this.activeLeadNodes.forEach(n => { try{n.stop(time);}catch(e){} });
        this.activeLeadNodes = [];
    }

    // Force synth for Leads to guarantee sound quality
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
    
    if (id === 'bass') this.activeBassNode = source;
    if (id === 'kick') this.activeKickNode = source;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(velocity / 127, time);
    
    let tail = source.buffer.duration;
    if (id === 'bass') tail = 0.25; 
    if (id === 'kick') tail = 0.3;  
    if (id === 'hat_open') tail = 0.15; 
    
    gain.gain.exponentialRampToValueAtTime(0.01, time + tail);

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start(time);
  }

  playSynth(instId, pitch, time, duration, velocity) {
    const vel = velocity / 127;
    
    if (instId === 'kick') this.synthKick(time, vel);
    else if (instId === 'bass') this.synthDonk(pitch, time, duration, vel); 
    else if (instId === 'lead') this.synthSuperHoover(pitch, time, duration, vel); 
    else if (instId.includes('hat')) this.synthHat(time, instId === 'hat_open', vel);
    else if (instId === 'clap') this.synthClap(time, vel);
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

    this.activeBassNode = osc;

    g.gain.setValueAtTime(vel, time);
    g.gain.exponentialRampToValueAtTime(0.01, time + 0.25); 
    
    osc.connect(filter).connect(g).connect(this.masterGain);
    osc.start(time); osc.stop(time + 0.25);
  }
  
  synthSuperHoover(pitch, time, dur, vel) {
    const targetFreq = 440 * Math.pow(2, (noteToMidiNum(pitch) - 69) / 12);
    const attack = 0.15; 
    
    const createOsc = (detuneCents, panVal) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        
        osc.frequency.setValueAtTime(targetFreq * 0.25, time); 
        osc.frequency.exponentialRampToValueAtTime(targetFreq, time + attack);
        osc.detune.setValueAtTime(detuneCents, time);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, time);
        filter.frequency.exponentialRampToValueAtTime(8000, time + attack); 
        filter.Q.value = 2;

        const panner = this.ctx.createStereoPanner();
        panner.pan.value = panVal;

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vel * 0.4, time); 
        g.gain.linearRampToValueAtTime(0, time + dur); 
        
        osc.connect(filter).connect(panner).connect(g).connect(this.masterGain);
        osc.start(time); osc.stop(time + dur);
        
        this.activeLeadNodes.push(osc);
    };

    createOsc(0, 0);     
    createOsc(-20, -0.5);   
    createOsc(20, 0.5);   
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

// --- HELPER COMPONENTS ---

const Knob = ({ label, value, onChange, options }) => (
  <div className="flex flex-col gap-1 w-full">
    <label className="text-[10px] uppercase font-bold text-[#39FF14]/70 tracking-wider">{label}</label>
    <select 
      value={value} 
      onChange={onChange}
      className="bg-black border border-[#39FF14]/30 rounded text-[#39FF14] p-2 text-sm font-mono focus:border-[#39FF14] outline-none cursor-pointer hover:bg-[#39FF14]/5 transition-colors"
      aria-label={label}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

const HelpModal = ({ onClose }) => (
  <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
    <div className="bg-[#111] border-2 border-[#39FF14] rounded-2xl max-w-lg w-full p-6 relative shadow-[0_0_50px_rgba(57,255,20,0.2)]">
      <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X size={24} /></button>
      <h2 className="text-2xl font-black text-[#39FF14] mb-4 uppercase">How to Generate</h2>
      <div className="space-y-4 text-gray-300 text-sm">
        <p><strong className="text-white">1. Select Instruments:</strong> Click the pads at the bottom to choose your kit. If none are selected, ALL will be used.</p>
        <p><strong className="text-white">2. Set the Vibe:</strong> Use the "Producer Controls" panel to pick Key, Scale, and BPM.</p>
        <p><strong className="text-white">3. Prompt (Optional):</strong> Type a vibe like "Acid Techno Drop" or "Dark Trance Build". The AI will use this to guide the rhythm.</p>
        <p><strong className="text-white">4. Generate Drop:</strong> Click the big button. It creates a unique 16-step loop every time.</p>
        <p><strong className="text-white">5. Export:</strong> Like what you hear? Click "Extract MIDI" to download the file for your DAW.</p>
      </div>
      <div className="mt-6 pt-4 border-t border-white/10 text-xs text-gray-500">
        Audio Engine: Web Audio API (Synthesis + Samples) • Pattern Logic: Groq AI + Algorithmic Fallback
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
        
        // Gradient Color based on height
        const r = barHeight + (25 * (i/bufferLength));
        const g = 250 * (i/bufferLength);
        const b = 50;

        ctx.fillStyle = `rgb(${57}, ${255}, ${20})`;
        if (i > bufferLength / 2) ctx.fillStyle = `rgb(255, 0, 255)`; // Highs are Pink

        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    if (isPlaying) draw();
    else {
        // Static line when stopped
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

  const stopPlayback = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    if (window.HARDHOUSE_AUDIO) window.HARDHOUSE_AUDIO.kill();
  }, []);

  const generateLocalPattern = (instrumentsToUse) => {
    const notes = [];
    const bassRhythm = RHYTHM_LIB.OFFBEAT; 
    const leadRhythm = RHYTHM_LIB.ACID_ROLL; 

    for (let step = 0; step < 16; step++) {
      if (instrumentsToUse.includes('kick') && step % 4 === 0) {
        notes.push({ instId: 'kick', pitch: 'C2', duration: '1', velocity: 127, startTick: step * 128 });
      }
      if (instrumentsToUse.includes('bass') && bassRhythm.includes(step)) {
        notes.push({ instId: 'bass', pitch: noteFromScale(selectedKey, selectedScale, 0, 2), duration: '2', velocity: 110, startTick: step * 128 });
      }
      if (instrumentsToUse.includes('lead') && leadRhythm.includes(step)) {
        const octaveJump = Math.random() > 0.6 ? 1 : 0;
        const degree = [0, 2, 3, 5, 7][step % 5];
        notes.push({ 
            instId: 'lead', 
            pitch: noteFromScale(selectedKey, selectedScale, degree, 4 + octaveJump), 
            duration: '1', 
            velocity: 100, 
            startTick: step * 128 
        });
      }
      if (instrumentsToUse.includes('hat_open') && step % 4 === 2) {
        notes.push({ instId: 'hat_open', pitch: 'F#2', duration: '2', velocity: 90, startTick: step * 128 });
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

    if (prompt.trim()) {
      setIsGenerating(true);
      try {
        const randomSeed = Math.floor(Math.random() * 9999);
        const styleGuide = `Style: ${selectedStyle}. BPM: ${bpm}. Rules: Offbeat Bass, Acid Lead.`;
        const variedPrompt = `${prompt} ${styleGuide} (Seed: ${randomSeed}).`;

        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: variedPrompt, instruments: instrumentsToUse, key: selectedKey, scale: selectedScale, bpm }),
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
          })).filter((n) => instrumentsToUse.includes(n.instId));

          setCurrentPattern(aiNotes);
          setIsPlaying(true);
          scheduleLoop(aiNotes);
        }
      } catch (error) {
        console.warn("AI Fallback", error);
        setErrorMsg('Offline Mode Active');
        const notes = generateLocalPattern(instrumentsToUse); 
        setCurrentPattern(notes);
        setIsPlaying(true);
        scheduleLoop(notes);
      } finally {
        setIsGenerating(false);
      }
    } else {
      const notes = generateLocalPattern(instrumentsToUse);
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

  const toggleInstrument = (id) =>
    setSelectedInstruments((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-[#39FF14] selection:text-black">
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
              <span>v11.0 Pro</span>
            </div>
          </div>
          <button 
            onClick={() => setShowHelp(true)}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full border border-white/20 text-sm font-bold transition-all hover:scale-105"
            aria-label="Open Help"
          >
            <HelpCircle size={16} /> How It Works
          </button>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: CONTROLS */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* PRODUCER CONTROLS PANEL */}
            <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#39FF14]" />
              <div className="flex items-center gap-2 mb-6 text-white/50 text-xs font-black uppercase tracking-widest">
                <Sliders size={14} /> Producer Controls
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <Knob label="Key" value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} options={KEYS} />
                <Knob label="Scale" value={selectedScale} onChange={(e) => setSelectedScale(e.target.value)} options={SCALES} />
                <Knob label="BPM" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} options={[140, 145, 150, 155, 160, 170]} />
                <Knob label="Style" value={selectedStyle} onChange={(e) => setSelectedStyle(e.target.value)} options={PRODUCER_STYLES} />
              </div>
            </div>

            {/* PROMPT INPUT */}
            <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6 relative">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#FF00FF]" />
              <div className="flex items-center gap-2 mb-4 text-white/50 text-xs font-black uppercase tracking-widest">
                <Wand2 size={14} /> AI Prompt
              </div>
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ex: Dark Acid Techno drop with rolling bass..."
                className="w-full bg-black/50 border border-white/20 rounded-lg p-4 text-white placeholder:text-gray-600 focus:border-[#FF00FF] focus:ring-1 focus:ring-[#FF00FF] outline-none transition-all h-32 resize-none text-sm"
              />
              {errorMsg && (
                <div className="mt-2 text-[#FF00FF] text-xs flex items-center gap-1 font-bold">
                  <AlertCircle size={12} /> {errorMsg}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: VISUALIZER & LAUNCH */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* VISUALIZER */}
            <div className="bg-black border-2 border-white/10 rounded-2xl p-1 h-48 relative shadow-inner shadow-black">
              <canvas ref={canvasRef} width={800} height={200} className="w-full h-full rounded-xl opacity-90" />
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center text-white/20 text-4xl font-black uppercase tracking-widest pointer-events-none">
                  Standby
                </div>
              )}
            </div>

            {/* ACTION BAR */}
            <div className="flex flex-col md:flex-row gap-4">
              <button
                onClick={handleLaunch}
                disabled={isGenerating}
                className={`flex-1 py-6 rounded-xl font-black text-2xl uppercase tracking-widest transition-all transform active:scale-95 flex items-center justify-center gap-3 shadow-xl ${
                  isPlaying 
                  ? 'bg-[#FF00FF] text-black hover:bg-[#FF00FF]/90 shadow-[0_0_30px_rgba(255,0,255,0.4)]' 
                  : 'bg-[#39FF14] text-black hover:bg-[#39FF14]/90 shadow-[0_0_30px_rgba(57,255,20,0.4)]'
                }`}
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
                className="px-8 rounded-xl border-2 border-white/20 hover:border-white text-white font-bold uppercase text-xs tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1"
                title="Download MIDI file"
              >
                <Download size={20} />
                <span>Export MIDI</span>
              </button>
            </div>
          </div>
        </main>

        {/* FOOTER: INSTRUMENTS */}
        <section>
          <div className="flex items-center gap-2 mb-4 text-white/50 text-xs font-black uppercase tracking-widest border-b border-white/10 pb-2">
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
              >
                <inst.icon size={20} />
                <span className="text-[10px] font-bold uppercase tracking-widest">{inst.name}</span>
                {selectedInstruments.includes(inst.id) && (
                  <div className="absolute bottom-0 left-0 w-full h-1 bg-[#39FF14]" />
                )}
              </button>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}