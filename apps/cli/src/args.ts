/** Value after `--name`, or undefined when the flag is missing or has no value. */
export function flagValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = args[index + 1];
  return value === undefined || value.startsWith('--') ? undefined : value;
}

export function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(`--${name}`);
}

export function usage(line: string): void {
  console.error(`usage: ${line}`);
  process.exitCode = 1;
}
