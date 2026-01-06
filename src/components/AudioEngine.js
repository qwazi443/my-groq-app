// --- AUDIO ENGINE v2.0 (Hybrid Sample + Synth) ---
class AudioEngine {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;
    
    // Compressor to glue samples and synths together
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -10;
    this.compressor.ratio.value = 4;
    
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);
    
    // Visualizer hook
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.masterGain.connect(this.analyser);

    // Cache for loaded samples
    this.buffers = {};
  }

  async resume() {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  // Load all samples defined in presets
  async loadBank(presets) {
    console.log("Loading samples...");
    const promises = presets.map(async (inst) => {
      // Skip synth-only instruments
      if (inst.type === 'synth' || !inst.file) return;

      try {
        const response = await fetch(`/samples/${inst.file}`);
        if (!response.ok) throw new Error(`Missing file: ${inst.file}`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        this.buffers[inst.id] = audioBuffer;
        console.log(`Loaded ${inst.id}`);
      } catch (e) {
        console.warn(`Could not load sample for ${inst.id}, using synth fallback.`);
      }
    });
    await Promise.all(promises);
  }

  playNote(instId, pitch, time, duration, velocity = 100) {
    // 1. Check if we have a sample loaded for this instrument
    if (this.buffers[instId]) {
      this.playSample(instId, time, velocity);
    } 
    // 2. If not, use the synthesizer
    else {
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

  // --- SYNTH FALLBACKS (Your original logic) ---
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
    
    // Lowpass filter for that "Hard House" bass throb
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
    // White noise buffer
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
      // Simple noise burst
      this.synthHat(time, false, vel * 1.5);
  }
}