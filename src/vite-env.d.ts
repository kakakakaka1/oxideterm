/// <reference types="vite/client" />

// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only


// Type declaration for @xterm/addon-canvas (workaround for beta package.json issue)
declare module '@xterm/addon-canvas/lib/xterm-addon-canvas.mjs' {
  import { Terminal, ITerminalAddon } from '@xterm/xterm';
  
  export class CanvasAddon implements ITerminalAddon {
    constructor();
    activate(terminal: Terminal): void;
    dispose(): void;
  }
}

declare module 'pako';
