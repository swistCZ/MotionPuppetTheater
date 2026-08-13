export class ThereminSynth {
  private audioCtx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private isActive: boolean = false;

  private minFreq: number = 130; // C3
  private maxFreq: number = 880; // A5

  constructor() {}

  public toggle(enable?: boolean): boolean {
    if (enable !== undefined) {
      this.isActive = enable;
    } else {
      this.isActive = !this.isActive;
    }

    if (this.isActive) {
      this.startAudio();
    } else {
      this.stopAudio();
    }

    return this.isActive;
  }

  public isEnabled(): boolean {
    return this.isActive;
  }

  private startAudio(): void {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    if (!this.oscillator) {
      this.oscillator = this.audioCtx.createOscillator();
      this.gainNode = this.audioCtx.createGain();

      // Classic Theremin sine / smooth triangle waveform
      this.oscillator.type = 'sine';
      this.oscillator.frequency.setValueAtTime(440, this.audioCtx.currentTime);

      // Initial gain silent
      this.gainNode.gain.setValueAtTime(0.001, this.audioCtx.currentTime);

      this.oscillator.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);
      this.oscillator.start();
    }
  }

  private stopAudio(): void {
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.linearRampToValueAtTime(0.0001, this.audioCtx.currentTime + 0.1);
    }
  }

  /**
   * Updates pitch and volume based on hand normalized Y positions (0 = top of screen, 1 = bottom).
   */
  public updateHands(leftHandY?: number, rightHandY?: number): void {
    if (!this.isActive || !this.audioCtx || !this.oscillator || !this.gainNode) return;

    const now = this.audioCtx.currentTime;

    // Left hand controls Pitch (height: 0 top = high freq, 1 bottom = low freq)
    if (leftHandY !== undefined) {
      const pitchRatio = 1.0 - Math.max(0, Math.min(1, leftHandY)); // 0 to 1
      const frequency = this.minFreq + pitchRatio * (this.maxFreq - this.minFreq);
      this.oscillator.frequency.setTargetAtTime(frequency, now, 0.03); // Smooth glissando
    }

    // Right hand controls Volume (height: 0 top = max volume 0.35, 1 bottom = silent 0.0)
    if (rightHandY !== undefined) {
      const volRatio = 1.0 - Math.max(0, Math.min(1, rightHandY)); // 0 to 1
      const volume = Math.max(0.0001, volRatio * 0.35);
      this.gainNode.gain.setTargetAtTime(volume, now, 0.03);
    } else {
      // Fade out if right hand not present
      this.gainNode.gain.setTargetAtTime(0.0001, now, 0.05);
    }
  }
}
