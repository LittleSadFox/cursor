/**
 * Files inside the library root, addressed by library-relative paths such as
 * `pose/<videoId>.hq.posebin` or `comparisons/<id>.bin` (BUILD_PLAN §3.4).
 * The adapter rejects paths that escape the root.
 */
export type BlobStore = {
  read(relativePath: string): Promise<Uint8Array>;
  write(relativePath: string, bytes: Uint8Array): Promise<void>;
};
