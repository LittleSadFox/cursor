import { z } from 'zod';

import { UlidSchema } from '@climbing-coach/schema';

export const TrashKindSchema = z.enum([
  'gym',
  'boulder',
  'session',
  'training_log',
  'recording',
  'attempt',
]);
export type TrashKind = z.infer<typeof TrashKindSchema>;

export const TrashItemSchema = z.object({
  kind: TrashKindSchema,
  id: z.string().min(1),
  title: z.string(),
  deletedAt: z.string(),
  purgeAfterAt: z.string(),
});
export type TrashItem = z.infer<typeof TrashItemSchema>;

export const TrashRestoreSchema = z.object({
  kind: TrashKindSchema,
  id: z.union([UlidSchema, z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
});
