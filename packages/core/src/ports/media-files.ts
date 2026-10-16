/** Library file placement. Paths stored on a video row are either library-relative or absolute (reference). */
export interface MediaFiles {
  stat(path: string): Promise<{ size: number }>;
  copyInto(sourcePath: string, relativePath: string): Promise<void>;
  moveInto(sourcePath: string, relativePath: string): Promise<void>;
  /** Absolute path for a stored video path. Absolute inputs pass through. */
  absolute(storedPath: string): string;
}
