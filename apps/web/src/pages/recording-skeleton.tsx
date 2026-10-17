import { useEffect, useRef, useState, type RefObject } from 'react';
import { useLingui } from '@lingui/react';
import { readPosebin } from '@climbing-coach/schema';

import { api } from '../api.js';
import { poseAt, poseFrames, type PoseFrames } from '../hooks/compare/pose.js';
import { backingScale, backingSize, paint } from '../render/canvas.js';
import { renderPose, toPixels, type DrawCommand } from '../render/skeleton.js';

const STYLE = {
  color: '#e8c47c',
  highlightColor: '#e8c47c',
  alpha: 0.95,
  lineWidth: 3,
  jointRadius: 4,
  highlights: new Set<string>(),
};

/** Minimal skeleton overlay synced to a recording's proxy playback (P1.8). */
export function RecordingSkeletonOverlay(props: {
  videoId: string;
  hasPose: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const { i18n } = useLingui();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frames, setFrames] = useState<PoseFrames | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.hasPose) {
      setFrames(null);
      return;
    }
    let cancelled = false;
    setError(null);
    void api.videos
      .pose(props.videoId, { kind: 'detection' })
      .then((bytes) => {
        if (cancelled) return;
        const track = readPosebin(bytes);
        setFrames(poseFrames(track));
      })
      .catch(() => {
        if (!cancelled) setError(i18n._('recordings.poseMissing'));
      });
    return () => {
      cancelled = true;
    };
  }, [props.videoId, props.hasPose, i18n]);

  useEffect(() => {
    const video = props.videoRef.current;
    if (!video) return;
    const syncSize = () => {
      const width = video.clientWidth;
      const height = video.clientHeight;
      if (width > 0 && height > 0) setSize({ width, height });
    };
    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(video);
    return () => observer.disconnect();
  }, [props.videoRef, props.videoId]);

  useEffect(() => {
    const video = props.videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !frames || size.width === 0) return;

    let raf = 0;
    const draw = () => {
      const tUs = Math.round(video.currentTime * 1_000_000);
      const points = poseAt(frames, tUs);
      const commands: DrawCommand[] = points
        ? renderPose(toPixels(points, size.width, size.height), STYLE)
        : [];
      const scale = backingScale(window.devicePixelRatio);
      const backing = backingSize(size, scale);
      canvas.width = backing.width;
      canvas.height = backing.height;
      const ctx = canvas.getContext('2d');
      if (ctx) paint(ctx, commands, size, scale);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [frames, size, props.videoRef]);

  if (!props.hasPose) {
    return <p className="status">{i18n._('recordings.poseWait')}</p>;
  }
  if (error) {
    return (
      <p className="status" role="status">
        {error}
      </p>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="recording-skeleton"
      style={{ width: size.width || '100%', height: size.height || '100%' }}
      role="img"
      aria-label={i18n._('recordings.skeletonLabel')}
    />
  );
}
