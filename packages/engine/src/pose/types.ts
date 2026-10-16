/** One BlazePose point in display space. y grows downward. */
export type XyzV = {
  x: number;
  y: number;
  z: number;
  visibility: number;
};

/** One pose frame. `landmarks` is always length 33 (BlazePose order). */
export type PoseSample = {
  tUs: number;
  landmarks: readonly XyzV[];
};

export type TrackSamples = {
  trackId: string;
  samples: readonly PoseSample[];
};

export type WallRect = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};
