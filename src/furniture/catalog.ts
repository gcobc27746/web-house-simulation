import type { FurnitureCatalogId, FurnitureCatalogItem } from "../types/floorplan";

export const FURNITURE_CATALOG_ITEMS: FurnitureCatalogItem[] = [
  {
    id: "bed-fullsize-black-v1",
    label: "雙人床（黑框白床單）",
    category: "bed",
    tags: ["bed", "double", "black", "full"],
    footprint: {
      width: 1.48795,
      depth: 1.990772,
    },
    model: {
      format: "obj",
      objUrl: new URL(
        "../../resources/furniture/Full_Size_Bed_with_White_Sheets_Black_V13f32ae55-d026-44a9-9117-2d1f73349584/Full_Size_Bed_with_White_Sheets_Black_V1.obj",
        import.meta.url,
      ).href,
      mtlUrl: new URL(
        "../../resources/furniture/Full_Size_Bed_with_White_Sheets_Black_V13f32ae55-d026-44a9-9117-2d1f73349584/Full_Size_Bed_with_White_Sheets_Black_V1.mtl",
        import.meta.url,
      ).href,
      sourceSize: {
        width: 148.795,
        depth: 199.0772,
        height: 91.6628,
      },
      targetHeight: 0.916628,
    },
  },
  {
    id: "bed-dae-sketchup",
    label: "床組（DAE）",
    category: "bed",
    tags: ["bed", "dae", "sketchup"],
    footprint: {
      width: 1.8,
      depth: 2.1,
    },
    model: {
      format: "dae",
      daeUrl: new URL(
        "../../resources/furniture/Bed/model.dae",
        import.meta.url,
      ).href,
      sourceSize: {
        // DAE horizontal axes appear swapped in current scene mapping; swap width/depth here.
        width: 2.4,
        depth: 3.35,
        height: 1.1,
      },
      targetHeight: 1.0,
    },
  },
  {
    id: "bed-master-king-v1",
    label: "主臥特大床",
    category: "bed",
    tags: ["bed", "king", "master"],
    footprint: {
      width: 1.749111,
      depth: 2.257704,
    },
    model: {
      format: "obj",
      objUrl: new URL(
        "../../resources/furniture/Master_Bed_King_Size_v2_L3.123c2c3402e1-59e4-4616-8293-84b4be90632f/10236_Master_Bed_King_Size_v1_L3b.obj",
        import.meta.url,
      ).href,
      mtlUrl: new URL(
        "../../resources/furniture/Master_Bed_King_Size_v2_L3.123c2c3402e1-59e4-4616-8293-84b4be90632f/10236_Master_Bed_King_Size_v1_L3b.mtl",
        import.meta.url,
      ).href,
      sourceSize: {
        width: 174.9111,
        depth: 225.7704,
        height: 118.9435,
      },
      targetHeight: 1.189435,
    },
  },
  {
    id: "sofa-couch-set-iridesium",
    label: "L 型沙發組",
    category: "sofa",
    tags: ["sofa", "couch", "living-room", "l-shape"],
    thumbnailUrl: new URL(
      "../../resources/furniture/Couch Set Iridesium/Couch Set A.png",
      import.meta.url,
    ).href,
    footprint: {
      width: 3.01,
      depth: 4.11,
    },
    model: {
      format: "obj",
      objUrl: new URL(
        "../../resources/furniture/Couch Set Iridesium/Couch Set.obj",
        import.meta.url,
      ).href,
      mtlUrl: new URL(
        "../../resources/furniture/Couch Set Iridesium/Couch Set.mtl",
        import.meta.url,
      ).href,
      sourceSize: {
        width: 8.197899,
        depth: 11.190243,
        height: 2.313451,
      },
      targetHeight: 0.85,
    },
  },
];

export const FURNITURE_CATALOG: Record<FurnitureCatalogId, FurnitureCatalogItem> =
  FURNITURE_CATALOG_ITEMS.reduce<Record<FurnitureCatalogId, FurnitureCatalogItem>>(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {},
  );

export const getFurnitureCatalogItem = (catalogId: FurnitureCatalogId) =>
  FURNITURE_CATALOG[catalogId] ?? null;
