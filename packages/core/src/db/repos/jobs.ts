import { and, desc, eq } from 'drizzle-orm';

import { ProblemError, type Job, type JobQuery, type JobStatus, type JobStep } from '@climbing-coach/api';

import type { AppDatabase } from '../../ports/sql.js';
import { parseJson, stringifyJson } from '../json.js';
import { jobs } from '../schema.js';

function toJob(row: typeof jobs.$inferSelect): Job {
  return {
    id: row.id,
    type: row.type,
    status: row.status as JobStatus,
    steps: parseJson<JobStep[]>(row.stepsJson, []),
    progress: row.progress / 1000,
    payload: parseJson(row.payloadJson, {}),
    result: row.resultJson === null ? null : parseJson(row.resultJson, null),
    error: row.error,
    attempt: row.attempt,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

export function insertJob(db: AppDatabase, job: Job): void {
  db.insert(jobs)
    .values({
      id: job.id,
      type: job.type,
      status: job.status,
      stepsJson: stringifyJson(job.steps),
      progress: Math.round(job.progress * 1000),
      payloadJson: stringifyJson(job.payload ?? {}),
      resultJson: job.result === null || job.result === undefined ? null : stringifyJson(job.result),
      error: job.error,
      attempt: job.attempt,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    })
    .run();
}

export function saveJob(db: AppDatabase, job: Job): void {
  db.update(jobs)
    .set({
      status: job.status,
      stepsJson: stringifyJson(job.steps),
      progress: Math.round(job.progress * 1000),
      payloadJson: stringifyJson(job.payload ?? {}),
      resultJson: job.result === null || job.result === undefined ? null : stringifyJson(job.result),
      error: job.error,
      attempt: job.attempt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    })
    .where(eq(jobs.id, job.id))
    .run();
}

export function getJob(db: AppDatabase, id: string): Job {
  const row = db.select().from(jobs).where(eq(jobs.id, id)).get();
  if (!row) throw new ProblemError('NOT_FOUND', `job ${id} not found`);
  return toJob(row);
}

export function listJobs(db: AppDatabase, query: JobQuery = {}): Job[] {
  const filters = [];
  if (query.status) filters.push(eq(jobs.status, query.status));
  if (query.type) filters.push(eq(jobs.type, query.type));
  const rows =
    filters.length === 0
      ? db.select().from(jobs).orderBy(desc(jobs.createdAt)).all()
      : db
          .select()
          .from(jobs)
          .where(and(...filters))
          .orderBy(desc(jobs.createdAt))
          .all();
  return rows.map(toJob);
}

export function incompleteJobs(db: AppDatabase): Job[] {
  return listJobs(db).filter((job) => job.status === 'queued' || job.status === 'running');
}
