export interface Point2D {
  x: number;
  y: number;
}

export interface FloorplanMeta {
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface FloorplanScale {
  pixelsPerMeter: number;
  referenceDistance: number;
  referencePixels: number;
}

export interface FloorplanImageInfo {
  width: number;
  height: number;
  filename: string;
}

export interface WallSegment {
  id: string;
  start: Point2D;
  end: Point2D;
}

export interface FloorplanPolygon {
  id: string;
  vertices: Point2D[];
  closed: boolean;
}

export type WindowType = "floor" | "normal" | "high" | "balcony";

export interface WindowOpening {
  id: string;
  wallId: string;
  type: WindowType;
  startOffset: number;
  endOffset: number;
  width: number;
  sillHeight: number;
  openingHeight: number;
}

export interface FloorplanData {
  meta: FloorplanMeta;
  scale?: FloorplanScale;
  image?: FloorplanImageInfo;
  walls: WallSegment[];
  polygons: FloorplanPolygon[];
  windows: WindowOpening[];
}

