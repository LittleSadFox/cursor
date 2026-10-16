/** Configure flags that would make a shipped ffmpeg GPL or nonfree. */
export const FORBIDDEN_FFMPEG_CONFIGURE_FLAGS = [
  '--enable-gpl',
  '--enable-nonfree',
  '--enable-libx264',
  '--enable-libx265',
  '--enable-libfdk-aac',
] as const;

export const REQUIRED_LGPL_CONFIGURE_FLAGS = ['--disable-gpl', '--disable-nonfree'] as const;

function flagPattern(flag: string): RegExp {
  return new RegExp(`(?:^|\\s)${flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`);
}

export function textHasConfigureFlag(text: string, flag: string): boolean {
  return flagPattern(flag).test(text);
}

export function forbiddenConfigureFlags(text: string): string[] {
  return FORBIDDEN_FFMPEG_CONFIGURE_FLAGS.filter((flag) => textHasConfigureFlag(text, flag));
}

export function missingRequiredLgplFlags(text: string): string[] {
  return REQUIRED_LGPL_CONFIGURE_FLAGS.filter((flag) => !textHasConfigureFlag(text, flag));
}
