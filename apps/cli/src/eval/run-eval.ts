import { readFileSync } from 'node:fs';

import {
  bootstrapMedianCi,
  createMulberry32,
  falsePositivesPerMinute,
  scoreDetection,
  wilsonInterval,
} from '@climbing-coach/engine';
import { parseEvalFixture, type EvalFixture } from '@climbing-coach/schema';

export type EvalReport = {
  fixture: string;
  detectorVersion: string;
  toleranceUs: number;
  maxMatchUs: number;
  caseCount: number;
  labeledAttempts: number;
  durationUs: number;
  falsePositives: number;
  falsePositivesPerMinute: number;
  recall: ReturnType<typeof wilsonInterval>;
  startWithinTolerance: ReturnType<typeof wilsonInterval>;
  endWithinTolerance: ReturnType<typeof wilsonInterval>;
  medianStartErrorUs: ReturnType<typeof bootstrapMedianCi>;
  medianEndErrorUs: ReturnType<typeof bootstrapMedianCi>;
};

export function loadEvalFixture(path: string): EvalFixture {
  return parseEvalFixture(JSON.parse(readFileSync(path, 'utf8')));
}

export function runEval(fixture: EvalFixture, seed = 42): EvalReport {
  const startErrors: number[] = [];
  const endErrors: number[] = [];
  let labeledAttempts = 0;
  let matched = 0;
  let startWithin = 0;
  let endWithin = 0;
  let falsePositives = 0;
  let durationUs = 0;

  for (const testCase of fixture.cases) {
    const score = scoreDetection(testCase.predicted, testCase.labeled, {
      toleranceUs: fixture.toleranceUs,
      maxMatchUs: fixture.maxMatchUs,
      durationUs: testCase.durationUs,
    });
    labeledAttempts += score.labeledCount;
    matched += score.matchedCount;
    startWithin += score.startWithinCount;
    endWithin += score.endWithinCount;
    falsePositives += score.falsePositives;
    durationUs += testCase.durationUs;
    startErrors.push(...score.startErrorsUs);
    endErrors.push(...score.endErrorsUs);
  }

  return {
    fixture: fixture.name,
    detectorVersion: fixture.detectorVersion,
    toleranceUs: fixture.toleranceUs,
    maxMatchUs: fixture.maxMatchUs,
    caseCount: fixture.cases.length,
    labeledAttempts,
    durationUs,
    falsePositives,
    falsePositivesPerMinute: falsePositivesPerMinute(falsePositives, durationUs),
    recall: wilsonInterval(matched, labeledAttempts),
    startWithinTolerance: wilsonInterval(startWithin, labeledAttempts),
    endWithinTolerance: wilsonInterval(endWithin, labeledAttempts),
    medianStartErrorUs: bootstrapMedianCi(startErrors, {
      iterations: 1000,
      rng: createMulberry32(seed),
    }),
    medianEndErrorUs: bootstrapMedianCi(endErrors, {
      iterations: 1000,
      rng: createMulberry32(seed + 1),
    }),
  };
}

function formatPercent(value: number): string {
  return Number.isNaN(value) ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function formatMs(value: number): string {
  return Number.isNaN(value) ? 'n/a' : `${(value / 1000).toFixed(0)} ms`;
}

export function formatEvalReport(report: EvalReport): string {
  return [
    `eval: ${report.fixture}`,
    `detector: ${report.detectorVersion}`,
    `cases: ${report.caseCount}  labeled attempts: ${report.labeledAttempts}`,
    `tolerance: ${report.toleranceUs / 1_000_000}s  maxMatch: ${report.maxMatchUs / 1_000_000}s`,
    `recall: ${formatPercent(report.recall.estimate)}  95% CI [${formatPercent(report.recall.low)}, ${formatPercent(report.recall.high)}]`,
    `start within tolerance: ${formatPercent(report.startWithinTolerance.estimate)}  95% CI [${formatPercent(report.startWithinTolerance.low)}, ${formatPercent(report.startWithinTolerance.high)}]`,
    `end within tolerance: ${formatPercent(report.endWithinTolerance.estimate)}  95% CI [${formatPercent(report.endWithinTolerance.low)}, ${formatPercent(report.endWithinTolerance.high)}]`,
    `false positives: ${report.falsePositives}  (${report.falsePositivesPerMinute.toFixed(3)} / min)`,
    `median |Δstart|: ${formatMs(report.medianStartErrorUs.median)}  95% CI [${formatMs(report.medianStartErrorUs.low)}, ${formatMs(report.medianStartErrorUs.high)}]`,
    `median |Δend|: ${formatMs(report.medianEndErrorUs.median)}  95% CI [${formatMs(report.medianEndErrorUs.low)}, ${formatMs(report.medianEndErrorUs.high)}]`,
  ].join('\n');
}
