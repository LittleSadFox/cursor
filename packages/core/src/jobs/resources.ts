import type { ResourceClass } from '@climbing-coach/api';

export type ResourceLimits = Record<ResourceClass, number>;

export function defaultLimits(cpuCores: number): ResourceLimits {
  return {
    pose: 1,
    ffmpeg: 2,
    compute: Math.max(1, cpuCores - 1),
    idle: 1,
  };
}

export function hasCapacity(
  limits: ResourceLimits,
  running: Readonly<Record<ResourceClass, number>>,
  resource: ResourceClass,
  busyNonIdle: boolean,
): boolean {
  if (resource === 'idle' && busyNonIdle) return false;
  return (running[resource] ?? 0) < limits[resource];
}

export function countRunning(resources: Iterable<ResourceClass>): Record<ResourceClass, number> {
  const counts: Record<ResourceClass, number> = { pose: 0, ffmpeg: 0, compute: 0, idle: 0 };
  for (const resource of resources) counts[resource] += 1;
  return counts;
}
