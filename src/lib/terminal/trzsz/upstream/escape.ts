export function escapeCharsToCodes(escapeChars: string[][]): number[][] {
  return escapeChars.map((escapeChar) => [
    escapeChar[0].charCodeAt(0),
    escapeChar[1].charCodeAt(0),
    escapeChar[1].charCodeAt(1),
  ]);
}

export function escapeData(data: Uint8Array, escapeCodes: number[][]): Uint8Array {
  if (escapeCodes.length === 0) {
    return data;
  }

  const buffer = new Uint8Array(data.length * 2);
  let index = 0;
  for (const value of data) {
    const escapeIndex = escapeCodes.findIndex((escapeCode) => value === escapeCode[0]);
    if (escapeIndex < 0) {
      buffer[index] = value;
      index += 1;
      continue;
    }

    buffer[index] = escapeCodes[escapeIndex][1];
    buffer[index + 1] = escapeCodes[escapeIndex][2];
    index += 2;
  }

  return buffer.subarray(0, index);
}

export function unescapeData(data: Uint8Array, escapeCodes: number[][]): Uint8Array {
  if (escapeCodes.length === 0) {
    return data;
  }

  const buffer = new Uint8Array(data.length);
  let index = 0;
  for (let sourceIndex = 0; sourceIndex < data.length; sourceIndex += 1) {
    const escapeIndex = sourceIndex < data.length - 1
      ? escapeCodes.findIndex(
          (escapeCode) => data[sourceIndex] === escapeCode[1] && data[sourceIndex + 1] === escapeCode[2],
        )
      : -1;

    if (escapeIndex < 0) {
      buffer[index] = data[sourceIndex];
      index += 1;
      continue;
    }

    buffer[index] = escapeCodes[escapeIndex][0];
    index += 1;
    sourceIndex += 1;
  }

  return buffer.subarray(0, index);
}