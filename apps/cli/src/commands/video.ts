export function videoBlocked(command: string): void {
  console.error(
    `coach ${command}: video tools need the macOS LGPL ffmpeg build (P1.7, ADR-002). Use detect/align/cut --draft on JSON until that lands.`,
  );
  process.exitCode = 2;
}

export function processCommand(): void {
  videoBlocked('process');
}
