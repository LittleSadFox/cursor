import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AlignmentFeedback, Comparison, ComparisonSide } from '@climbing-coach/api';
import { readPosebin } from '@climbing-coach/schema';

import { api } from '../../api.js';

import { advanceClock, seekClock, startClock, type ClockState } from './clock.js';
import { divergenceTable, type DivergenceTable } from './divergence.js';
import { poseFrames, type PoseFrames } from './pose.js';
import { buildTimeline, type Timeline } from './timeline.js';

const POLL_MS = 1000;

/** Creates (or reuses the cached) comparison, then polls it while the job runs. */
export function useComparison(attemptAId: string, attemptBId: string) {
  const created = useQuery({
    queryKey: ['comparison', 'create', attemptAId, attemptBId],
    queryFn: () => api.comparisons.create({ attemptAId, attemptBId }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const pendingId = created.data?.status === 'pending' ? created.data.id : null;
  const polled = useQuery({
    queryKey: ['comparison', pendingId],
    queryFn: () => api.comparisons.get(pendingId ?? ''),
    enabled: pendingId !== null,
    refetchInterval: (query) =>
      query.state.data?.status === 'ready' || query.state.data?.status === 'failed'
        ? false
        : POLL_MS,
  });
  return {
    comparison: polled.data ?? created.data,
    error: created.error ?? polled.error,
  };
}

export type ComparisonData = { timeline: Timeline; table: DivergenceTable };

/** Warp path and divergence rows of a ready comparison. */
export function useComparisonData(comparison: Comparison | undefined) {
  const readyId = comparison?.status === 'ready' ? comparison.id : null;
  const warp = useQuery({
    queryKey: ['comparison', readyId, 'warp'],
    queryFn: () => api.comparisons.warp(readyId ?? ''),
    enabled: readyId !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const divergence = useQuery({
    queryKey: ['comparison', readyId, 'divergence'],
    queryFn: () => api.comparisons.divergence(readyId ?? ''),
    enabled: readyId !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const channels = comparison?.channels;
  const data = useMemo<ComparisonData | null>(() => {
    if (!warp.data || !divergence.data || !channels) return null;
    return {
      timeline: buildTimeline(warp.data),
      table: divergenceTable(divergence.data, channels),
    };
  }, [warp.data, divergence.data, channels]);
  return { data, error: warp.error ?? divergence.error };
}

export type SidePose = PoseFrames & { displayWidth: number; displayHeight: number };

/** The side's pose track over its climb. */
export function useSidePose(side: ComparisonSide | undefined) {
  return useQuery({
    queryKey: ['pose', side?.clipVideoId, side?.climbStartUs, side?.climbEndUs],
    enabled: side !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async (): Promise<SidePose | null> => {
      if (!side) return null;
      const bytes = await api.videos.pose(side.clipVideoId, {
        fromUs: side.climbStartUs,
        toUs: side.climbEndUs + 1,
      });
      const track = readPosebin(bytes);
      const frames = poseFrames(track);
      if (!frames) return null;
      const { displayWidth, displayHeight } = track.header;
      return { ...frames, displayWidth, displayHeight };
    },
  });
}

/** Per-move "aligned / misaligned" verdicts, stored as alignment regression labels (P3.5). */
export function useAlignmentFeedback(comparisonId: string) {
  return useMutation({
    mutationFn: (feedback: AlignmentFeedback) => api.comparisons.feedback(comparisonId, feedback),
  });
}

/** requestAnimationFrame-driven timeline clock. */
export function usePlaybackClock(durationUs: number) {
  const [clock, setClock] = useState<ClockState>({ position: 0, playing: false });

  useEffect(() => {
    if (!clock.playing) return undefined;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const elapsed = now - last;
      last = now;
      setClock((state) => advanceClock(state, elapsed, durationUs));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clock.playing, durationUs]);

  const play = useCallback(() => setClock((state) => startClock(state, durationUs)), [durationUs]);
  const pause = useCallback(() => setClock((state) => ({ ...state, playing: false })), []);
  const seek = useCallback(
    (position: number) => setClock((state) => seekClock(state, position, durationUs)),
    [durationUs],
  );
  return { clock, play, pause, seek };
}
