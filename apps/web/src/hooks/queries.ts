import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CutMode,
  FilmstripQuery,
  RecordingImport,
  ReprocessScope,
  ReviewState,
  SettingsPatch,
  TrainingLogInput,
  TrashKind,
} from '@climbing-coach/api';

import { api } from '../api.js';
import { isoWeekOf, localDate, rangeFrom, type RangeKey } from '../dates.js';
import { jobBusy } from '../pages/recordings-format.js';

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api.system.getSettings() });
}

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: () => api.system.health() });
}

export function useToday(date = localDate()) {
  return useQuery({ queryKey: ['training-log', date], queryFn: () => api.trainingLogs.get(date) });
}

export function useFocusTags() {
  return useQuery({ queryKey: ['focus-tags'], queryFn: () => api.focusTags.list() });
}

export function useStats(rangeKey: RangeKey, method: 'rolling' | 'ewma') {
  const today = localDate();
  const range = rangeFrom(rangeKey, today);
  const week = isoWeekOf(today);
  return {
    range,
    load: useQuery({
      queryKey: ['stats', 'load', range, method],
      queryFn: () => api.stats.trainingLoad(range, method),
    }),
    volume: useQuery({
      queryKey: ['stats', 'volume', range],
      queryFn: () => api.stats.exertionVolume(range),
    }),
    focus: useQuery({
      queryKey: ['stats', 'focus', range],
      queryFn: () => api.stats.focusDistribution(range, 'week'),
    }),
    pyramid: useQuery({
      queryKey: ['stats', 'pyramid', range],
      queryFn: () => api.stats.gradePyramid(range, 'boulder'),
    }),
    weekly: useQuery({
      queryKey: ['stats', 'weekly', week],
      queryFn: () => api.stats.weeklySummary(week),
    }),
  };
}

export function useTrash() {
  return useQuery({ queryKey: ['trash'], queryFn: () => api.trash.list() });
}

export function useSaveToday(date = localDate()) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: TrainingLogInput) => api.trainingLogs.put(date, input),
    onSuccess: async () => {
      await client.invalidateQueries();
    },
    // A version conflict means another writer won; reload the day so the form shows it.
    onError: async () => {
      await client.invalidateQueries({ queryKey: ['training-log', date] });
    },
  });
}

export function useSaveSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => api.system.updateSettings(patch),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

export function useRecordings() {
  return useQuery({
    queryKey: ['recordings'],
    queryFn: () => api.recordings.list(),
    refetchInterval: (query) => {
      const busy = (query.state.data ?? []).some((row) => jobBusy(row.jobStatus));
      return busy ? 1500 : false;
    },
  });
}

export function useImportPath() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordingImport) => api.recordings.importPath(input),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['recordings'] });
    },
  });
}

export function useRecording(id: string) {
  return useQuery({
    queryKey: ['recordings', id],
    queryFn: () => api.recordings.get(id),
    refetchInterval: (query) => (jobBusy(query.state.data?.jobStatus ?? null) ? 1500 : false),
  });
}

export function reviewKey(id: string) {
  return ['recordings', id, 'review'] as const;
}

/** Polls while import or reprocess may still add proposals. */
export function useReviewState(id: string, enabled = true) {
  return useQuery({
    queryKey: reviewKey(id),
    queryFn: () => api.review.get(id),
    enabled,
    refetchInterval: (query) => (query.state.data?.processing.complete === false ? 1500 : false),
  });
}

export function useReprocess(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (scope: ReprocessScope) => api.recordings.reprocess(id, { scope }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['recordings'] });
    },
  });
}

/** Frame sprites change only when the proxy does, so they never go stale. */
export function useFilmstrip(id: string, query: FilmstripQuery | null) {
  return useQuery({
    queryKey: ['recordings', id, 'filmstrip', query],
    queryFn: () => api.recordings.filmstrip(id, query as FilmstripQuery),
    enabled: query !== null,
    staleTime: Infinity,
  });
}

export function useLoupe(id: string, atUs: number | null) {
  return useQuery({
    queryKey: ['recordings', id, 'loupe', atUs],
    queryFn: () => api.recordings.loupe(id, atUs ?? 0),
    enabled: atUs !== null,
    staleTime: Infinity,
  });
}

export function useSetReviewState() {
  const client = useQueryClient();
  return (state: ReviewState) => client.setQueryData(reviewKey(state.recordingId), state);
}

export function useCutRecording() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; startUs: number; endUs: number; mode: CutMode }) =>
      api.recordings.cut(input.id, {
        startUs: input.startUs,
        endUs: input.endUs,
        mode: input.mode,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['recordings'] });
    },
  });
}

export function useTrashActions() {
  const client = useQueryClient();
  return {
    restore: useMutation({
      mutationFn: (item: { kind: TrashKind; id: string }) => api.trash.restore(item.kind, item.id),
      onSuccess: async () => {
        await client.invalidateQueries();
      },
    }),
    purge: useMutation({
      mutationFn: (item: { kind: TrashKind; id: string }) => api.trash.purge(item.kind, item.id),
      onSuccess: async () => {
        await client.invalidateQueries({ queryKey: ['trash'] });
      },
    }),
  };
}
