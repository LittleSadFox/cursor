import { z } from 'zod';

export const GradeSystemSchema = z.enum(['v', 'font', 'yds', 'french']);
export const LoadMethodSchema = z.enum(['rolling', 'ewma']);
export const DisciplinePrefSchema = z.enum(['boulder', 'route']);

export const SettingsSchema = z.object({
  libraryRoot: z.string().min(1).nullable(),
  libraryReady: z.boolean(),
  prePadUs: z.number().int().nonnegative(),
  postPadUs: z.number().int().nonnegative(),
  originalRetentionDays: z.number().int().positive(),
  trashRetentionDays: z.number().int().positive(),
  defaultDiscipline: DisciplinePrefSchema,
  gradeSystem: GradeSystemSchema,
  poseModel: z.string().min(1).nullable(),
  loadMethod: LoadMethodSchema,
  version: z.number().int().positive(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsPatchSchema = SettingsSchema.partial().omit({ libraryReady: true }).extend({
  expectedVersion: z.number().int().positive().optional(),
});
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export const DEFAULT_SETTINGS: Omit<Settings, 'libraryRoot' | 'libraryReady' | 'version'> = {
  prePadUs: 2_000_000,
  postPadUs: 1_500_000,
  originalRetentionDays: 30,
  trashRetentionDays: 30,
  defaultDiscipline: 'boulder',
  gradeSystem: 'v',
  poseModel: null,
  loadMethod: 'rolling',
};
