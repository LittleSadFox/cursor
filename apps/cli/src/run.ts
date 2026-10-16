import { alignCommand, compareCommand, cutCommand, detectCommand } from './commands/analysis.js';
import { benchCommand } from './commands/bench.js';
import { evalCommand, printHelp, schemaCommand, versionCommand } from './commands/tooling.js';
import { processCommand } from './commands/video.js';

type Command = (args: readonly string[]) => void;

const COMMANDS: Record<string, Command> = {
  version: versionCommand,
  '--version': versionCommand,
  '-V': versionCommand,
  help: printHelp,
  '--help': printHelp,
  '-h': printHelp,
  schema: schemaCommand,
  eval: evalCommand,
  detect: detectCommand,
  align: alignCommand,
  compare: compareCommand,
  cut: cutCommand,
  bench: benchCommand,
  process: processCommand,
};

export function run(argv: readonly string[]): void {
  const [name = 'help', ...rest] = argv;
  const command = COMMANDS[name];
  if (command) {
    command(rest);
    return;
  }
  printHelp();
  process.exitCode = 1;
}
