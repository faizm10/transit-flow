/**
 * Incremental SHA-256.
 *
 * WebCrypto's `crypto.subtle.digest` is one-shot: it wants the whole file as a
 * single ArrayBuffer. For a 500MB GTFS zip that is a 500MB allocation, several
 * seconds of silence, and no way to report progress. This version is fed 8MB
 * slices instead, so memory stays flat and the upload card can show a real
 * percentage. It runs inside a Web Worker (`workers/gtfsChecksum.worker.ts`).
 *
 * Dependency-free on purpose: the worker package's tests import it directly.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const HEX: string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, "0")
);

export class Sha256 {
  private readonly h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  private readonly w = new Uint32Array(64);
  private readonly block = new Uint8Array(64);
  private blockLen = 0;
  private totalLen = 0;
  private done = false;

  update(chunk: Uint8Array): this {
    if (this.done) throw new Error("Sha256: update() after digest()");
    this.totalLen += chunk.length;

    let offset = 0;
    if (this.blockLen > 0) {
      const take = Math.min(64 - this.blockLen, chunk.length);
      this.block.set(chunk.subarray(0, take), this.blockLen);
      this.blockLen += take;
      offset = take;
      if (this.blockLen === 64) {
        this.compress(this.block, 0);
        this.blockLen = 0;
      }
    }
    while (offset + 64 <= chunk.length) {
      this.compress(chunk, offset);
      offset += 64;
    }
    if (offset < chunk.length) {
      this.block.set(chunk.subarray(offset), 0);
      this.blockLen = chunk.length - offset;
    }
    return this;
  }

  digestHex(): string {
    if (!this.done) {
      // 0x80, zero pad to 56 mod 64, then the 64-bit big-endian bit length.
      const bitLen = this.totalLen * 8;
      const tail = new Uint8Array(this.blockLen < 56 ? 64 : 128);
      tail.set(this.block.subarray(0, this.blockLen), 0);
      tail[this.blockLen] = 0x80;
      const hi = Math.floor(bitLen / 0x100000000);
      const lo = bitLen >>> 0;
      const at = tail.length - 8;
      tail[at] = (hi >>> 24) & 0xff;
      tail[at + 1] = (hi >>> 16) & 0xff;
      tail[at + 2] = (hi >>> 8) & 0xff;
      tail[at + 3] = hi & 0xff;
      tail[at + 4] = (lo >>> 24) & 0xff;
      tail[at + 5] = (lo >>> 16) & 0xff;
      tail[at + 6] = (lo >>> 8) & 0xff;
      tail[at + 7] = lo & 0xff;
      for (let off = 0; off < tail.length; off += 64) this.compress(tail, off);
      this.blockLen = 0;
      this.done = true;
    }
    let out = "";
    for (let i = 0; i < 8; i++) {
      const v = this.h[i];
      out +=
        HEX[(v >>> 24) & 0xff] +
        HEX[(v >>> 16) & 0xff] +
        HEX[(v >>> 8) & 0xff] +
        HEX[v & 0xff];
    }
    return out;
  }

  private compress(p: Uint8Array, off: number): void {
    const w = this.w;
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = ((p[j] << 24) | (p[j + 1] << 16) | (p[j + 2] << 8) | p[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    const h = this.h;
    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];

    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }
}

/** Convenience one-shot, mostly for tests. */
export function sha256Hex(bytes: Uint8Array): string {
  return new Sha256().update(bytes).digestHex();
}
