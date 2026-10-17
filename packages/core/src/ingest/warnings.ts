/** Stored `warnings_json` as strings; anything malformed reads as no warnings. */
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

/** Add or remove `camera_moving` without dropping other stored warnings. */
export function setCameraMovingWarning(warningsJson: string, moving: boolean): string {
  const others = parseWarningList(warningsJson).filter((item) => item !== 'camera_moving');
  return JSON.stringify(moving ? [...others, 'camera_moving'] : others);
}
