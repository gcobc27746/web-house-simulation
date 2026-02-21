import type { Point2D, WallSegment } from "../types/floorplan";

const distanceBetween = (a: Point2D, b: Point2D) => Math.hypot(a.x - b.x, a.y - b.y);

export const findSnapPoint = (
  currentPoint: Point2D,
  existingWalls: WallSegment[],
  threshold = 10,
): Point2D | null => {
  let nearest: Point2D | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const wall of existingWalls) {
    const candidates = [wall.start, wall.end];
    for (const candidate of candidates) {
      const distance = distanceBetween(currentPoint, candidate);
      if (distance <= threshold && distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
  }

  return nearest;
};

export const alignWithShift = (start: Point2D, currentPoint: Point2D): Point2D => {
  const dx = Math.abs(currentPoint.x - start.x);
  const dy = Math.abs(currentPoint.y - start.y);

  if (dx >= dy) {
    return { x: currentPoint.x, y: start.y };
  }

  return { x: start.x, y: currentPoint.y };
};
