import { useState } from "react";
import type { FloorplanScale, Point2D } from "../types/floorplan";

const calculatePixelDistance = (start: Point2D, end: Point2D): number =>
  Math.hypot(end.x - start.x, end.y - start.y);

export function useScaleCalibration() {
  const [isCalibrationMode, setIsCalibrationMode] = useState(false);
  const [measurementPoints, setMeasurementPoints] = useState<Point2D[]>([]);
  const [scale, setScale] = useState<FloorplanScale | null>(null);

  const startCalibration = () => {
    setIsCalibrationMode(true);
    setMeasurementPoints([]);
  };

  const addMeasurementPoint = (point: Point2D) => {
    setMeasurementPoints((previous) => {
      if (previous.length >= 2) return previous;
      return [...previous, point];
    });
  };

  const calculateScale = (realDistance: number): FloorplanScale | null => {
    if (realDistance <= 0 || measurementPoints.length !== 2) {
      return null;
    }

    const [start, end] = measurementPoints;
    const referencePixels = calculatePixelDistance(start, end);

    if (referencePixels <= 0) {
      return null;
    }

    const nextScale: FloorplanScale = {
      pixelsPerMeter: realDistance / referencePixels,
      referenceDistance: realDistance,
      referencePixels,
    };

    setScale(nextScale);
    setIsCalibrationMode(false);
    return nextScale;
  };

  const clearMeasurement = () => {
    setMeasurementPoints([]);
  };

  const stopCalibrationMode = () => {
    setIsCalibrationMode(false);
    setMeasurementPoints([]);
  };

  const resetCalibration = () => {
    setIsCalibrationMode(false);
    setMeasurementPoints([]);
    setScale(null);
  };

  const hydrateScale = (nextScale: FloorplanScale | null) => {
    setIsCalibrationMode(false);
    setMeasurementPoints([]);
    setScale(nextScale);
  };

  return {
    isCalibrationMode,
    measurementPoints,
    scale,
    startCalibration,
    addMeasurementPoint,
    calculateScale,
    clearMeasurement,
    stopCalibrationMode,
    hydrateScale,
    resetCalibration,
  };
}
