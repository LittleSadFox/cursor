import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  CutMode,
  Recording,
  RecordingImport,
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

/**
 * The job status is part of the key, so the list refetches once more when the import
 * job settles. Polling alone would stop before the final `propose` step lands.
 */
export function useReviewItems(recording: Pick<Recording, 'id' | 'kind' | 'jobStatus'>) {
  return useQuery({
    queryKey: ['recordings', recording.id, 'review', recording.jobStatus],
    queryFn: () => api.recordings.review(recording.id),
    enabled: recording.kind === 'original',
    refetchInterval: jobBusy(recording.jobStatus) ? 1500 : false,
  });
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
