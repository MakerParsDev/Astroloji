const encoder = new TextEncoder();

function xorCompare(expected: Uint8Array, actual: Uint8Array): boolean {
  let mismatch = expected.length ^ actual.length;
  const length = Math.max(expected.length, actual.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (expected[index] ?? 0) ^ (actual[index] ?? 0);
  }
  return mismatch === 0;
}

export function timingSafeEqualStrings(expected: string, actual: string): boolean {
  const expectedBytes = encoder.encode(expected);
  const actualBytes = encoder.encode(actual);
  const subtle = crypto?.subtle as SubtleCrypto & {
    timingSafeEqual?: (left: BufferSource, right: BufferSource) => boolean;
  };

  if (
    subtle?.timingSafeEqual &&
    expectedBytes.byteLength === actualBytes.byteLength
  ) {
    return subtle.timingSafeEqual(expectedBytes, actualBytes);
  }

  return xorCompare(expectedBytes, actualBytes);
}

export function matchesSecret(expected: string, actual: string | null | undefined): boolean {
  if (!expected || !actual) {
    return false;
  }

  return timingSafeEqualStrings(expected, actual);
}
