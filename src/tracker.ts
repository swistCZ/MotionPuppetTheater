import { Hands, Results, Options } from '@mediapipe/hands';

export type TrackingResultsCallback = (results: Results) => void;
export type TrackingErrorCallback = (error: Error) => void;

export class HandTracker {
  private videoElement: HTMLVideoElement;
  private hands: Hands | null = null;
  private mediaStream: MediaStream | null = null;
  private animFrameId: number | null = null;
  private onResultsCallback: TrackingResultsCallback | null = null;
  private onErrorCallback: TrackingErrorCallback | null = null;
  private isRunning: boolean = false;
  private isProcessingFrame: boolean = false;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
  }

  /**
   * Initializes MediaPipe Hands instance with primary (jsdelivr) and secondary (unpkg) CDN fallbacks.
   */
  public async initialize(): Promise<void> {
    const cdnSources = [
      'https://cdn.jsdelivr.net/npm/@mediapipe/hands/',
      'https://unpkg.com/@mediapipe/hands/',
    ];

    let lastCdnErr: Error | null = null;

    for (const cdnUrl of cdnSources) {
      try {
        this.hands = new Hands({
          locateFile: (file: string) => `${cdnUrl}${file}`,
        });

        const options: Options = {
          maxNumHands: 2,
          modelComplexity: 0, // Lightweight fast model for 60 FPS across all browsers
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        };

        this.hands.setOptions(options);

        this.hands.onResults((results: Results) => {
          this.isProcessingFrame = false;
          if (this.onResultsCallback) {
            this.onResultsCallback(results);
          }
        });

        // Test initialization
        return;
      } catch (err) {
        lastCdnErr = err instanceof Error ? err : new Error(String(err));
      }
    }

    if (lastCdnErr) {
      throw new Error(`Nepodařilo se načíst MediaPipe knižnici z CDN: ${lastCdnErr.message}`);
    }
  }

  /**
   * Starts universal cross-browser video stream (Safari, Chrome, Firefox, Edge, Mobile) and camera processing loop.
   */
  public async start(onResults: TrackingResultsCallback, onError?: TrackingErrorCallback): Promise<void> {
    this.onResultsCallback = onResults;
    this.onErrorCallback = onError || null;

    if (!this.hands) {
      await this.initialize();
    }

    // Check secure context
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error('Kamera vyžaduje zabezpečené připojení HTTPS nebo localhost.');
      if (this.onErrorCallback) this.onErrorCallback(err);
      return;
    }

    try {
      // Universal getUserMedia constraints with flexible ideal fallback
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          facingMode: 'user',
        },
        audio: false,
      });

      this.videoElement.srcObject = this.mediaStream;
      this.videoElement.setAttribute('playsinline', 'true');
      this.videoElement.setAttribute('muted', 'true');
      this.videoElement.muted = true;

      await this.videoElement.play();

      this.isRunning = true;
      this.runProcessingLoop();
    } catch (err) {
      this.isRunning = false;
      const parsedError = this.formatCameraError(err);
      if (this.onErrorCallback) {
        this.onErrorCallback(parsedError);
      } else {
        console.error('HandTracker camera error:', parsedError);
      }
    }
  }

  private runProcessingLoop(): void {
    const process = async () => {
      if (!this.isRunning) return;

      if (
        this.hands &&
        this.videoElement.readyState >= 2 && // HAVE_CURRENT_DATA
        !this.videoElement.paused &&
        !this.isProcessingFrame
      ) {
        this.isProcessingFrame = true;
        try {
          await this.hands.send({ image: this.videoElement });
        } catch {
          this.isProcessingFrame = false;
        }
      }

      if (this.isRunning) {
        this.animFrameId = requestAnimationFrame(process);
      }
    };

    this.animFrameId = requestAnimationFrame(process);
  }

  /**
   * Stops camera stream and tracking.
   */
  public stop(): void {
    this.isRunning = false;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  public getActiveState(): boolean {
    return this.isRunning;
  }

  private formatCameraError(err: unknown): Error {
    const name = err instanceof Error ? err.name : String(err);
    const message = err instanceof Error ? err.message : String(err);

    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return new Error('Přístup ke kameře byl zamítnut. Povolte prosím kameru v nastavení prohlížeče.');
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return new Error('Kamera nebyla v systému nalezena. Připojte prosím webkameru.');
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return new Error('Kamera je používána jinou aplikací (např. Teams, Zoom). Zavřete ji a zkuste to znovu.');
    }
    if (name === 'OverconstrainedError') {
      return new Error('Kamera nepodporuje požadované rozlišení.');
    }

    return new Error(`Chyba kamery (${name}): ${message}`);
  }
}
