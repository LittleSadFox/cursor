import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { clampUs } from './timeline-math.js';

export type Player = {
  videoRef: RefObject<HTMLVideoElement | null>;
  currentUs: number;
  playing: boolean;
  seek: (tUs: number) => void;
  toggle: () => void;
};

function videoUs(video: HTMLVideoElement): number {
  return Math.round(video.currentTime * 1_000_000);
}

/**
 * Playhead for the review proxy. The proxy keeps the original timestamps (`-copyts`),
 * so `currentTime` is recording time. Follows the video every animation frame while playing.
 */
export function usePlayer(src: string | null, durationUs: number): Player {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentUs, setCurrentUs] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    let frame = 0;
    const sync = () => setCurrentUs(videoUs(video));
    const follow = () => {
      sync();
      frame = requestAnimationFrame(follow);
    };
    const onPlay = () => {
      setPlaying(true);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(follow);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(frame);
      sync();
    };
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', sync);
    video.addEventListener('loadedmetadata', sync);
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', sync);
      video.removeEventListener('loadedmetadata', sync);
    };
  }, [src]);

  const seek = useCallback(
    (tUs: number) => {
      const at = clampUs(tUs, durationUs);
      setCurrentUs(at);
      const video = videoRef.current;
      if (video) video.currentTime = at / 1_000_000;
    },
    [durationUs],
  );

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }, []);

  return { videoRef, currentUs, playing, seek, toggle };
}
