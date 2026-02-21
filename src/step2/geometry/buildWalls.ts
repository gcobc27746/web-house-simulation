import * as THREE from "three";
import type { FloorplanData, WallSegment } from "../../types/floorplan";
import type { GeometryBuildError, WallMeshEntry } from "./types";

const MIN_WALL_LENGTH = 1e-6;
const EPSILON = 1e-6;

interface WallOpeningSpan {
  id: string;
  startOffset: number;
  endOffset: number;
  bottom: number;
  top: number;
}

interface VerticalSpan {
  bottom: number;
  top: number;
}

const createWallMaterial = () =>
  new THREE.MeshStandardMaterial({
    color: 0xe8edf7,
    roughness: 0.75,
    metalness: 0.05,
  });

function uniqueSorted(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const deduped: number[] = [];
  for (const value of sorted) {
    if (deduped.length === 0 || Math.abs(value - deduped[deduped.length - 1]) > EPSILON) {
      deduped.push(value);
    }
  }
  return deduped;
}

function subtractVerticalOpening(spans: VerticalSpan[], opening: VerticalSpan): VerticalSpan[] {
  const next: VerticalSpan[] = [];
  for (const span of spans) {
    if (opening.top <= span.bottom + EPSILON || opening.bottom >= span.top - EPSILON) {
      next.push(span);
      continue;
    }
    if (opening.bottom > span.bottom + EPSILON) {
      next.push({ bottom: span.bottom, top: opening.bottom });
    }
    if (opening.top < span.top - EPSILON) {
      next.push({ bottom: opening.top, top: span.top });
    }
  }
  return next;
}

function collectSolidVerticalSpans(
  openings: WallOpeningSpan[],
  ceilingHeight: number,
): VerticalSpan[] {
  let spans: VerticalSpan[] = [{ bottom: 0, top: ceilingHeight }];
  for (const opening of openings) {
    spans = subtractVerticalOpening(spans, { bottom: opening.bottom, top: opening.top });
    if (spans.length === 0) return [];
  }
  return spans.filter((span) => span.top - span.bottom > EPSILON);
}

function classifySegmentType(span: VerticalSpan, ceilingHeight: number, hasOpening: boolean) {
  if (!hasOpening) return "full";
  const touchesBottom = span.bottom <= EPSILON;
  const touchesTop = span.top >= ceilingHeight - EPSILON;
  if (touchesBottom && !touchesTop) return "lower";
  if (touchesTop && !touchesBottom) return "upper";
  if (touchesBottom && touchesTop) return "full";
  return "middle";
}

function createWallMesh(
  wall: WallSegment,
  segmentStartOffset: number,
  segmentEndOffset: number,
  bottomHeight: number,
  topHeight: number,
  wallThickness: number,
  metadata: {
    segmentType: string;
    windowIds: string[];
    segmentIndex: number;
  },
): THREE.Mesh {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const wallLength = Math.hypot(dx, dy);
  const segmentLength = segmentEndOffset - segmentStartOffset;
  const segmentHeight = topHeight - bottomHeight;
  const ux = dx / wallLength;
  const uz = dy / wallLength;
  const centerOffset = (segmentStartOffset + segmentEndOffset) / 2;

  const geometry = new THREE.BoxGeometry(segmentLength, segmentHeight, wallThickness);
  const material = createWallMaterial();

  const mesh = new THREE.Mesh(geometry, material);
  const centerX = wall.start.x + ux * centerOffset;
  const centerZ = wall.start.y + uz * centerOffset;
  const yaw = Math.atan2(dy, dx);

  mesh.position.set(centerX, bottomHeight + segmentHeight / 2, centerZ);
  mesh.rotation.y = yaw;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `wall-${wall.id}-${metadata.segmentIndex}`;
  mesh.userData.wallId = wall.id;
  mesh.userData.segmentType = metadata.segmentType;
  mesh.userData.windowIds = metadata.windowIds;
  mesh.userData.startOffset = segmentStartOffset;
  mesh.userData.endOffset = segmentEndOffset;
  mesh.userData.bottomHeight = bottomHeight;
  mesh.userData.topHeight = topHeight;
  return mesh;
}

