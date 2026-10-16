import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { SettingsPatch, TrainingLogInput, TrashKind } from '@climbing-coach/api';

import { api } from '../api.js';
import { isoWeekOf, localDate, rangeFrom, type RangeKey } from '../dates.js';

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api.system.getSettings() });
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
