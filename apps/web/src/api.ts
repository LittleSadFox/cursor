import {
  createHttpCoachApi,
  isProblem,
  ProblemError,
  RecordingSchema,
  type CoachApi,
  type ProblemCode,
  type RecordingAccepted,
} from '@climbing-coach/api';

const token = import.meta.env.VITE_COACH_TOKEN ?? 'dev-token';
const baseUrl = import.meta.env.VITE_API_BASE ?? '';

export const api: CoachApi = createHttpCoachApi({
  baseUrl: baseUrl === '' ? window.location.origin : baseUrl,
  token,
});

/** Raw upload. The JSON client cannot stream a file body. */
export async function uploadRecording(file: File): Promise<RecordingAccepted> {
  const root = baseUrl === '' ? '' : baseUrl.replace(/\/$/, '');
  const response = await fetch(`${root}/api/v1/recordings/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/octet-stream',
      'x-filename': encodeURIComponent(file.name),
    },
    body: file,
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (isProblem(json)) throw new ProblemError(json.code as ProblemCode, json.detail, json.errors);
    throw new ProblemError('VALIDATION_FAILED', 'Upload failed.');
  }
  const body = json as { jobId?: string; recording?: unknown };
  if (!body.jobId) throw new ProblemError('VALIDATION_FAILED', 'Upload failed.');
  return { jobId: body.jobId, recording: RecordingSchema.parse(body.recording) };
}
