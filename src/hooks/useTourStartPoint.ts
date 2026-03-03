import { useCallback, useState } from "react";
import type { Point2D, TourStartPoint } from "../types/floorplan";

export interface UseTourStartPointReturn {
  point: TourStartPoint | null;
  place: (pos: Point2D, angleDeg?: number) => void;
  updatePosition: (pos: Point2D) => void;
  updateAngle: (angleDeg: number) => void;
  clear: () => void;
  hydrate: (p: TourStartPoint | null | undefined) => void;
}

export function useTourStartPoint(): UseTourStartPointReturn {
  const [point, setPoint] = useState<TourStartPoint | null>(null);

  const place = useCallback((pos: Point2D, angleDeg = 0) => {
    setPoint({ position: pos, angleDeg });
  }, []);

  const updatePosition = useCallback((pos: Point2D) => {
    setPoint((prev) => (prev ? { ...prev, position: pos } : { position: pos, angleDeg: 0 }));
  }, []);

  const updateAngle = useCallback((angleDeg: number) => {
    setPoint((prev) => (prev ? { ...prev, angleDeg } : null));
  }, []);

  const clear = useCallback(() => {
    setPoint(null);
  }, []);

  const hydrate = useCallback((p: TourStartPoint | null | undefined) => {
    setPoint(p ?? null);
  }, []);

  return { point, place, updatePosition, updateAngle, clear, hydrate };
}
