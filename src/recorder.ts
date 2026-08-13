export class StageRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording: boolean = false;
  private startTime: number = 0;
  private timerInterval: number | null = null;
  private onTimerCallback: ((elapsedFormatted: string) => void) | null = null;

  constructor() {}

  /**
   * Starts video recording of the Pixi.js stage canvas at 60 FPS, with optional audio stream.
   */
  public start(
    canvas: HTMLCanvasElement,
    audioStreamNode?: MediaStreamAudioDestinationNode,
    onTimer?: (elapsedFormatted: string) => void
  ): boolean {
    if (this.isRecording) return false;

    this.onTimerCallback = onTimer || null;
    this.recordedChunks = [];

    // Capture 60 FPS video stream directly from PixiJS canvas
    const canvasWithCapture = canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream };
    if (!canvasWithCapture.captureStream) {
      console.error('Canvas captureStream is not supported in this browser.');
      return false;
    }

    const canvasStream = canvasWithCapture.captureStream(60);
    let combinedStream: MediaStream = canvasStream;

    // Mix in Theremin audio if active
    if (audioStreamNode && audioStreamNode.stream && audioStreamNode.stream.getAudioTracks().length > 0) {
      combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioStreamNode.stream.getAudioTracks(),
      ]);
    }

    // Determine supported MIME type
    const mimeType = this.getSupportedMimeType();

    try {
      this.mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 5000000, // 5 Mbps high quality video
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.downloadVideoBlob(mimeType);
      };

      this.mediaRecorder.start(200); // Record in 200ms timeslices
      this.isRecording = true;
      this.startTime = performance.now();

      this.startTimer();
      return true;
    } catch (err) {
      console.error('Failed to start MediaRecorder:', err);
      return false;
    }
  }

  /**
   * Stops recording and triggers direct video download to user's disk.
   */
  public stop(): void {
    if (!this.isRecording || !this.mediaRecorder) return;

    this.isRecording = false;
    this.stopTimer();

    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }

  private startTimer(): void {
    if (this.timerInterval !== null) clearInterval(this.timerInterval);

    this.timerInterval = window.setInterval(() => {
      if (!this.isRecording) return;
      const elapsedMs = performance.now() - this.startTime;
      const totalSec = Math.floor(elapsedMs / 1000);
      const mins = Math.floor(totalSec / 60).toString().padStart(2, '0');
      const secs = (totalSec % 60).toString().padStart(2, '0');
      const formatted = `${mins}:${secs}`;

      if (this.onTimerCallback) {
        this.onTimerCallback(formatted);
      }
    }, 500);
  }

  private stopTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private downloadVideoBlob(mimeType: string): void {
    if (this.recordedChunks.length === 0) return;

    const blob = new Blob(this.recordedChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const filename = `divadlo-loutek-zaznam-${dateStr}.${extension}`;

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  private getSupportedMimeType(): string {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4;codecs=h264',
      'video/mp4',
    ];

    for (const type of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'video/webm';
  }
}
