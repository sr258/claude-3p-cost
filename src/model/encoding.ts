/**
 * Encoding detection and decoding for audit logs. US-1.3 requires UTF-8,
 * UTF-8-with-BOM and UTF-16 to be recognised, in that order (S3 §4.3).
 *
 * Decoding is non-fatal by design (NFR-3): a `TextDecoder` constructed
 * without `{ fatal: true }` never throws on a bad byte sequence, it emits
 * U+FFFD instead. Callers surface that via `hadReplacement` as a
 * "decode-replacement" problem rather than aborting the scan.
 */

export type DetectedEncoding = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be";

/** Byte length sniffed for the BOM-less UTF-16 heuristic. */
const HEURISTIC_SAMPLE_SIZE = 64;

export function detectEncoding(bytes: Uint8Array): DetectedEncoding {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8-bom";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return "utf-16le";
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return "utf-16be";
  }

  // BOM-less UTF-16 heuristic: for ASCII-range text, one code unit's high
  // byte is 0x00 while the other never is. NUL bytes consistently at odd
  // offsets means the low byte comes first → little-endian; consistently at
  // even offsets means the high byte comes first → big-endian.
  const sampleLength = Math.min(HEURISTIC_SAMPLE_SIZE, bytes.length);
  let zeroEven = 0;
  let zeroOdd = 0;
  let nonZeroEven = 0;
  let nonZeroOdd = 0;
  for (let i = 0; i < sampleLength; i += 1) {
    const isEven = i % 2 === 0;
    if (bytes[i] === 0) {
      if (isEven) zeroEven += 1;
      else zeroOdd += 1;
    } else {
      if (isEven) nonZeroEven += 1;
      else nonZeroOdd += 1;
    }
  }
  if (zeroOdd > 0 && nonZeroOdd === 0 && zeroEven === 0) {
    return "utf-16le";
  }
  if (zeroEven > 0 && nonZeroEven === 0 && zeroOdd === 0) {
    return "utf-16be";
  }

  return "utf-8";
}

function decoderLabel(encoding: DetectedEncoding): "utf-8" | "utf-16le" | "utf-16be" {
  return encoding === "utf-8-bom" ? "utf-8" : encoding;
}

export function decodeText(bytes: Uint8Array): {
  text: string;
  encoding: DetectedEncoding;
  hadReplacement: boolean;
} {
  const encoding = detectEncoding(bytes);
  const label = decoderLabel(encoding);
  // A strict decode answers "were there undecodable bytes?" exactly. Scanning
  // the decoded text for U+FFFD cannot: real logs contain that character as
  // ordinary content, and every such file would raise a false
  // "decode-replacement" problem. The throw is caught here and never reaches
  // the caller (NFR-3); the fallback decode is non-fatal and cannot throw.
  try {
    return { text: new TextDecoder(label, { fatal: true }).decode(bytes), encoding, hadReplacement: false };
  } catch {
    return { text: new TextDecoder(label).decode(bytes), encoding, hadReplacement: true };
  }
}

/** Splits on \n, tolerates \r\n and a missing final newline; drops the trailing empty element. */
export function splitLines(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  const parts = text.split("\n");
  if (parts[parts.length - 1] === "") {
    parts.pop();
  }
  return parts.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

export interface LineDecoder {
  /** Complete lines available after this chunk; an incomplete tail is held for the next call. */
  push(chunk: Uint8Array): string[];
  /** Flushes the held tail as a final line, if non-empty. */
  finish(): string[];
  /** null until the first chunk has been pushed. */
  readonly encoding: DetectedEncoding | null;
  readonly hadReplacement: boolean;
}

export function createLineDecoder(): LineDecoder {
  let encoding: DetectedEncoding | null = null;
  let textDecoder: TextDecoder | null = null;
  // Shadow decoder in strict mode. Its output is discarded; it exists only so
  // that `hadReplacement` means "the bytes were undecodable" and not "the text
  // contains U+FFFD", which real logs legitimately do. It is dropped after the
  // first throw \u2014 by then the answer is known.
  let strictDecoder: TextDecoder | null = null;
  let tail = "";
  let hadReplacement = false;

  function checkStrict(chunk: Uint8Array | undefined): void {
    if (strictDecoder === null) {
      return;
    }
    try {
      if (chunk === undefined) {
        strictDecoder.decode();
      } else {
        strictDecoder.decode(chunk, { stream: true });
      }
    } catch {
      hadReplacement = true;
      strictDecoder = null;
    }
  }

  return {
    push(chunk: Uint8Array): string[] {
      if (textDecoder === null) {
        encoding = detectEncoding(chunk);
        textDecoder = new TextDecoder(decoderLabel(encoding));
        strictDecoder = new TextDecoder(decoderLabel(encoding), { fatal: true });
      }
      const text = textDecoder.decode(chunk, { stream: true });
      checkStrict(chunk);
      const combined = tail + text;
      const parts = combined.split("\n");
      tail = parts.pop() ?? "";
      return parts.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
    },
    finish(): string[] {
      if (textDecoder === null) {
        return [];
      }
      const text = textDecoder.decode();
      checkStrict(undefined);
      let combined = tail + text;
      tail = "";
      if (combined.endsWith("\r")) {
        combined = combined.slice(0, -1);
      }
      return combined.length > 0 ? [combined] : [];
    },
    get encoding(): DetectedEncoding | null {
      return encoding;
    },
    get hadReplacement(): boolean {
      return hadReplacement;
    },
  };
}
