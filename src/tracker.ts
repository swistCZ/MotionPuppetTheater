import { Hands, Results, Options } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

export type TrackingResultsCallback = (results: Results) => void;
export type TrackingErrorCallback = (error: Error) => void;

export class HandTracker {
  private videoElement: HTMLVideoElement;
  private hands: Hands | null = null;
  private camera: Camera | null = null;
  private onResultsCallback: TrackingResultsCallback | null = null;
  private onErrorCallback: TrackingErrorCallback | null = null;
  private isRunning: boolean = false;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
  }

  /**
   * Initializes MediaPipe Hands instance with configurations.
   */
  public async initialize(): Promise<void> {
    this.hands = new Hands({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      },
    });

    const options: Options = {
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };

    this.hands.setOptions(options);

    this.hands.onResults((results: Results) => {
      if (this.onResultsCallback) {
        this.onResultsCallback(results);
      }
    });
  }

  /**
   * Starts video stream and MediaPipe camera processing loop.
   */
  public async start(onResults: TrackingResultsCallback, onError?: TrackingErrorCallback): Promise<void> {
    this.onResultsCallback = onResults;
    this.onErrorCallback = onError || null;

    if (!this.hands) {
      await this.initialize();
    }

    try {
      this.camera = new Camera(this.videoElement, {
        onFrame: async () => {
          if (this.hands && this.isRunning) {
            await this.hands.send({ image: this.videoElement });
          }
        },
        width: 1280,
        height: 720,
      });

      this.isRunning = true;
      await this.camera.start();
    } catch (err) {
      this.isRunning = false;
      const error = err instanceof Error ? err : new Error(String(err));
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      } else {
        console.error('HandTracker camera error:', error);
      }
    }
  }

  /**
   * Stops camera stream and tracking.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.camera) {
      this.camera.stop();
      this.camera = null;
    }
  }

  public getActiveState(): boolean {
    return this.isRunning;
  }
}
