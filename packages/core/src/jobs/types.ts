import type { Job, JobStep, ResourceClass } from '@climbing-coach/api';

export type PipelineStep = {
  name: string;
  resource: ResourceClass;
  dependsOn: readonly string[];
};

export type Pipeline = {
  type: string;
  steps: readonly PipelineStep[];
};

export type StepContext = {
  job: Job;
  step: JobStep;
  signal: AbortSignal;
};

export type StepHandler = (ctx: StepContext) => Promise<unknown>;

export function stepsFromPipeline(pipeline: Pipeline): JobStep[] {
  return pipeline.steps.map((step) => ({
    name: step.name,
    status: 'queued',
    resource: step.resource,
    dependsOn: [...step.dependsOn],
    error: null,
  }));
}

export function stepProgress(steps: readonly JobStep[]): number {
  if (steps.length === 0) return 1;
  const done = steps.filter((step) => step.status === 'succeeded').length;
  return done / steps.length;
}
