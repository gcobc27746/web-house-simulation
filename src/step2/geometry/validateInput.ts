import type { FloorplanData } from "../../types/floorplan";
import { validateFloorplanData } from "../../utils/dataValidator";
import type { GeometryBuildError, GeometryBuildOptions } from "./types";

const MIN_DIMENSION_EPSILON = 1e-6;

export function validateGeometryInput(
  data: unknown,
  options: GeometryBuildOptions,
): GeometryBuildError[] {
  const errors: GeometryBuildError[] = [];

  if (!validateFloorplanData(data)) {
    return [
      {
        code: "INVALID_JSON",
        message: "輸入 JSON 不符合 FloorplanData 結構。",
      },
    ];
  }

  const floorplanData = data as FloorplanData;

  if (!floorplanData.scale) {
    errors.push({
      code: "MISSING_SCALE",
      message: "缺少 scale，無法確認 Step 2 的輸入契約。",
    });
  } else if (floorplanData.scale.pixelsPerMeter <= 0) {
    errors.push({
      code: "INVALID_SCALE",
      message: "scale.pixelsPerMeter 必須大於 0。",
    });
  }

  if (options.ceilingHeight <= 0) {
    errors.push({
      code: "INVALID_CEILING_HEIGHT",
      message: "ceilingHeight 必須大於 0。",
    });
  }

  if (options.wallThickness <= 0) {
    errors.push({
      code: "INVALID_WALL_THICKNESS",
      message: "wallThickness 必須大於 0。",
    });
  }

  for (const polygon of floorplanData.polygons) {
    if (!polygon.closed) {
      errors.push({
        code: "POLYGON_NOT_CLOSED",
        message: `polygon ${polygon.id} 尚未封閉，無法生成地板。`,
        polygonId: polygon.id,
      });
    }
    if (polygon.vertices.length < 3) {
      errors.push({
        code: "POLYGON_TOO_FEW_VERTICES",
        message: `polygon ${polygon.id} 頂點數不足 3 個。`,
        polygonId: polygon.id,
      });
    }
  }

  for (const wall of floorplanData.walls) {
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    if (length <= MIN_DIMENSION_EPSILON) {
      errors.push({
        code: "WALL_ZERO_LENGTH",
        message: `wall ${wall.id} 長度為 0，無法生成牆體。`,
        wallId: wall.id,
      });
    }
  }

  const wallLengthById = new Map<string, number>();
  for (const wall of floorplanData.walls) {
    wallLengthById.set(
      wall.id,
      Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y),
    );
  }

  for (const windowOpening of floorplanData.windows ?? []) {
    const wallLength = wallLengthById.get(windowOpening.wallId);
    if (wallLength === undefined) {
      errors.push({
        code: "WINDOW_WALL_NOT_FOUND",
        message: `window ${windowOpening.id} 對應不到 wall ${windowOpening.wallId}。`,
        wallId: windowOpening.wallId,
        windowId: windowOpening.id,
      });
      continue;
    }

    if (
      windowOpening.startOffset < 0 ||
      windowOpening.endOffset <= windowOpening.startOffset ||
      windowOpening.endOffset > wallLength + MIN_DIMENSION_EPSILON
    ) {
      errors.push({
        code: "WINDOW_OFFSET_OUT_OF_RANGE",
        message: `window ${windowOpening.id} offset 超出牆段 ${windowOpening.wallId} 範圍。`,
        wallId: windowOpening.wallId,
        windowId: windowOpening.id,
      });
    }

    if (windowOpening.sillHeight >= options.ceilingHeight) {
      errors.push({
        code: "WINDOW_SILL_ABOVE_CEILING",
        message: `window ${windowOpening.id} 的窗台高度高於或等於 ceilingHeight。`,
        wallId: windowOpening.wallId,
        windowId: windowOpening.id,
      });
      continue;
    }

    const openingBottom = Math.max(0, windowOpening.sillHeight);
    const openingTop = Math.min(
      options.ceilingHeight,
      windowOpening.sillHeight + windowOpening.openingHeight,
    );
    if (openingTop - openingBottom <= MIN_DIMENSION_EPSILON) {
      errors.push({
        code: "WINDOW_OUTSIDE_WALL_HEIGHT",
        message: `window ${windowOpening.id} 與牆高無有效交集。`,
        wallId: windowOpening.wallId,
        windowId: windowOpening.id,
      });
    }
  }

  return errors;
}

