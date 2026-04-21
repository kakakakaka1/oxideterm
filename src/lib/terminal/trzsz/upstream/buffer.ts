import { TrzszError, isVT100End, strToUint8, uint8ToStr } from '@/lib/terminal/trzsz/upstream/comm';

function isTrzszLetter(charCode: number): boolean {
  if ((charCode >= 0x61 && charCode <= 0x7a) || (charCode >= 0x41 && charCode <= 0x5a)) {
    return true;
  }

  if (charCode >= 0x30 && charCode <= 0x39) {
    return true;
  }

  return charCode === 0x23 || charCode === 0x3a || charCode === 0x2b || charCode === 0x2f || charCode === 0x3d;
}

export class TrzszBuffer {
  private bufferQueue: Array<string | ArrayBuffer | Uint8Array | Blob | null> = [];
  private resolve: (() => void) | null = null;
  private reject: ((reason?: unknown) => void) | null = null;
  private head = 0;
  private tail = 0;
  private nextIndex = 0;
  private nextBufferValue: Uint8Array | null = null;
  private arrayBuffer = new ArrayBuffer(128);

  addBuffer(buffer: string | ArrayBuffer | Uint8Array | Blob): void {
    this.bufferQueue[this.tail] = buffer;
    this.tail += 1;
    if (this.resolve) {
      this.resolve();
      this.resolve = null;
      this.reject = null;
    }
  }

  stopBuffer(): void {
    if (!this.reject) {
      return;
    }

    this.reject(new TrzszError('Stopped'));
    this.reject = null;
    this.resolve = null;
  }

  drainBuffer(): void {
    this.bufferQueue = [];
    this.head = 0;
    this.tail = 0;
  }

  async readLine(): Promise<string> {
    let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(this.arrayBuffer);
    let length = 0;
    while (true) {
      let next = await this.nextBuffer();
      const newLineIndex = next.indexOf(0x0a);
      if (newLineIndex >= 0) {
        this.nextIndex += newLineIndex + 1;
        next = next.subarray(0, newLineIndex);
      } else {
        this.nextIndex += next.length;
      }

      if (next.includes(0x03)) {
        throw new TrzszError('Interrupted');
      }

      buffer = this.appendBuffer(buffer, length, next);
      length += next.length;
      if (newLineIndex >= 0) {
        return uint8ToStr(buffer.subarray(0, length));
      }
    }
  }

  async readBinary(length: number): Promise<Uint8Array> {
    if (this.arrayBuffer.byteLength < length) {
      this.arrayBuffer = new ArrayBuffer(length);
    }

    const buffer = new Uint8Array(this.arrayBuffer, 0, length);
    let offset = 0;
    while (offset < length) {
      const remaining = length - offset;
      let next = await this.nextBuffer();
      if (next.length > remaining) {
        this.nextIndex += remaining;
        next = next.subarray(0, remaining);
      } else {
        this.nextIndex += next.length;
      }

      buffer.set(next, offset);
      offset += next.length;
    }

    return buffer;
  }

  async readLineOnWindows(): Promise<string> {
    let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(this.arrayBuffer);
    let lastByte = 0x1b;
    let skipVT100 = false;
    let hasNewLine = false;
    let mayDuplicate = false;
    let hasCursorHome = false;
    let previousHasCursorHome = false;
    let index = 0;

    while (true) {
      let next = await this.nextBuffer();
      const newLineIndex = next.indexOf(0x21);
      if (newLineIndex >= 0) {
        this.nextIndex += newLineIndex + 1;
        next = next.subarray(0, newLineIndex);
      } else {
        this.nextIndex += next.length;
      }

      for (const charCode of next) {
        if (charCode === 0x03) {
          throw new TrzszError('Interrupted');
        }

        if (charCode === 0x0a) {
          hasNewLine = true;
        }

        if (skipVT100) {
          if (isVT100End(charCode)) {
            skipVT100 = false;
            if (charCode === 0x48 && lastByte >= 0x30 && lastByte <= 0x39) {
              mayDuplicate = true;
            }
          }
          if (lastByte === 0x5b && charCode === 0x48) {
            hasCursorHome = true;
          }
          lastByte = charCode;
          continue;
        }

        if (charCode === 0x1b) {
          skipVT100 = true;
          lastByte = charCode;
          continue;
        }

        if (!isTrzszLetter(charCode)) {
          continue;
        }

        if (mayDuplicate) {
          mayDuplicate = false;
          if (hasNewLine && index > 0 && (charCode === buffer[index - 1] || previousHasCursorHome)) {
            buffer[index - 1] = charCode;
            continue;
          }
        }

        if (index >= buffer.length) {
          buffer = this.growBuffer(buffer, index, next.length);
        }

        buffer[index] = charCode;
        index += 1;
        previousHasCursorHome = hasCursorHome;
        hasCursorHome = false;
        hasNewLine = false;
      }

      if (newLineIndex >= 0 && index > 0 && !skipVT100) {
        return uint8ToStr(buffer.subarray(0, index));
      }
    }
  }

  private async toUint8Array(buffer: string | ArrayBuffer | Uint8Array | Blob): Promise<Uint8Array> {
    if (typeof buffer === 'string') {
      return strToUint8(buffer);
    }

    if (buffer instanceof ArrayBuffer) {
      return new Uint8Array(buffer);
    }

    if (buffer instanceof Uint8Array) {
      return buffer;
    }

    if (buffer instanceof Blob) {
      return new Uint8Array(await buffer.arrayBuffer());
    }

    throw new TrzszError('The buffer type is not supported', null, true);
  }

  private async nextBuffer(): Promise<Uint8Array> {
    if (this.nextBufferValue && this.nextIndex < this.nextBufferValue.length) {
      return this.nextBufferValue.subarray(this.nextIndex);
    }

    if (this.head === this.tail) {
      if (this.head !== 0) {
        this.head = 0;
        this.tail = 0;
      }

      await new Promise<void>((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
      });
    }

    const next = this.bufferQueue[this.head];
    this.bufferQueue[this.head] = null;
    this.head += 1;
    this.nextBufferValue = await this.toUint8Array(next as string | ArrayBuffer | Uint8Array | Blob);
    this.nextIndex = 0;
    return this.nextBufferValue;
  }

  private growBuffer(target: Uint8Array, index: number, minimum: number): Uint8Array {
    const length = Math.max(target.length * 2, index + minimum);
    this.arrayBuffer = new ArrayBuffer(length);
    const next = new Uint8Array(this.arrayBuffer);
    next.set(target.subarray(0, index));
    return next;
  }

  private appendBuffer(target: Uint8Array, index: number, source: Uint8Array): Uint8Array {
    const buffer = target.length >= index + source.length ? target : this.growBuffer(target, index, source.length);
    buffer.set(source, index);
    return buffer;
  }
}