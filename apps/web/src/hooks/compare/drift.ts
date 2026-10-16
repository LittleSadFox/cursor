/** The parts of an HTMLMediaElement the controller drives. */
export type MediaLike = {
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  play(): unknown;
  pause(): void;
};

export type SyncTarget = {
  /** Target clip time, µs. */
  timeUs: number;
  /** 0 holds the frame. */
  rate: number;
  playing: boolean;
};

/** True when the element is more than one frame away from where the path says it should be. */
export function needsSeek(actualUs: number, targetUs: number, frameUs: number): boolean {
  return Math.abs(actualUs - targetUs) > frameUs;
}

/**
 * Applies one controller tick to a player: rate from the path slope, hard seek when drift
 * exceeds one frame, pause while holding. Returns whether it seeked.
 */
export function syncMedia(media: MediaLike, target: SyncTarget, frameUs: number): boolean {
  const seek = needsSeek(media.currentTime * 1_000_000, target.timeUs, frameUs);
  if (seek) media.currentTime = target.timeUs / 1_000_000;
  const shouldPlay = target.playing && target.rate > 0;
  if (shouldPlay) {
    if (media.playbackRate !== target.rate) media.playbackRate = target.rate;
    if (media.paused) void media.play();
  } else if (!media.paused) {
    media.pause();
  }
  return seek;
}
