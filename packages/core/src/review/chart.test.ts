import { describe, expect, it } from 'vitest';

import { chartStride } from './chart.js';

describe('chartStride', () => {
  it('keeps a short series and strides a long one', () => {
    expect(chartStride([1, 2, 3], 5)).toEqual([1, 2, 3]);
    expect(chartStride([0, 1, 2, 3, 4, 5, 6, 7], 4)).toEqual([0, 2, 4, 6]);
    expect(chartStride([1], 0)).toEqual([]);
  });
});
