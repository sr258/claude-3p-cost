import { describe, expect, it } from "vitest";
import { createLineDecoder, decodeText, detectEncoding, splitLines } from "./encoding.js";

const SAMPLE_TEXT = "line one with umlauts äöüß\nline two\n";

function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function withUtf8Bom(text: string): Uint8Array {
  const body = utf8Bytes(text);
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf], 0);
  out.set(body, 3);
  return out;
}

function utf16Bytes(text: string, littleEndian: boolean, withBom: boolean): Uint8Array {
  // Use UTF-16 code units directly (all sample characters are in the BMP).
  const units: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    units.push(text.charCodeAt(i));
  }
  const bomUnits = withBom ? [0xfeff] : [];
  const allUnits = [...bomUnits, ...units];
  const out = new Uint8Array(allUnits.length * 2);
  for (let i = 0; i < allUnits.length; i += 1) {
    const unit = allUnits[i];
    if (littleEndian) {
      out[i * 2] = unit & 0xff;
      out[i * 2 + 1] = (unit >> 8) & 0xff;
    } else {
      out[i * 2] = (unit >> 8) & 0xff;
      out[i * 2 + 1] = unit & 0xff;
    }
  }
  return out;
}

describe("detectEncoding", () => {
  it("detects plain UTF-8", () => {
    expect(detectEncoding(utf8Bytes(SAMPLE_TEXT))).toBe("utf-8");
  });

  it("detects and strips a UTF-8 BOM", () => {
    expect(detectEncoding(withUtf8Bom(SAMPLE_TEXT))).toBe("utf-8-bom");
  });

  it("detects UTF-16LE from its BOM", () => {
    expect(detectEncoding(utf16Bytes(SAMPLE_TEXT, true, true))).toBe("utf-16le");
  });

  it("detects UTF-16BE from its BOM", () => {
    expect(detectEncoding(utf16Bytes(SAMPLE_TEXT, false, true))).toBe("utf-16be");
  });

  it("detects BOM-less UTF-16LE from interleaved NUL bytes", () => {
    const asciiOnly = "plain ascii text for the heuristic";
    expect(detectEncoding(utf16Bytes(asciiOnly, true, false))).toBe("utf-16le");
  });
});

describe("decodeText", () => {
  it("decodes umlauts identically in all four encodings", () => {
    const plain = decodeText(utf8Bytes(SAMPLE_TEXT));
    const bom = decodeText(withUtf8Bom(SAMPLE_TEXT));
    const le = decodeText(utf16Bytes(SAMPLE_TEXT, true, true));
    const be = decodeText(utf16Bytes(SAMPLE_TEXT, false, true));

    expect(plain.text).toBe(SAMPLE_TEXT);
    expect(bom.text).toBe(SAMPLE_TEXT);
    expect(le.text).toBe(SAMPLE_TEXT);
    expect(be.text).toBe(SAMPLE_TEXT);

    expect(plain.encoding).toBe("utf-8");
    expect(bom.encoding).toBe("utf-8-bom");
    expect(le.encoding).toBe("utf-16le");
    expect(be.encoding).toBe("utf-16be");
  });

  it("never throws on an invalid byte sequence and reports hadReplacement", () => {
    const invalid = new Uint8Array([0x41, 0xff, 0xfe, 0x00, 0x42]);
    let result: ReturnType<typeof decodeText> | undefined;
    expect(() => {
      result = decodeText(invalid);
    }).not.toThrow();
    expect(result?.hadReplacement).toBe(true);
  });

  it("does not report hadReplacement for a valid file containing U+FFFD as content", () => {
    // Verified against real logs: valid UTF-8 audit files do carry a literal
    // U+FFFD inside their text. Flagging those as undecodable would raise a
    // false "decode-replacement" problem for the user.
    const withLiteral = utf8Bytes('{"type":"result","note":"�"}\n');
    const result = decodeText(withLiteral);
    expect(result.hadReplacement).toBe(false);
    expect(result.text).toContain("�");
  });
});

describe("splitLines", () => {
  it("splits on LF, CRLF and a missing final newline", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("a\r\nb\r\n")).toEqual(["a", "b"]);
    expect(splitLines("a\nb")).toEqual(["a", "b"]);
    expect(splitLines("")).toEqual([]);
  });
});

describe("LineDecoder", () => {
  it("reassembles a line split across two chunks", () => {
    const decoder = createLineDecoder();
    const first = decoder.push(utf8Bytes("hello wo"));
    const second = decoder.push(utf8Bytes("rld\n"));
    expect(first).toEqual([]);
    expect(second).toEqual(["hello world"]);
  });

  it("reassembles a multi-byte character split across two chunks", () => {
    const decoder = createLineDecoder();
    const fullBytes = utf8Bytes("ä\n"); // 2-byte UTF-8 sequence for ä
    const first = decoder.push(fullBytes.slice(0, 1));
    const second = decoder.push(fullBytes.slice(1));
    expect(first).toEqual([]);
    expect(second).toEqual(["ä"]);
  });

  it("reassembles a CRLF split across two chunks", () => {
    const decoder = createLineDecoder();
    const first = decoder.push(utf8Bytes("line\r"));
    const second = decoder.push(utf8Bytes("\nnext"));
    expect(first).toEqual([]);
    expect(second).toEqual(["line"]);
    expect(decoder.finish()).toEqual(["next"]);
  });

  it("reports hadReplacement only for undecodable bytes, not for U+FFFD content", () => {
    const clean = createLineDecoder();
    clean.push(utf8Bytes('{"note":"�"}\n'));
    clean.finish();
    expect(clean.hadReplacement).toBe(false);

    const broken = createLineDecoder();
    broken.push(new Uint8Array([0x41, 0xc3, 0x28, 0x0a]));
    broken.finish();
    expect(broken.hadReplacement).toBe(true);
  });

  it("flushes a final line without a trailing newline", () => {
    const decoder = createLineDecoder();
    decoder.push(utf8Bytes("only line, no newline"));
    expect(decoder.finish()).toEqual(["only line, no newline"]);
  });
});
