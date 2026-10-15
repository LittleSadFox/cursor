import { z } from 'zod';

import { UlidSchema } from './ids.js';
import { ActiveWindowSchema } from './pose-track.js';
import { UsSchema } from './time.js';

export const RecordingWarningSchema = z.enum([
  'camera_moving',
  'hdr_source',
  'vfr_source',
  'routes_detection_off',
  'truncated_file',
]);
export type RecordingWarning = z.infer<typeof RecordingWarningSchema>;

export const MotionSampleSchema = z.object({
  tUs: UsSchema,
  energy: z.number().nonnegative(),
  /** Global image motion magnitude (phase-correlation), normalized. */
  globalMotion: z.number().nonnegative(),
  dx: z.number().optional(),
  dy: z.number().optional(),
});
export type MotionSample = z.infer<typeof MotionSampleSchema>;

/** Sampled activity / motion signals written beside a recording (BUILD_PLAN §3.4). */
export const SignalsFileSchema = z.object({
  schemaVersion: z.literal(1),
  videoId: UlidSchema,
  sampleFps: z.number().positive(),
  samples: z.array(MotionSampleSchema),
  activeWindows: z.array(ActiveWindowSchema),
  warnings: z.array(RecordingWarningSchema),
});
export type SignalsFile = z.infer<typeof SignalsFileSchema>;

export function parseSignalsJson(text: string): SignalsFile {
  return SignalsFileSchema.parse(JSON.parse(text));
}

export function stringifySignals(file: SignalsFile): string {
  return `${JSON.stringify(SignalsFileSchema.parse(file), null, 2)}\n`;
}
