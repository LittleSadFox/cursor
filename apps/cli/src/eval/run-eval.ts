import { readFileSync } from 'node:fs';

import {
  bootstrapMedianCi,
  createMulberry32,
  scoreDetection,
  wilsonInterval,
  type ClimbRange,
} from '@climbing-coach/engine';

export type EvalCase = {
  id: string;
  labeled: ClimbRange[];
  predicted: ClimbRange[];
};

export type EvalFixture = {
  name: string;
  detectorVersion: string;
  toleranceUs: number;
  cases: EvalCase[];
};

export type EvalReport = {
  fixture: string;
  detectorVersion: string;
  toleranceUs: number;
  caseCount: number;
  labeledAttempts: number;
  recall: ReturnType<typeof wilsonInterval>;
  startWithin0_5s: ReturnType<typeof wilsonInterval>;
  endWithin0_5s: ReturnType<typeof wilsonInterval>;
  medianStartErrorUs: ReturnType<typeof bootstrapMedianCi>;
  medianEndErrorUs: ReturnType<typeof bootstrapMedianCi>;
};

export function loadEvalFixture(path: string): EvalFixture {
  return JSON.parse(readFileSync(path, 'utf8')) as EvalFixture;
}

export function runEval(fixture: EvalFixture, seed = 42): EvalReport {
  const startErrors: number[] = [];
  const endErrors: number[] = [];
  let labeledAttempts = 0;
  let matched = 0;
  let startWithin = 0;
  let endWithin = 0;

  for (const testCase of fixture.cases) {
    const score = scoreDetection(testCase.predicted, testCase.labeled, fixture.toleranceUs);
    labeledAttempts += score.labeledCount;
    matched += score.matchedCount;
    startWithin += score.startWithinCount;
    endWithin += score.endWithinCount;
    startErrors.push(...score.startErrorsUs);
    endErrors.push(...score.endErrorsUs);
  }

  return {
    fixture: fixture.name,
    detectorVersion: fixture.detectorVersion,
    toleranceUs: fixture.toleranceUs,
    caseCount: fixture.cases.length,
    labeledAttempts,
    recall: wilsonInterval(matched, labeledAttempts),
    startWithin0_5s: wilsonInterval(startWithin, labeledAttempts),
    endWithin0_5s: wilsonInterval(endWithin, labeledAttempts),
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

export function formatEvalReport(report: EvalReport): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const us = (x: number) => `${(x / 1000).toFixed(0)} ms`;
  return [
    `eval: ${report.fixture}`,
    `detector: ${report.detectorVersion}`,
    `cases: ${report.caseCount}  labeled attempts: ${report.labeledAttempts}`,
    `tolerance: ${report.toleranceUs / 1_000_000}s`,
    `recall: ${pct(report.recall.estimate)}  95% CI [${pct(report.recall.low)}, ${pct(report.recall.high)}]`,
    `start ≤0.5s: ${pct(report.startWithin0_5s.estimate)}  95% CI [${pct(report.startWithin0_5s.low)}, ${pct(report.startWithin0_5s.high)}]`,
    `end ≤0.5s: ${pct(report.endWithin0_5s.estimate)}  95% CI [${pct(report.endWithin0_5s.low)}, ${pct(report.endWithin0_5s.high)}]`,
    `median |Δstart|: ${us(report.medianStartErrorUs.median)}  95% CI [${us(report.medianStartErrorUs.low)}, ${us(report.medianStartErrorUs.high)}]`,
    `median |Δend|: ${us(report.medianEndErrorUs.median)}  95% CI [${us(report.medianEndErrorUs.low)}, ${us(report.medianEndErrorUs.high)}]`,
  ].join('\n');
}
