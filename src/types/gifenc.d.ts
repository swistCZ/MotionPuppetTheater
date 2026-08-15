// Minimal type declarations for the tiny `gifenc` encoder (no official types).
declare module 'gifenc' {
  export interface GIFEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: {
        palette?: number[][];
        delay?: number; // centiseconds
        repeat?: number;
        transparent?: boolean;
        dispose?: number;
      }
    ): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
    reset(): void;
  }

  export function GIFEncoder(): GIFEncoderInstance;

  export function quantize(
    data: Uint8Array | Uint8ClampedArray,
    maxColors?: number,
    options?: { format?: string; oneBitAlpha?: boolean; clearAlpha?: boolean }
  ): number[][];

  export function applyPalette(
    data: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: string
  ): Uint8Array;
}