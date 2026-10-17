import { describe, expect, it } from 'vitest';

import { A, B, C, detector, serverItem } from './fixtures.test-util.js';
import { rebaseDraft } from './rebase.js';

describe('rebaseDraft', () => {
  it('keeps local edits and takes the new untouched proposals', () => {
    const local = [
      detector(A, 0, 12_000_000, { touched: true }),
      detector(B, 20_000_000, 30_000_000),
    ];
    const server = [
      serverItem(detector(A, 0, 10_000_000)),
      serverItem(detector(C, 40_000_000, 50_000_000)),
    ];
    expect(rebaseDraft(local, server).map((row) => [row.id, row.climb.endUs])).toEqual([
      [A, 12_000_000],
      [C, 50_000_000],
    ]);
  });

  it('does not bring back a proposal over a locally rejected climb', () => {
    const local = [detector(A, 0, 10_000_000, { status: 'rejected', touched: true })];
    const server = [serverItem(detector(B, 5_000_000, 15_000_000))];
    expect(rebaseDraft(local, server).map((row) => row.id)).toEqual([A]);
  });

  it('takes committed rows from the server and drops proposals over them', () => {
    const local = [detector(A, 0, 10_000_000, { touched: true })];
    const server = [
      serverItem(detector(A, 0, 10_000_000, { status: 'committed' })),
      serverItem(detector(B, 5_000_000, 12_000_000)),
    ];
    expect(rebaseDraft(local, server).map((row) => [row.id, row.status])).toEqual([
      [A, 'committed'],
    ]);
  });

  it('keeps a moved local row when the server still has its untouched copy', () => {
    const local = [detector(A, 30_000_000, 40_000_000, { touched: true })];
    const server = [serverItem(detector(A, 0, 10_000_000))];
    expect(rebaseDraft(local, server).map((row) => row.climb.startUs)).toEqual([30_000_000]);
  });
});
