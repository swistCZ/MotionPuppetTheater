export class ThereminSynth {
  private audioCtx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
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

  public getAudioStreamNode(): MediaStreamAudioDestinationNode | undefined {
    if (this.audioCtx && this.gainNode) {
      if (!this.streamDest) {
        this.streamDest = this.audioCtx.createMediaStreamDestination();
        this.gainNode.connect(this.streamDest);
      }
      return this.streamDest;
    }
    return undefined;
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

      this.oscillator.type = 'sine';
      this.oscillator.frequency.setValueAtTime(440, this.audioCtx.currentTime);

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
   * Updates pitch and volume based on hand normalized Y positions (0 = top, 1 = bottom).
   */
  public updateHands(leftHandY?: number, rightHandY?: number): void {
    if (!this.isActive || !this.audioCtx || !this.oscillator || !this.gainNode) return;

    const now = this.audioCtx.currentTime;

    // Left hand or primary hand controls Pitch
    const activePitchY = leftHandY !== undefined ? leftHandY : rightHandY;

    if (activePitchY !== undefined) {
      const pitchRatio = 1.0 - Math.max(0, Math.min(1, activePitchY)); // 0 to 1
      const frequency = this.minFreq + pitchRatio * (this.maxFreq - this.minFreq);
      this.oscillator.frequency.setTargetAtTime(frequency, now, 0.03); // Glissando
    }

    // Right hand controls Volume (boosted max volume 0.85)
    if (rightHandY !== undefined) {
      const volRatio = 1.0 - Math.max(0, Math.min(1, rightHandY)); // 0 to 1
      const volume = Math.max(0.0001, volRatio * 0.85);
      this.gainNode.gain.setTargetAtTime(volume, now, 0.03);
    } else if (leftHandY !== undefined) {
      // Default audible volume if playing single-handed
      this.gainNode.gain.setTargetAtTime(0.4, now, 0.05);
    } else {
      // Fade out if no hands detected
      this.gainNode.gain.setTargetAtTime(0.0001, now, 0.05);
    }
  }
}
