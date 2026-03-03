import type { FloorplanData, Point2D } from "../types/floorplan";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isPoint2D = (value: unknown): value is Point2D => {
  if (!value || typeof value !== "object") return false;
  const point = value as Record<string, unknown>;
  return isFiniteNumber(point.x) && isFiniteNumber(point.y);
};

const isIsoDateString = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  return Number.isFinite(Date.parse(value));
};

export const validateFloorplanData = (data: unknown): data is FloorplanData => {
  if (!data || typeof data !== "object") return false;
  const value = data as Record<string, unknown>;

  const meta = value.meta as Record<string, unknown> | undefined;
  if (!meta) return false;
  if (typeof meta.version !== "string" || !/^\d+\.\d+\.\d+$/.test(meta.version)) {
    return false;
  }
  if (!isIsoDateString(meta.createdAt) || !isIsoDateString(meta.updatedAt)) {
    return false;
  }

  if (value.scale !== undefined) {
    const scale = value.scale as Record<string, unknown>;
    if (
      !isFiniteNumber(scale.pixelsPerMeter) ||
      !isFiniteNumber(scale.referenceDistance) ||
      !isFiniteNumber(scale.referencePixels) ||
      scale.pixelsPerMeter <= 0 ||
      scale.referenceDistance <= 0 ||
      scale.referencePixels <= 0
    ) {
      return false;
    }
  }

  if (value.image !== undefined) {
    const image = value.image as Record<string, unknown>;
    if (
      !isFiniteNumber(image.width) ||
      !isFiniteNumber(image.height) ||
      typeof image.filename !== "string"
    ) {
      return false;
    }
  }

  if (
    !Array.isArray(value.walls) ||
    !Array.isArray(value.polygons) ||
    (value.windows !== undefined && !Array.isArray(value.windows)) ||
    (value.furniture !== undefined && !Array.isArray(value.furniture)) ||
    (value.staircaseLinks !== undefined && !Array.isArray(value.staircaseLinks))
  ) {
    return false;
  }

  const wallIds = new Set<string>();
  for (const wall of value.walls) {
    if (!wall || typeof wall !== "object") return false;
    const wallValue = wall as Record<string, unknown>;
    if (typeof wallValue.id !== "string" || wallIds.has(wallValue.id)) return false;
    if (!isPoint2D(wallValue.start) || !isPoint2D(wallValue.end)) return false;
    wallIds.add(wallValue.id);
  }

  const polygonIds = new Set<string>();
  for (const polygon of value.polygons) {
    if (!polygon || typeof polygon !== "object") return false;
    const polygonValue = polygon as Record<string, unknown>;
    if (
      typeof polygonValue.id !== "string" ||
      polygonIds.has(polygonValue.id) ||
      !Array.isArray(polygonValue.vertices) ||
      polygonValue.vertices.length < 3 ||
      typeof polygonValue.closed !== "boolean"
    ) {
      return false;
    }
    if (!polygonValue.vertices.every((vertex) => isPoint2D(vertex))) return false;
    polygonIds.add(polygonValue.id);
  }

  const windowIds = new Set<string>();
  const windows = (value.windows as unknown[] | undefined) ?? [];
  for (const windowOpening of windows) {
    if (!windowOpening || typeof windowOpening !== "object") return false;
    const openingValue = windowOpening as Record<string, unknown>;
    if (
      typeof openingValue.id !== "string" ||
      windowIds.has(openingValue.id) ||
      typeof openingValue.wallId !== "string" ||
      (openingValue.type !== "floor" &&
        openingValue.type !== "normal" &&
        openingValue.type !== "high" &&
        openingValue.type !== "balcony") ||
      !isFiniteNumber(openingValue.startOffset) ||
      !isFiniteNumber(openingValue.endOffset) ||
      !isFiniteNumber(openingValue.width) ||
      !isFiniteNumber(openingValue.sillHeight) ||
      !isFiniteNumber(openingValue.openingHeight)
    ) {
      return false;
    }

    if (
      openingValue.startOffset < 0 ||
      openingValue.endOffset <= openingValue.startOffset ||
      openingValue.width <= 0 ||
      openingValue.sillHeight < 0 ||
      openingValue.openingHeight <= 0
    ) {
      return false;
    }

    windowIds.add(openingValue.id);
  }

  const furnitureIds = new Set<string>();
  const furnitureList = (value.furniture as unknown[] | undefined) ?? [];
  for (const furniture of furnitureList) {
    if (!furniture || typeof furniture !== "object") return false;
    const furnitureValue = furniture as Record<string, unknown>;
    const hasCatalogId = typeof furnitureValue.catalogId === "string";
    const isLegacyBed = furnitureValue.catalogId === undefined && furnitureValue.type === "bed";
    if (
      typeof furnitureValue.id !== "string" ||
      furnitureIds.has(furnitureValue.id) ||
      (!hasCatalogId && !isLegacyBed) ||
      !isPoint2D(furnitureValue.position) ||
      !isFiniteNumber(furnitureValue.rotationDeg) ||
      !isFiniteNumber(furnitureValue.width) ||
      !isFiniteNumber(furnitureValue.depth) ||
      furnitureValue.width <= 0 ||
      furnitureValue.depth <= 0
    ) {
      return false;
    }
    furnitureIds.add(furnitureValue.id);
  }

  if (value.tourStartPoint !== undefined) {
    const tsp = value.tourStartPoint as Record<string, unknown>;
    if (!isPoint2D(tsp.position) || !isFiniteNumber(tsp.angleDeg)) return false;
  }

  return true;
};
