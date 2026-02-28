// CRC32 lookup table
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  crcTable[i] = c;
}

function calculateCRC(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Read a PNG tEXt chunk value by key.
 * Returns null if the key is not found.
 */
export async function readPngMetadata(blob: Blob, targetKey: string): Promise<string | null> {
  const buffer = await blob.arrayBuffer();
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  let offset = 8; // skip 8-byte PNG signature

  while (offset < data.length - 12) {
    const chunkLen = view.getUint32(offset);
    const chunkType = decoder.decode(data.slice(offset + 4, offset + 8));

    if (chunkType === "tEXt") {
      const body = data.slice(offset + 8, offset + 8 + chunkLen);
      const nullIdx = body.indexOf(0);
      if (nullIdx !== -1) {
        const key = decoder.decode(body.slice(0, nullIdx));
        if (key === targetKey) {
          return decoder.decode(body.slice(nullIdx + 1));
        }
      }
    }

    offset += 12 + chunkLen;
    if (chunkType === "IEND") break;
  }

  return null;
}

/**
 * Inject a tEXt chunk into a PNG blob, inserted right after the IHDR chunk.
 */
export async function injectPngMetadata(blob: Blob, key: string, value: string): Promise<Blob> {
  const buffer = await blob.arrayBuffer();
  const original = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const encoder = new TextEncoder();

  // Parse all existing chunks
  const chunks: Uint8Array[] = [];
  let offset = 8;
  while (offset < original.length) {
    const chunkLen = view.getUint32(offset);
    const chunkType = new TextDecoder().decode(original.slice(offset + 4, offset + 8));
    const totalLen = 12 + chunkLen;
    chunks.push(original.slice(offset, offset + totalLen));
    offset += totalLen;
    if (chunkType === "IEND") break;
  }

  // Build tEXt chunk body: key + null byte + value
  const keyBytes = encoder.encode(key);
  const valBytes = encoder.encode(value);
  const body = new Uint8Array(keyBytes.length + 1 + valBytes.length);
  body.set(keyBytes);
  body[keyBytes.length] = 0;
  body.set(valBytes, keyBytes.length + 1);

  // Build full tEXt chunk: length(4) + type(4) + body + crc(4)
  const textChunk = new Uint8Array(12 + body.length);
  const textView = new DataView(textChunk.buffer);
  textView.setUint32(0, body.length);
  textChunk.set(encoder.encode("tEXt"), 4);
  textChunk.set(body, 8);
  const crcInput = new Uint8Array(4 + body.length);
  crcInput.set(encoder.encode("tEXt"));
  crcInput.set(body, 4);
  textView.setUint32(8 + body.length, calculateCRC(crcInput));

  // Assemble: PNG signature + IHDR + tEXt + rest of chunks
  // Copy to a fresh ArrayBuffer to satisfy strict BlobPart typing
  const toBuffer = (u8: Uint8Array): ArrayBuffer => {
    const buf = new ArrayBuffer(u8.byteLength);
    new Uint8Array(buf).set(u8);
    return buf;
  };

  const signature = original.slice(0, 8);
  const parts: BlobPart[] = [
    toBuffer(signature),
    toBuffer(chunks[0]),
    toBuffer(textChunk),
    ...chunks.slice(1).map(toBuffer),
  ];
  return new Blob(parts, { type: "image/png" });
}

/** Encode a string to base64 (UTF-8 safe) */
export function encodeHouseData(jsonStr: string): string {
  return btoa(unescape(encodeURIComponent(jsonStr)));
}

/** Decode a base64-encoded string, fallback to raw if decoding fails */
export function decodeHouseData(encoded: string): string {
  try {
    return decodeURIComponent(escape(atob(encoded)));
  } catch {
    return encoded;
  }
}
