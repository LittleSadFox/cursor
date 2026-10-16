export const PROBLEM_CODES = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN_ORIGIN: 403,
  INVALID_SIGNATURE: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  REVIEW_REVISION_CONFLICT: 409,
  CLIMB_OVERLAP: 409,
  ALREADY_COMMITTED: 409,
  POSE_MODEL_MISMATCH: 409,
  ORIGINAL_DELETED: 410,
  UNSUPPORTED_MEDIA: 415,
  POSE_RUNTIME_UNAVAILABLE: 503,
  FFMPEG_UNAVAILABLE: 503,
  INTERNAL: 500,
  NOT_IMPLEMENTED: 501,
  STORAGE_FULL: 507,
} as const;

export type ProblemCode = keyof typeof PROBLEM_CODES;

export type FieldError = { path: string; message: string };

export type Problem = {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail: string;
  errors?: FieldError[];
};

const TITLES: Record<ProblemCode, string> = {
  VALIDATION_FAILED: 'Validation failed',
  UNAUTHORIZED: 'Unauthorized',
  FORBIDDEN_ORIGIN: 'Forbidden origin',
  INVALID_SIGNATURE: 'Invalid signature',
  NOT_FOUND: 'Not found',
  VERSION_CONFLICT: 'Version conflict',
  REVIEW_REVISION_CONFLICT: 'Review revision conflict',
  CLIMB_OVERLAP: 'Climb ranges overlap',
  ALREADY_COMMITTED: 'Already committed',
  POSE_MODEL_MISMATCH: 'Pose model mismatch',
  ORIGINAL_DELETED: 'Original deleted',
  UNSUPPORTED_MEDIA: 'Unsupported media',
  POSE_RUNTIME_UNAVAILABLE: 'Pose runtime unavailable',
  FFMPEG_UNAVAILABLE: 'ffmpeg unavailable',
  INTERNAL: 'Internal error',
  NOT_IMPLEMENTED: 'Not implemented',
  STORAGE_FULL: 'Storage full',
};

export class ProblemError extends Error {
  readonly problem: Problem;

  constructor(code: ProblemCode, detail: string, errors?: FieldError[]) {
    super(detail);
    this.name = 'ProblemError';
    this.problem = {
      type: `https://climbing-coach.app/problems/${code.toLowerCase().replace(/_/g, '-')}`,
      title: TITLES[code],
      status: PROBLEM_CODES[code],
      code,
      detail,
      ...(errors === undefined ? {} : { errors }),
    };
  }
}

export function isProblem(value: unknown): value is Problem {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.code === 'string' && typeof rec.status === 'number' && typeof rec.detail === 'string'
  );
}
