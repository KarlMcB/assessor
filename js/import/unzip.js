// Minimal ZIP reader: stored and deflated entries, using the browser's
// DecompressionStream (Safari 16.4+, Node 18+).

export async function readZip(input) {
  const buf = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // End of central directory: search backwards (a comment may follow it).
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('This isn’t a zip file.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries = new Map();

  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('The zip file is damaged.');
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const lnameLen = view.getUint16(localOffset + 26, true);
    const lextraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lnameLen + lextraLen;
    entries.set(name, { method, data: bytes.subarray(start, start + compSize) });
  }

  return {
    names: () => [...entries.keys()],
    has: (name) => entries.has(name),
    async bytes(name) {
      const e = entries.get(name);
      if (!e) return null;
      if (e.method === 0) return e.data;
      if (e.method !== 8) throw new Error(`Unsupported compression in ${name}`);
      const stream = new Blob([e.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    },
    async text(name) {
      const b = await this.bytes(name);
      return b && dec.decode(b);
    },
  };
}
