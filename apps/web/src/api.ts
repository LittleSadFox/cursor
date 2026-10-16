import { createHttpCoachApi, type CoachApi } from '@climbing-coach/api';

const token = import.meta.env.VITE_COACH_TOKEN ?? 'dev-token';
const baseUrl = import.meta.env.VITE_API_BASE ?? '';

export const api: CoachApi = createHttpCoachApi({
  baseUrl: baseUrl === '' ? window.location.origin : baseUrl,
  token,
});