export function buildWallMeshes(
  data: FloorplanData,
  ceilingHeight: number,
  wallThickness: number,
): { wallMeshes: WallMeshEntry[]; errors: GeometryBuildError[] } {
  const wallMeshes: WallMeshEntry[] = [];
  const errors: GeometryBuildError[] = [];
  const wallById = new Map<string, WallSegment>();

  for (const wall of data.walls) {
    wallById.set(wall.id, wall);
  }

  const openingsByWall = new Map<string, WallOpeningSpan[]>();
  for (const windowOpening of data.windows ?? []) {
    const wall = wallById.get(windowOpening.wallId);
    if (!wall) {
      errors.push({
        code: "WINDOW_WALL_NOT_FOUND",
        message: `window ${windowOpening.id} 對應不到 wall ${windowOpening.wallId}，已略過。`,
        wallId: windowOpening.wallId,
        windowId: windowOpening.id,
      });
      continue;
    }

    const wallLength = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    const clampedStart = Math.max(0, Math.min(windowOpening.startOffset, wallLength));
    const clampedEnd = Math.max(0, Math.min(windowOpening.endOffset, wallLength));
    if (clampedEnd - clampedStart <= EPSILON) {
      errors.push({
        code: "WINDOW_INVALID_WIDTH",
        message: `window ${windowOpening.id} 寬度為 0，已略過。`,
        wallId: windowOpening.wallId,
        windowId: windowOpening.id,
      });
      continue;
    }

    const openingBottom = Math.max(0, windowOpening.sillHeight);
    const openingTop = Math.min(
      ceilingHeight,
      windowOpening.sillHeight + windowOpening.openingHeight,
    );
    if (openingTop - openingBottom <= EPSILON) {
      errors.push({
        code: "WINDOW_OUTSIDE_WALL_HEIGHT",
        message: `window ${windowOpening.id} 與牆高無有效交集，已略過。`,
        wallId: windowOpening.wallId,
        windowId: windowOpening.id,
      });
      continue;
    }

    const openings = openingsByWall.get(windowOpening.wallId) ?? [];
    openings.push({
      id: windowOpening.id,
      startOffset: clampedStart,
      endOffset: clampedEnd,
      bottom: openingBottom,
      top: openingTop,
    });
    openingsByWall.set(windowOpening.wallId, openings);
  }

  for (const wall of data.walls) {
    const wallLength = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    if (wallLength <= MIN_WALL_LENGTH) {
      errors.push({
        code: "WALL_ZERO_LENGTH",
        message: `wall ${wall.id} 長度為 0，已略過。`,
        wallId: wall.id,
      });
      continue;
    }

    const openings = (openingsByWall.get(wall.id) ?? []).sort(
      (a, b) => a.startOffset - b.startOffset,
    );
    const boundaries = uniqueSorted([
      0,
      wallLength,
      ...openings.flatMap((opening) => [opening.startOffset, opening.endOffset]),
    ]);

    let segmentIndex = 0;
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const segmentStart = boundaries[index];
      const segmentEnd = boundaries[index + 1];
      if (segmentEnd - segmentStart <= EPSILON) {
        continue;
      }

      const coveringOpenings = openings.filter(
        (opening) =>
          opening.startOffset < segmentEnd - EPSILON &&
          opening.endOffset > segmentStart + EPSILON,
      );

      const verticalSpans = collectSolidVerticalSpans(coveringOpenings, ceilingHeight);
      for (const span of verticalSpans) {
        segmentIndex += 1;
        wallMeshes.push({
          wallId: wall.id,
          mesh: createWallMesh(wall, segmentStart, segmentEnd, span.bottom, span.top, wallThickness, {
            segmentType: classifySegmentType(span, ceilingHeight, coveringOpenings.length > 0),
            windowIds: coveringOpenings.map((opening) => opening.id),
            segmentIndex,
          }),
        });
      }
    }
  }

  return { wallMeshes, errors };
}

