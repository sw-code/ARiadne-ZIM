const hexColorPattern = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;

// Three decimals tell apart every one of the 256 alpha steps.
const alphaFractionDigits = 3;

// Some colour parsers understand `rgba()` but not 8-digit hex.
export function hexColorToRgba(hexColor: string): string {
  if (!hexColorPattern.test(hexColor)) throw new Error(`Not a #RRGGBB or #RRGGBBAA colour: ${hexColor}`);
  const hexDigitsWithAlpha = hexColor.slice(1).padEnd(8, "F");
  const byteAt = (index: number) => parseInt(hexDigitsWithAlpha.slice(2 * index, 2 * index + 2), 16);
  const alphaFraction = Number((byteAt(3) / 255).toFixed(alphaFractionDigits));
  return `rgba(${byteAt(0)}, ${byteAt(1)}, ${byteAt(2)}, ${alphaFraction})`;
}
