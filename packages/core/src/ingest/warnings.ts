/** Add or remove `camera_moving` without dropping other stored warnings. */
export function setCameraMovingWarning(warningsJson: string, moving: boolean): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(warningsJson);
  } catch {
    parsed = [];
  }
  const warnings = Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string' && item !== 'camera_moving')
    : [];
  if (moving) warnings.push('camera_moving');
  return JSON.stringify(warnings);
}

export function parseWarningList(warningsJson: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(warningsJson);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === 'string');
}
