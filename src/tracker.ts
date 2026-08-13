import { Hands, Results, Options } from '@mediapipe/hands';

export type TrackingResultsCallback = (results: Results) => void;
export type TrackingErrorCallback = (error: Error) => void;

export class HandTracker {
  private videoElement: HTMLVideoElement;
  private frameCanvas: HTMLCanvasElement;
  private frameCtx: CanvasRenderingContext2D;
  private hands: Hands | null = null;
  private mediaStream: MediaStream | null = null;
  private animFrameId: number | null = null;
  private onResultsCallback: TrackingResultsCallback | null = null;
  private onErrorCallback: TrackingErrorCallback | null = null;
  private isRunning: boolean = false;
  private isProcessingFrame: boolean = false;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
    this.frameCanvas = document.createElement('canvas');
    this.frameCanvas.width = 640;
    this.frameCanvas.height = 480;
    this.frameCtx = this.frameCanvas.getContext('2d', { willReadFrequently: true })!;
  }

  /**
   * Initializes MediaPipe Hands with absolute same-origin path for DuckDuckGo/Brave protection,
   * with fallbacks to jsdelivr & unpkg CDNs.
   */
  public async initialize(): Promise<void> {
    // Resolve absolute local path to public/mediapipe/
    const localAbsoluteUrl = new URL('mediapipe/', window.location.href).href;

    const sources = [
      localAbsoluteUrl,
      './mediapipe/',
      'https://cdn.jsdelivr.net/npm/@mediapipe/hands/',
      'https://unpkg.com/@mediapipe/hands/',
    ];

    let lastErr: Error | null = null;

    for (const sourceUrl of sources) {
      try {
        this.hands = new Hands({
          locateFile: (file: string) => `${sourceUrl}${file}`,
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

        return;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
      }
    }

    if (lastErr) {
      throw new Error(`Nepodařilo se načíst AI modely pro sledování rukou: ${lastErr.message}`);
    }
  }

  /**
   * Starts universal cross-browser video stream (DuckDuckGo, Safari, Chrome, Firefox, Edge, Mobile) and camera processing loop.
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
      this.videoElement.setAttribute('webkit-playsinline', 'true');
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

      const video = this.videoElement;
      if (
        this.hands &&
        video.readyState >= 2 && // HAVE_CURRENT_DATA
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        !video.paused &&
        !this.isProcessingFrame
      ) {
        this.isProcessingFrame = true;
        try {
          // Draw frame onto intermediate offscreen canvas to bypass DuckDuckGo/Safari video element restrictions
          if (this.frameCanvas.width !== video.videoWidth || this.frameCanvas.height !== video.videoHeight) {
            this.frameCanvas.width = video.videoWidth;
            this.frameCanvas.height = video.videoHeight;
          }
          this.frameCtx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

          await this.hands.send({ image: this.frameCanvas });
        } catch (err) {
          this.isProcessingFrame = false;
          console.warn('Frame send warning:', err);
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
      return new Error('Přístup ke kameře byl zamítnut. Povolte prosím kameru v nastavení prohlížeče DuckDuckGo / systému.');
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
