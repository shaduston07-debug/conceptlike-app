/** Growable big-endian byte writer. */
export class Bytes {
  buf = new Uint8Array(1 << 16);
  len = 0;
  private ensure(n: number) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const nb = new Uint8Array(cap);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
  }
  u8(v: number) { this.ensure(1); this.buf[this.len++] = v & 255; }
  u16(v: number) { this.ensure(2); this.buf[this.len++] = (v >> 8) & 255; this.buf[this.len++] = v & 255; }
  i16(v: number) { this.u16(v < 0 ? v + 65536 : v); }
  u32(v: number) { this.ensure(4); this.buf[this.len++] = (v >>> 24) & 255; this.buf[this.len++] = (v >>> 16) & 255; this.buf[this.len++] = (v >>> 8) & 255; this.buf[this.len++] = v & 255; }
  i32(v: number) { this.u32(v >>> 0); }
  bytes(b: Uint8Array) { this.ensure(b.length); this.buf.set(b, this.len); this.len += b.length; }
  ascii(s: string) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); }
  /** Reserve a 32-bit length slot; returns a function that fills it with bytes written since. */
  lengthSlot(): () => void {
    const at = this.len;
    this.u32(0);
    return () => {
      const n = this.len - at - 4;
      this.buf[at] = (n >>> 24) & 255; this.buf[at + 1] = (n >>> 16) & 255; this.buf[at + 2] = (n >>> 8) & 255; this.buf[at + 3] = n & 255;
    };
  }
  pad(mult: number, from = 0) { while ((this.len - from) % mult) this.u8(0); }
  result(): Uint8Array { return this.buf.slice(0, this.len); }
}
