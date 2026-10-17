export type PipeImage = {
  format: 'rgb' | 'gray';
  width: number;
  height: number;
  data: Uint8Array;
};

type Header = { magic: 'P5' | 'P6'; width: number; height: number; dataOffset: number };

function readHeader(buffer: Buffer, offset: number): Header | null {
  if (buffer.length - offset < 3) return null;
  const magic = buffer.toString('ascii', offset, offset + 2);
  if (magic !== 'P5' && magic !== 'P6') return null;
  if (buffer[offset + 2] !== 0x0a) return null;
  let cursor = offset + 3;
  const tokens: string[] = [];
  let token = '';
  while (cursor < buffer.length && tokens.length < 3) {
    const byte = buffer[cursor]!;
    cursor += 1;
    if (byte === 0x0a || byte === 0x20) {
      if (token) {
        tokens.push(token);
        token = '';
      }
      if (tokens.length === 3) break;
      continue;
    }
    token += String.fromCharCode(byte);
  }
  if (tokens.length < 3) return null;
  const width = Number(tokens[0]);
  const height = Number(tokens[1]);
  const maxval = Number(tokens[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return null;
  }
  if (maxval !== 255) return null;
  return { magic, width, height, dataOffset: cursor };
}

/** Pull complete P5/P6 images out of an `image2pipe` buffer. `rest` is an incomplete tail. */
export function drainImages(buffer: Buffer): { images: PipeImage[]; rest: Buffer } {
  const images: PipeImage[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0x50 /* P */) break;
    const header = readHeader(buffer, offset);
    if (!header) break;
    const channels = header.magic === 'P6' ? 3 : 1;
    const size = header.width * header.height * channels;
    if (buffer.length < header.dataOffset + size) break;
    const view = buffer.subarray(header.dataOffset, header.dataOffset + size);
    images.push({
      format: header.magic === 'P6' ? 'rgb' : 'gray',
      width: header.width,
      height: header.height,
      data: Uint8Array.from(view),
    });
    offset = header.dataOffset + size;
  }
  return { images, rest: buffer.subarray(offset) };
}
