import type { FloorplanData } from "../../types/floorplan";
import { buildFloorMesh } from "./buildFloor";
import { buildWallMeshes } from "./buildWalls";
import type { GeometryBuildOptions, GeometryBuildResult } from "./types";
import { validateGeometryInput } from "./validateInput";

export function buildGeometryFromFloorplan(
  data: unknown,
  options: GeometryBuildOptions,
): GeometryBuildResult {
  const validationErrors = validateGeometryInput(data, options);
  if (validationErrors.length > 0) {
    return {
      floorMesh: null,
      wallMeshes: [],
      errors: validationErrors,
    };
  }

  const floorplanData = data as FloorplanData;
  const floorMesh = buildFloorMesh(floorplanData);
  const wallResult = buildWallMeshes(
    floorplanData,
    options.ceilingHeight,
    options.wallThickness,
  );

  return {
    floorMesh,
    wallMeshes: wallResult.wallMeshes,
    errors: wallResult.errors,
  };
}

