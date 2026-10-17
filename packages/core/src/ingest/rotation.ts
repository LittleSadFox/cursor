/**
 * Probe rotation (same sign convention as `videos.rotation`; iPhone portrait is often −90)
 * reduced mod 360 for the posebin header, so −90 and 90 stay distinct. Non-quarter values
 * fall back to 0.
 */
export function quarterTurn(rotation: number): 0 | 90 | 180 | 270 {
  const turned = ((Math.round(rotation) % 360) + 360) % 360;
  return turned === 90 || turned === 180 || turned === 270 ? turned : 0;
}
