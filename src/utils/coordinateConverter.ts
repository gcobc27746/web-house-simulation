import type { Point2D } from "../types/floorplan";

export const pixelToMeter = (
  pixelX: number,
  pixelY: number,
  pixelsPerMeter: number,
): Point2D => {
  if (pixelsPerMeter <= 0) {
    throw new Error("pixelsPerMeter 必須大於 0");
  }

  return {
    x: pixelX * pixelsPerMeter,
    y: pixelY * pixelsPerMeter,
  };
};

export const meterToPixel = (
  meterX: number,
  meterY: number,
  pixelsPerMeter: number,
): Point2D => {
  if (pixelsPerMeter <= 0) {
    throw new Error("pixelsPerMeter 必須大於 0");
  }

  return {
    x: meterX / pixelsPerMeter,
    y: meterY / pixelsPerMeter,
  };
};
