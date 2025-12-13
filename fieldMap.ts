// fieldMap.ts
export type FieldSpec = {
  pageIndex: number;     // 0-based
  x: number;             // points
  y: number;             // points
  width?: number;        // for auto-fit / alignment
  height?: number;       // optional (useful for clearing)
  fontSize?: number;
  lineHeight?: number;
  align?: "left" | "center" | "right";
  maxFontSize?: number;  // optional for auto-fit
  minFontSize?: number;  // optional for auto-fit
  clearBackground?: boolean; // draw a white rect before text
};

export type FieldMap = Record<string, FieldSpec>;

export const fieldMap: FieldMap = {
  fullName: { pageIndex: 0, x: 90, y: 650, width: 300, fontSize: 12, clearBackground: true },
  idNumber:  { pageIndex: 0, x: 420, y: 650, width: 120, fontSize: 12, clearBackground: true },
  address:   { pageIndex: 0, x: 90, y: 610, width: 450, fontSize: 11, clearBackground: true },
};
