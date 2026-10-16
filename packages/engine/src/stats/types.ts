export type Discipline = 'boulder' | 'route';

export type GradeTally = {
  discipline: Discipline;
  grade: string;
  attempted: number;
  sent: number;
};

export type DailyLog = {
  date: string;
  sessionExertion: number | null;
  durationMin: number | null;
  sessionType: string;
  primaryFocusId: string | null;
  secondaryFocusIds: readonly string[];
  boulderCount: number;
  routeCount: number;
  grades: readonly GradeTally[];
  /** Explicit rest day (PLAN 2.11). Counts as load 0. */
  rest: boolean;
};

export type AttemptSummary = {
  date: string;
  exertion: number | null;
  boulderId: string | null;
  boulderGrade: string | null;
  discipline: Discipline;
  outcome: 'fall' | 'drop' | 'top' | 'unknown';
};

export type DateRange = {
  from: string;
  to: string;
};

export type LoadMethod = 'rolling' | 'ewma';

export type AcwrBand = 'detraining' | 'steady' | 'caution' | 'ramping_fast' | 'insufficient_data';

export type DailyLoadPoint = {
  date: string;
  logged: boolean;
  rest: boolean;
  load: number | null;
  short: number | null;
  long: number | null;
  acwr: number | null;
  band: AcwrBand;
};

export type TrainingLoadSeries = {
  unit: 'AU (session exertion × minutes)';
  method: LoadMethod;
  days: DailyLoadPoint[];
};

export type ExertionVolumePoint = {
  date: string;
  exertion: number | null;
  volume: number;
};

export type FocusBucket = {
  bucket: string;
  counts: Readonly<Record<string, number>>;
};

export type WeeklySummary = {
  week: string;
  sessions: number;
  totalLoad: number | null;
  hardestSend: string | null;
  daysSinceRest: number | null;
};

export type TrainingLogPrefill = {
  sessionExertion: number | null;
  basis: { attempts: number; mean: number | null; max: number | null };
  boulderCount: number;
  grades: GradeTally[];
};
