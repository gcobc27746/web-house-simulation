import type { FloorplanPolygon, Point2D, WallSegment } from "../types/floorplan";

const EPSILON = 1e-8;
const toKey = (point: Point2D) => `${point.x.toFixed(4)},${point.y.toFixed(4)}`;

const cross = (a: Point2D, b: Point2D, c: Point2D) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const onSegment = (a: Point2D, b: Point2D, c: Point2D) => {
  return (
    Math.min(a.x, b.x) - EPSILON <= c.x &&
    c.x <= Math.max(a.x, b.x) + EPSILON &&
    Math.min(a.y, b.y) - EPSILON <= c.y &&
    c.y <= Math.max(a.y, b.y) + EPSILON
  );
};

const segmentsIntersect = (p1: Point2D, q1: Point2D, p2: Point2D, q2: Point2D) => {
  const o1 = cross(p1, q1, p2);
  const o2 = cross(p1, q1, q2);
  const o3 = cross(p2, q2, p1);
  const o4 = cross(p2, q2, q1);

  if (Math.abs(o1) < EPSILON && onSegment(p1, q1, p2)) return true;
  if (Math.abs(o2) < EPSILON && onSegment(p1, q1, q2)) return true;
  if (Math.abs(o3) < EPSILON && onSegment(p2, q2, p1)) return true;
  if (Math.abs(o4) < EPSILON && onSegment(p2, q2, q1)) return true;

  return o1 * o2 < 0 && o3 * o4 < 0;
};

export const checkSelfIntersection = (vertices: Point2D[]): boolean => {
  if (vertices.length < 4) return false;

  const edges = vertices.map((start, index) => ({
    start,
    end: vertices[(index + 1) % vertices.length],
  }));

  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const isAdjacent =
        j === i ||
        j === (i + 1) % edges.length ||
        i === (j + 1) % edges.length;
      if (isAdjacent) continue;

      if (
        segmentsIntersect(
          edges[i].start,
          edges[i].end,
          edges[j].start,
          edges[j].end,
        )
      ) {
        return true;
      }
    }
  }

  return false;
};

export const detectClosedPolygons = (walls: WallSegment[]): FloorplanPolygon[] => {
  if (walls.length < 3) return [];

  const keyToPoint = new Map<string, Point2D>();
  const adjacency = new Map<string, Set<string>>();

  for (const wall of walls) {
    const startKey = toKey(wall.start);
    const endKey = toKey(wall.end);
    keyToPoint.set(startKey, wall.start);
    keyToPoint.set(endKey, wall.end);

    if (!adjacency.has(startKey)) adjacency.set(startKey, new Set());
    if (!adjacency.has(endKey)) adjacency.set(endKey, new Set());
    adjacency.get(startKey)?.add(endKey);
    adjacency.get(endKey)?.add(startKey);
  }

  const visited = new Set<string>();
  const polygons: FloorplanPolygon[] = [];

  const allKeys = [...adjacency.keys()];
  for (const root of allKeys) {
    if (visited.has(root)) continue;

    const queue = [root];
    const component: string[] = [];
    visited.add(root);

    while (queue.length > 0) {
      const current = queue.shift() as string;
      component.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    if (component.length < 3) continue;
    if (!component.every((key) => (adjacency.get(key)?.size ?? 0) === 2)) continue;

    const startKey = [...component].sort()[0];
    const cycle: string[] = [];
    let previous: string | null = null;
    let current = startKey;

    while (true) {
      cycle.push(current);
      const neighbors = [...(adjacency.get(current) ?? [])];
      const next = neighbors.find((candidate) => candidate !== previous);
      if (!next) break;
      previous = current;
      current = next;
      if (current === startKey) break;
      if (cycle.length > component.length + 1) break;
    }

    if (current !== startKey || cycle.length < 3) continue;
    if (cycle.length !== component.length) continue;

    const vertices = cycle.map((key) => keyToPoint.get(key) as Point2D);
    if (checkSelfIntersection(vertices)) continue;

    polygons.push({
      id: `polygon-${polygons.length + 1}`,
      vertices,
      closed: true,
    });
  }

  return polygons;
};
