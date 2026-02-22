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
export type FurnitureCategory = "bed" | "sofa";
export type FurnitureCatalogId = string;

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

export interface FurnitureItem {
  id: string;
  catalogId: FurnitureCatalogId;
  position: Point2D;
  rotationDeg: number;
  width: number;
  depth: number;
}

export interface FurnitureCatalogItem {
  id: FurnitureCatalogId;
  label: string;
  category: FurnitureCategory;
  tags: string[];
  thumbnailUrl?: string;
  footprint: {
    width: number;
    depth: number;
  };
  model:
    | {
        format: "obj";
        objUrl: string;
        mtlUrl: string;
        sourceSize: {
          width: number;
          depth: number;
          height: number;
        };
        targetHeight: number;
      }
    | {
        format: "dae";
        daeUrl: string;
        sourceSize: {
          width: number;
          depth: number;
          height: number;
        };
        targetHeight: number;
      };
}

export interface FloorplanData {
  meta: FloorplanMeta;
  scale?: FloorplanScale;
  image?: FloorplanImageInfo;
  walls: WallSegment[];
  polygons: FloorplanPolygon[];
  windows: WindowOpening[];
  furniture: FurnitureItem[];
}

