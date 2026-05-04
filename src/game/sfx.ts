// Procedural WebAudio SFX — no external assets.
// Lazy-init on first user gesture (Splash PLAY tap).

import bamfUrl from "@/assets/sfx/bamf.mp3";

export type SfxName =
  | "punch" | "heavy" | "boom" | "laser" | "shock"
  | "whoosh" | "chirp" | "thud" | "jab" | "blip"
  | "bamf";

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private musicNodes: AudioNode[] = [];
  private musicPlaying = false;
  private samples: Partial<Record<SfxName, AudioBuffer>> = {};
  muted = false;
  sfxVolume = 0.8;
  musicVolume = 0.35;

  unlock() {
    if (this.ctx) return;
    try {
      const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate * 0.6;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
      // Lazy-load sample assets
      this.loadSample("bamf", bamfUrl);
    } catch { /* no audio */ }
  }

  private async loadSample(name: SfxName, url: string) {
    if (!this.ctx) return;
    try {
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(arr);
      this.samples[name] = buf;
    } catch { /* */ }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
  }
  setSfxVolume(v: number) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
  }
  setMusicVolume(v: number) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume;
  }

  startMusic() {
    if (!this.ctx || !this.musicGain || this.musicPlaying) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // Dark ambient pad: two detuned saws + slow LFO filter
    const freqs = [55, 82.5, 110]; // A1, E2, A2
    for (const f of freqs) {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = f * 1.005;
      const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 320; filt.Q.value = 4;
      const g = ctx.createGain(); g.gain.value = 0.06;
      const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.07 + Math.random() * 0.05;
      const lfoG = ctx.createGain(); lfoG.gain.value = 180;
      lfo.connect(lfoG); lfoG.connect(filt.frequency);
      o.connect(filt); o2.connect(filt); filt.connect(g); g.connect(this.musicGain);
      o.start(t); o2.start(t); lfo.start(t);
      this.musicNodes.push(o, o2, filt, g, lfo, lfoG);
    }
    this.musicPlaying = true;
  }
  stopMusic() {
    for (const n of this.musicNodes) { try { (n as OscillatorNode).stop?.(); } catch { /* */ } try { n.disconnect(); } catch { /* */ } }
    this.musicNodes = [];
    this.musicPlaying = false;
  }

  play(name: SfxName, vol = 1) {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    out.connect(this.sfxGain);
    const t = ctx.currentTime;
    const env = (peak: number, attack: number, decay: number) => {
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(peak * vol, t + attack);
      out.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    };
    const stopAt = (s: AudioScheduledSourceNode, when: number) => {
      try { s.stop(t + when); } catch { /* */ }
      setTimeout(() => { try { s.disconnect(); } catch { /* */ } out.disconnect(); }, (when + 0.05) * 1000);
    };

    switch (name) {
      case "punch": {
        const o = ctx.createOscillator();
        o.type = "sine"; o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
        o.connect(out); o.start(t); env(0.7, 0.005, 0.18); stopAt(o, 0.2);
        // click
        if (this.noise) {
          const n = ctx.createBufferSource(); n.buffer = this.noise;
          const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1800;
          const g = ctx.createGain(); g.gain.value = 0.4 * vol;
          n.connect(f); f.connect(g); g.connect(this.sfxGain);
          n.start(t); n.stop(t + 0.04);
          setTimeout(() => { n.disconnect(); f.disconnect(); g.disconnect(); }, 80);
        }
        break;
      }
      case "heavy": {
        const o = ctx.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(35, t + 0.4);
        o.connect(out); o.start(t); env(1.0, 0.005, 0.5); stopAt(o, 0.55);
        break;
      }
      case "boom": {
        if (!this.noise) break;
        const n = ctx.createBufferSource(); n.buffer = this.noise;
        const f = ctx.createBiquadFilter(); f.type = "lowpass";
        f.frequency.setValueAtTime(800, t);
        f.frequency.exponentialRampToValueAtTime(120, t + 0.4);
        n.connect(f); f.connect(out);
        n.start(t); env(0.9, 0.005, 0.5); stopAt(n, 0.55);
        break;
      }
      case "laser": {
        const o = ctx.createOscillator(); o.type = "sawtooth";
        o.frequency.setValueAtTime(1200, t);
        o.frequency.exponentialRampToValueAtTime(220, t + 0.35);
        const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 6;
        o.connect(f); f.connect(out); o.start(t);
        env(0.5, 0.01, 0.4); stopAt(o, 0.45);
        break;
      }
      case "shock": {
        if (!this.noise) break;
        const n = ctx.createBufferSource(); n.buffer = this.noise;
        const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 350; f.Q.value = 1.2;
        n.connect(f); f.connect(out); n.start(t);
        env(0.8, 0.005, 0.6); stopAt(n, 0.65);
        break;
      }
      case "whoosh": {
        if (!this.noise) break;
        const n = ctx.createBufferSource(); n.buffer = this.noise;
        const f = ctx.createBiquadFilter(); f.type = "highpass";
        f.frequency.setValueAtTime(400, t);
        f.frequency.exponentialRampToValueAtTime(2400, t + 0.25);
        n.connect(f); f.connect(out); n.start(t);
        env(0.35, 0.01, 0.28); stopAt(n, 0.32);
        break;
      }
      case "chirp": {
        const o = ctx.createOscillator(); o.type = "triangle";
        o.frequency.setValueAtTime(800, t);
        o.frequency.exponentialRampToValueAtTime(1600, t + 0.15);
        o.connect(out); o.start(t);
        env(0.4, 0.005, 0.18); stopAt(o, 0.22);
        break;
      }
      case "thud": {
        const o = ctx.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(90, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
        o.connect(out); o.start(t);
        env(0.85, 0.003, 0.32); stopAt(o, 0.36);
        break;
      }
      case "jab": {
        const o = ctx.createOscillator(); o.type = "square";
        o.frequency.setValueAtTime(260, t);
        o.frequency.exponentialRampToValueAtTime(120, t + 0.06);
        const g = ctx.createGain(); g.gain.value = 0.0001;
        o.connect(g); g.connect(this.sfxGain);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.45 * vol, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        o.start(t); try { o.stop(t + 0.1); } catch { /* */ }
        setTimeout(() => { o.disconnect(); g.disconnect(); }, 120);
        break;
      }
      case "blip": {
        const o = ctx.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(660, t);
        o.connect(out); o.start(t);
        env(0.3, 0.002, 0.08); stopAt(o, 0.1);
        break;
      }
    }
  }
}

export const Sfx = new SfxEngine();
