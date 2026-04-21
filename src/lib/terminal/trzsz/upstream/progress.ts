import type { ProgressCallback } from '@/lib/terminal/trzsz/upstream/comm';

function getLength(value: string): number {
  return value.replace(/[\u4e00-\u9fa5]/g, '**').length;
}

function getEllipsisString(value: string, max: number): { sub: string; len: number } {
  let remaining = max - 3;
  let length = 0;
  let sub = '';
  for (const char of value) {
    const charLength = char.charCodeAt(0) >= 0x4e00 && char.charCodeAt(0) <= 0x9fa5 ? 2 : 1;
    if (length + charLength > remaining) {
      return { sub: `${sub}...`, len: length + 3 };
    }
    length += charLength;
    sub += char;
  }

  return { sub: `${sub}...`, len: length + 3 };
}

function convertSizeToString(size: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let nextSize = size;
  while (nextSize >= 1024 && unitIndex < units.length - 1) {
    nextSize /= 1024;
    unitIndex += 1;
  }

  if (nextSize >= 100) {
    return `${nextSize.toFixed(0)} ${units[unitIndex]}`;
  }
  if (nextSize >= 10) {
    return `${nextSize.toFixed(1)} ${units[unitIndex]}`;
  }
  return `${nextSize.toFixed(2)} ${units[unitIndex]}`;
}

function convertTimeToString(seconds: number): string {
  let result = '';
  let remaining = seconds;
  if (remaining >= 3600) {
    result += `${Math.floor(remaining / 3600)}:`;
    remaining %= 3600;
  }

  const minutes = Math.floor(remaining / 60);
  result += minutes >= 10 ? `${minutes}` : `0${minutes}`;
  result += ':';

  const nextSeconds = Math.round(remaining % 60);
  result += nextSeconds >= 10 ? `${nextSeconds}` : `0${nextSeconds}`;
  return result;
}

const SPEED_ARRAY_SIZE = 30;

export class TextProgressBar implements ProgressCallback {
  private lastUpdateTime = 0;
  private columns: number;
  private fileCount = 0;
  private fileIndex = 0;
  private fileName = '';
  private fileSize = 0;
  private fileStep = 0;
  private startTime = 0;
  private tmuxPaneColumns: number;
  private firstWrite = true;
  private speedCount = 0;
  private speedIndex = 0;
  private readonly timeArray = new Array<number>(SPEED_ARRAY_SIZE);
  private readonly stepArray = new Array<number>(SPEED_ARRAY_SIZE);

  constructor(
    private readonly writer: (output: string) => void,
    columns: number,
    tmuxPaneColumns?: number,
  ) {
    this.tmuxPaneColumns = tmuxPaneColumns ?? 0;
    this.columns = this.tmuxPaneColumns > 1 ? this.tmuxPaneColumns - 1 : columns;
  }

  setTerminalColumns(columns: number): void {
    this.columns = columns;
    if (this.tmuxPaneColumns > 0) {
      this.tmuxPaneColumns = 0;
    }
  }

  onNum(num: number): void {
    this.fileCount = num;
    this.fileIndex = 0;
  }

  onName(name: string): void {
    this.fileName = name;
    this.fileIndex += 1;
    this.startTime = Date.now();
    this.timeArray[0] = this.startTime;
    this.stepArray[0] = 0;
    this.speedCount = 1;
    this.speedIndex = 1;
    this.fileStep = -1;
  }

  onSize(size: number): void {
    this.fileSize = size;
  }

  onStep(step: number): void {
    if (step <= this.fileStep) {
      return;
    }

    this.fileStep = step;
    this.showProgress();
  }

  onDone(): void {}

  hideCursor(): void {
    this.writer('\x1b[?25l');
  }

  showCursor(): void {
    this.writer('\x1b[?25h');
  }

  private showProgress(): void {
    const now = Date.now();
    if (now - this.lastUpdateTime < 200) {
      return;
    }

    this.lastUpdateTime = now;

    const percentage = this.fileSize === 0 ? '100%' : `${Math.round((this.fileStep * 100) / this.fileSize)}%`;
    const total = convertSizeToString(this.fileStep);
    const speed = this.getSpeed(now);
    const speedString = speed > 0 ? `${convertSizeToString(speed)}/s` : '--- B/s';
    const etaString = speed > 0
      ? `${convertTimeToString(Math.round((this.fileSize - this.fileStep) / speed))} ETA`
      : '--- ETA';
    const progressText = this.getProgressText(percentage, total, speedString, etaString);

    if (this.firstWrite) {
      this.firstWrite = false;
      this.writer(progressText);
      return;
    }

    if (this.tmuxPaneColumns > 0) {
      this.writer(`\x1b[${this.columns}D${progressText}`);
      return;
    }

    this.writer(`\r${progressText}`);
  }

  private getSpeed(now: number): number {
    const speed = this.speedCount <= SPEED_ARRAY_SIZE
      ? ((this.fileStep - this.stepArray[0]) * 1000) / (now - this.timeArray[0])
      : ((this.fileStep - this.stepArray[this.speedIndex]) * 1000) / (now - this.timeArray[this.speedIndex]);

    this.timeArray[this.speedIndex] = now;
    this.stepArray[this.speedIndex] = this.fileStep;
    this.speedCount += 1;
    this.speedIndex = (this.speedIndex + 1) % SPEED_ARRAY_SIZE;
    return Number.isFinite(speed) ? speed : -1;
  }

  private getProgressText(percentage: string, total: string, speed: string, eta: string): string {
    const barMinLength = 24;
    let left = this.fileCount > 1 ? `(${this.fileIndex}/${this.fileCount}) ${this.fileName}` : this.fileName;
    let leftLength = getLength(left);
    let right = ` ${percentage} | ${total} | ${speed} | ${eta}`;

    if (this.columns - leftLength - right.length < barMinLength && leftLength > 50) {
      ({ sub: left, len: leftLength } = getEllipsisString(left, 50));
    }
    if (this.columns - leftLength - right.length < barMinLength && leftLength > 40) {
      ({ sub: left, len: leftLength } = getEllipsisString(left, 40));
    }
    if (this.columns - leftLength - right.length < barMinLength) {
      right = ` ${percentage} | ${speed} | ${eta}`;
    }
    if (this.columns - leftLength - right.length < barMinLength && leftLength > 30) {
      ({ sub: left, len: leftLength } = getEllipsisString(left, 30));
    }
    if (this.columns - leftLength - right.length < barMinLength) {
      right = ` ${percentage} | ${eta}`;
    }
    if (this.columns - leftLength - right.length < barMinLength) {
      right = ` ${percentage}`;
    }

    const barLength = Math.max(barMinLength, this.columns - leftLength - right.length);
    const completed = this.fileSize === 0 ? barLength : Math.round((this.fileStep * barLength) / this.fileSize);
    return `${left}${' '.repeat(Math.max(this.columns - leftLength - barLength - right.length, 1))}[${'='.repeat(Math.max(completed - 1, 0))}${completed > 0 ? '>' : ''}${' '.repeat(Math.max(barLength - completed, 0))}]${right}`;
  }
}