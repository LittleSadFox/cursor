import type { Boulder, BoulderInput, BoulderListQuery, BoulderPatch } from './boulders.js';
import type { CoachApi } from './coach-api.js';
import type { Accepted, Id, Page } from './common.js';
import type { Gym, GymInput, GymPatch } from './gyms.js';
import { HealthResponseSchema } from './health.js';
import type { Job, JobQuery } from './jobs.js';
import { isProblem, ProblemError, type Problem, type ProblemCode } from './problems.js';
import type { Session, SessionInput, SessionPatch } from './sessions.js';
import { SettingsSchema, type Settings, type SettingsPatch } from './settings.js';
import type {
  ExertionVolumePoint,
  FocusBucket,
  GradeCount,
  TrainingLoadSeries,
  WeeklySummary,
} from './stats.js';
import type { TrashKind } from './trash.js';
import type { FocusTag, TrainingLog, TrainingLogDay, TrainingLogInput } from './training-logs.js';

export type HttpClientOptions = {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
};

function problemFromBody(status: number, body: unknown): ProblemError {
  if (isProblem(body)) return new ProblemError(body.code as ProblemCode, body.detail, body.errors);
  return new ProblemError(
    status === 401 ? 'UNAUTHORIZED' : 'VALIDATION_FAILED',
    `HTTP ${status}`,
  );
}

export function createHttpCoachApi(options: HttpClientOptions): CoachApi {
  const fetchImpl = options.fetch ?? fetch;
  const prefix = `${options.baseUrl.replace(/\/$/, '')}/api/v1`;

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const url = new URL(`${prefix}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${options.token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 204) return undefined as T;
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) throw problemFromBody(response.status, json);
    return json as T;
  }

  function crud<T, Input, Patch>(base: string) {
    return {
      list: (q?: Record<string, unknown>) =>
        request<Page<T>>('GET', base, undefined, q as Record<string, string | number | boolean | undefined>),
      create: (input: Input) => request<T>('POST', base, input),
      get: (id: Id) => request<T>('GET', `${base}/${id}`),
      update: (id: Id, patch: Patch) => request<T>('PATCH', `${base}/${id}`, patch),
      remove: (id: Id) => request<void>('DELETE', `${base}/${id}`),
    };
  }

  return {
    system: {
      health: async () => HealthResponseSchema.parse(await request('GET', '/health')),
      getSettings: async () => SettingsSchema.parse(await request('GET', '/settings')),
      updateSettings: (patch: SettingsPatch) => request<Settings>('PATCH', '/settings', patch),
    },
    gyms: crud<Gym, GymInput, GymPatch>('/gyms'),
    boulders: {
      ...crud<Boulder, BoulderInput, BoulderPatch>('/boulders'),
      progress: (id: Id) => request('GET', `/boulders/${id}/progress`),
      list: (q?: BoulderListQuery) =>
        request('GET', '/boulders', undefined, q as Record<string, string | number | boolean | undefined>),
    },
    sessions: crud<Session, SessionInput, SessionPatch>('/sessions'),
    trainingLogs: {
      list: (range) => request('GET', '/training-logs', undefined, range),
      get: (date) => request<TrainingLogDay>('GET', `/training-logs/${date}`),
      put: (date, input: TrainingLogInput) => request<TrainingLog>('PUT', `/training-logs/${date}`, input),
      remove: (date) => request<void>('DELETE', `/training-logs/${date}`),
    },
    focusTags: {
      list: () => request<FocusTag[]>('GET', '/focus-tags'),
      create: (input) => request<FocusTag>('POST', '/focus-tags', input),
    },
    stats: {
      trainingLoad: (range, method) =>
        request<TrainingLoadSeries>('GET', '/stats/training-load', undefined, { ...range, method }),
      exertionVolume: (range) =>
        request<ExertionVolumePoint[]>('GET', '/stats/exertion-volume', undefined, range),
      focusDistribution: (range, bucket: 'week' | 'month') =>
        request<FocusBucket[]>('GET', '/stats/focus-distribution', undefined, { ...range, bucket }),
      gradePyramid: (range, discipline: 'boulder' | 'route') =>
        request<GradeCount[]>('GET', '/stats/grade-pyramid', undefined, { ...range, discipline }),
      weeklySummary: (week) => request<WeeklySummary>('GET', '/stats/weekly-summary', undefined, { week }),
    },
    trash: {
      list: () => request('GET', '/trash'),
      restore: (kind: TrashKind, id: string) => request('POST', `/trash/${kind}/${id}/restore`),
      purge: (kind: TrashKind, id: string) => request('DELETE', `/trash/${kind}/${id}`),
    },
    jobs: {
      list: (q?: JobQuery) =>
        request<Job[]>('GET', '/jobs', undefined, q as Record<string, string | number | boolean | undefined>),
      get: (id) => request<Job>('GET', `/jobs/${id}`),
      cancel: (id) => request('POST', `/jobs/${id}/cancel`),
      retry: (id) => request<Accepted>('POST', `/jobs/${id}/retry`),
    },
    events: {
      subscribe: () => () => {
        /* fetch-SSE is wired in apps/web; the raw client is request/response. */
      },
    },
  };
}

export function problemFromUnknown(error: unknown): Problem | null {
  if (error instanceof ProblemError) return error.problem;
  return null;
}
