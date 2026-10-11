declare module 'opentype.js' {
  export interface Path {
    toPathData(decimalPlaces?: number): string
  }
  export interface Font {
    unitsPerEm: number
    charToGlyph(char: string): { index: number }
    getAdvanceWidth(text: string, fontSize?: number, options?: { kerning?: boolean }): number
    getPath(
      text: string,
      x: number,
      y: number,
      fontSize?: number,
      options?: { kerning?: boolean }
    ): Path
  }
  export function parse(buffer: ArrayBuffer | Uint8Array, options?: unknown): Font
  const opentype: { parse: typeof parse }
  export default opentype
}