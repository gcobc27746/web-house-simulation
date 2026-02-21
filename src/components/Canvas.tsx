import { useEffect, useMemo, useState } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Line, Stage, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { CurrentWallPreview, WallEndpoint } from "../hooks/useWallDrawing";
import type { FloorplanPolygon, FloorplanScale, Point2D, WallSegment } from "../types/floorplan";
import { meterToPixel, pixelToMeter } from "../utils/coordinateConverter";
import { alignWithShift, findSnapPoint } from "../utils/snapHelper";

interface CanvasProps {
  image: HTMLImageElement | null;
  isCalibrationMode: boolean;
  measurementPoints: Point2D[];
  scale: FloorplanScale | null;
  onAddMeasurementPoint: (point: Point2D) => void;
  isDrawingMode: boolean;
  walls: WallSegment[];
  polygons: FloorplanPolygon[];
  selectedWallId: string | null;
  currentWall: CurrentWallPreview | null;
  onBeginWall: (start: Point2D) => void;
  onUpdateCurrentWall: (end: Point2D) => void;
  onCompleteCurrentWall: (end: Point2D) => void;
  onSelectWall: (id: string | null) => void;
  onMoveWallEndpoint: (wallId: string, endpoint: WallEndpoint, point: Point2D) => void;
}

interface TransformState {
  x: number;
  y: number;
  scale: number;
}

const VIEWPORT = {
  width: 1000,
  height: 640,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function Canvas({
  image,
  isCalibrationMode,
  measurementPoints,
  scale,
  onAddMeasurementPoint,
  isDrawingMode,
  walls,
  polygons,
  selectedWallId,
  currentWall,
  onBeginWall,
  onUpdateCurrentWall,
  onCompleteCurrentWall,
  onSelectWall,
  onMoveWallEndpoint,
}: CanvasProps) {
  const [transform, setTransform] = useState<TransformState>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const [isTabPanning, setIsTabPanning] = useState(false);

  const hasImage = Boolean(image);

  useEffect(() => {
    if (!isDrawingMode) {
      setIsTabPanning(false);
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      setIsTabPanning(true);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      setIsTabPanning(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [isDrawingMode]);

  useEffect(() => {
    if (!image) return;

    const fitScale = Math.min(
      (VIEWPORT.width - 40) / image.width,
      (VIEWPORT.height - 40) / image.height,
      1,
    );

    setTransform({
      scale: fitScale,
      x: (VIEWPORT.width - image.width * fitScale) / 2,
      y: (VIEWPORT.height - image.height * fitScale) / 2,
    });
  }, [image]);

  const imageSizeText = useMemo(() => {
    if (!image) return "尚未載入圖片";
    return `圖片尺寸：${image.width} x ${image.height}px`;
  }, [image]);

  const measurementDistancePx = useMemo(() => {
    if (measurementPoints.length !== 2) return null;
    return Math.hypot(
      measurementPoints[1].x - measurementPoints[0].x,
      measurementPoints[1].y - measurementPoints[0].y,
    );
  }, [measurementPoints]);

  const measurementDistanceMeter = useMemo(() => {
    if (!scale || measurementDistancePx === null) return null;
    return measurementDistancePx * scale.pixelsPerMeter;
  }, [measurementDistancePx, scale]);
  const invariantStrokeWidth = 3 / transform.scale;
  const invariantSelectedStrokeWidth = 4 / transform.scale;
  const invariantEndpointRadius = 5 / transform.scale;

  const pixelWalls = useMemo(() => {
    if (!scale) return [];
    return walls.map((wall) => ({
      ...wall,
      start: meterToPixel(wall.start.x, wall.start.y, scale.pixelsPerMeter),
      end: meterToPixel(wall.end.x, wall.end.y, scale.pixelsPerMeter),
    }));
  }, [scale, walls]);

  const pixelPolygons = useMemo(() => {
    if (!scale) return [];
    return polygons.map((polygon) => ({
      ...polygon,
      vertices: polygon.vertices.map((vertex) =>
        meterToPixel(vertex.x, vertex.y, scale.pixelsPerMeter),
      ),
    }));
  }, [polygons, scale]);

  const previewWallPixels = useMemo(() => {
    if (!currentWall || !scale) return null;
    return {
      start: meterToPixel(currentWall.start.x, currentWall.start.y, scale.pixelsPerMeter),
      end: meterToPixel(currentWall.end.x, currentWall.end.y, scale.pixelsPerMeter),
    };
  }, [currentWall, scale]);

  const onWheel = (event: KonvaEventObject<WheelEvent>) => {
    if (!image) return;
    event.evt.preventDefault();

    const stage = event.target.getStage();
    if (!stage) return;

    if (event.evt.ctrlKey) {
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const oldScale = transform.scale;
      const zoomDelta = event.evt.deltaY > 0 ? 1 / 1.08 : 1.08;
      const newScale = clamp(oldScale * zoomDelta, 0.1, 8);

      const mousePointTo = {
        x: (pointer.x - transform.x) / oldScale,
        y: (pointer.y - transform.y) / oldScale,
      };

      setTransform({
        scale: newScale,
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
      return;
    }

    const panStep = 40;
    const direction = event.evt.deltaY > 0 ? -1 : 1;

    if (event.evt.shiftKey) {
      setTransform((previous) => ({
        ...previous,
        x: previous.x + direction * panStep,
      }));
      return;
    }

    setTransform((previous) => ({
      ...previous,
      y: previous.y + direction * panStep,
    }));
  };

  const stageToImagePoint = (pointer: Point2D): Point2D => ({
    x: (pointer.x - transform.x) / transform.scale,
    y: (pointer.y - transform.y) / transform.scale,
  });

  const isInsideImage = (point: Point2D) =>
    Boolean(
      image &&
        point.x >= 0 &&
        point.y >= 0 &&
        point.x <= image.width &&
        point.y <= image.height,
    );

  const clampToImageBounds = (point: Point2D): Point2D => {
    if (!image) return point;
    return {
      x: clamp(point.x, 0, image.width),
      y: clamp(point.y, 0, image.height),
    };
  };

  const applyDrawingConstraint = (
    point: Point2D,
    shiftPressed: boolean,
    disableSnap: boolean,
  ): Point2D => {
    let nextPoint = point;
    if (shiftPressed && previewWallPixels) {
      nextPoint = alignWithShift(previewWallPixels.start, nextPoint);
    }
    if (!disableSnap) {
      const snapped = findSnapPoint(nextPoint, pixelWalls, 10);
      if (snapped) {
        // 連續繪製時，避免吸附回當前段落起點造成「看似最小距離限制」
        const isCurrentStartPoint =
          previewWallPixels &&
          Math.hypot(
            snapped.x - previewWallPixels.start.x,
            snapped.y - previewWallPixels.start.y,
          ) < 0.0001;
        if (!isCurrentStartPoint) {
          nextPoint = snapped;
        }
      }
    }
    return clampToImageBounds(nextPoint);
  };

  const onStageMouseDown = (event: KonvaEventObject<MouseEvent>) => {
    if (!image) return;
    if (isDrawingMode && isTabPanning) return;

    if (event.evt.button !== 0) return;
    if (
      event.target.hasName("wall-line") ||
      event.target.hasName("wall-endpoint")
    ) {
      return;
    }

    const stage = event.target.getStage();
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const imagePoint = stageToImagePoint(pointer);
    if (!isInsideImage(imagePoint)) return;

    if (isCalibrationMode) {
      onAddMeasurementPoint(imagePoint);
      return;
    }

    if (!isDrawingMode || !scale) return;

    const finalImagePoint = applyDrawingConstraint(
      imagePoint,
      event.evt.shiftKey,
      event.evt.altKey,
    );
    const meterPoint = pixelToMeter(
      finalImagePoint.x,
      finalImagePoint.y,
      scale.pixelsPerMeter,
    );

    if (!currentWall) {
      onBeginWall(meterPoint);
    } else {
      onCompleteWall(meterPoint);
    }
  };

  const onCompleteWall = (meterPoint: Point2D) => {
    onCompleteCurrentWall(meterPoint);
  };

  const onStageMouseMove = (event: KonvaEventObject<MouseEvent>) => {
    if (!image || !isDrawingMode || !scale || !currentWall) return;

    const stage = event.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const imagePoint = stageToImagePoint(pointer);
    const constrainedPoint = applyDrawingConstraint(
      imagePoint,
      event.evt.shiftKey,
      event.evt.altKey,
    );
    if (!isInsideImage(constrainedPoint)) return;

    onUpdateCurrentWall(
      pixelToMeter(constrainedPoint.x, constrainedPoint.y, scale.pixelsPerMeter),
    );
  };

  const measurementLabel = useMemo(() => {
    if (measurementDistancePx === null) return null;
    if (measurementDistanceMeter === null) {
      return `${measurementDistancePx.toFixed(1)}px`;
    }
    return `${measurementDistancePx.toFixed(1)}px = ${measurementDistanceMeter.toFixed(2)}m`;
  }, [measurementDistanceMeter, measurementDistancePx]);

  const labelPosition = useMemo(() => {
    if (measurementPoints.length !== 2) return null;
    return {
      x: (measurementPoints[0].x + measurementPoints[1].x) / 2 + 8,
      y: (measurementPoints[0].y + measurementPoints[1].y) / 2 - 20,
    };
  }, [measurementPoints]);

  return (
    <section className="panel canvas-panel">
      <h2>2D 畫布</h2>
      <p>{imageSizeText}</p>
      <Stage
        width={VIEWPORT.width}
        height={VIEWPORT.height}
        className="stage"
        onWheel={onWheel}
        onMouseDown={onStageMouseDown}
        onMouseMove={onStageMouseMove}
      >
        <Layer>
          {image && (
            <Group
              x={transform.x}
              y={transform.y}
              scaleX={transform.scale}
              scaleY={transform.scale}
              draggable={!isCalibrationMode && (!isDrawingMode || isTabPanning)}
              onDragEnd={(evt) => {
                setTransform((previous) => ({
                  ...previous,
                  x: evt.target.x(),
                  y: evt.target.y(),
                }));
              }}
            >
              <KonvaImage image={image} />
              {pixelPolygons.map((polygon) => (
                <Line
                  key={polygon.id}
                  points={polygon.vertices.flatMap((vertex) => [vertex.x, vertex.y])}
                  closed
                  fill="rgba(51, 113, 255, 0.12)"
                  stroke="#4b8bff"
                  strokeWidth={1}
                  listening={false}
                />
              ))}
              {pixelWalls.map((wall) => {
                const isSelected = selectedWallId === wall.id;
                return (
                  <Group key={wall.id}>
                    <Line
                      name="wall-line"
                      points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
                      stroke={isSelected ? "#ff8a00" : "#3273dc"}
                      strokeWidth={isSelected ? invariantSelectedStrokeWidth : invariantStrokeWidth}
                      strokeScaleEnabled={false}
                      hitStrokeWidth={14 / transform.scale}
                      onMouseDown={(event) => {
                        event.cancelBubble = true;
                        onSelectWall(wall.id);
                      }}
                      onClick={(event) => {
                        event.cancelBubble = true;
                        onSelectWall(wall.id);
                      }}
                    />
                    <Circle
                      name="wall-endpoint"
                      x={wall.start.x}
                      y={wall.start.y}
                      radius={invariantEndpointRadius}
                      fill={isSelected ? "#ff8a00" : "#3273dc"}
                      draggable={isDrawingMode}
                      onDragStart={(event) => {
                        event.cancelBubble = true;
                        onSelectWall(wall.id);
                      }}
                      onDragEnd={(event) => {
                        if (!scale) return;
                        const position = clampToImageBounds({
                          x: event.target.x(),
                          y: event.target.y(),
                        });
                        onMoveWallEndpoint(
                          wall.id,
                          "start",
                          pixelToMeter(position.x, position.y, scale.pixelsPerMeter),
                        );
                      }}
                    />
                    <Circle
                      name="wall-endpoint"
                      x={wall.end.x}
                      y={wall.end.y}
                      radius={invariantEndpointRadius}
                      fill={isSelected ? "#ff8a00" : "#3273dc"}
                      draggable={isDrawingMode}
                      onDragStart={(event) => {
                        event.cancelBubble = true;
                        onSelectWall(wall.id);
                      }}
                      onDragEnd={(event) => {
                        if (!scale) return;
                        const position = clampToImageBounds({
                          x: event.target.x(),
                          y: event.target.y(),
                        });
                        onMoveWallEndpoint(
                          wall.id,
                          "end",
                          pixelToMeter(position.x, position.y, scale.pixelsPerMeter),
                        );
                      }}
                    />
                  </Group>
                );
              })}
              {previewWallPixels && (
                <Line
                  points={[
                    previewWallPixels.start.x,
                    previewWallPixels.start.y,
                    previewWallPixels.end.x,
                    previewWallPixels.end.y,
                  ]}
                  stroke="#22aa66"
                  strokeWidth={2 / transform.scale}
                  strokeScaleEnabled={false}
                  dash={[8, 6]}
                  listening={false}
                />
              )}
              {measurementPoints.length >= 1 && (
                <Circle
                  x={measurementPoints[0].x}
                  y={measurementPoints[0].y}
                  radius={5}
                  fill="#ff3b30"
                />
              )}
              {measurementPoints.length >= 2 && (
                <>
                  <Line
                    points={[
                      measurementPoints[0].x,
                      measurementPoints[0].y,
                      measurementPoints[1].x,
                      measurementPoints[1].y,
                    ]}
                    stroke="#ff3b30"
                    strokeWidth={2}
                  />
                  <Circle
                    x={measurementPoints[1].x}
                    y={measurementPoints[1].y}
                    radius={5}
                    fill="#ff3b30"
                  />
                </>
              )}
              {labelPosition && measurementLabel && (
                <Text
                  x={labelPosition.x}
                  y={labelPosition.y}
                  text={measurementLabel}
                  fill="#ff3b30"
                  fontSize={16}
                  fontStyle="bold"
                />
              )}
            </Group>
          )}
        </Layer>
      </Stage>
      <div className="canvas-hint">
        {hasImage
          ? isCalibrationMode
            ? "校正模式中：請在圖片內點擊兩個量測點。"
            : isDrawingMode
              ? isTabPanning
                ? "Tab 暫時拖曳模式：可拖曳底圖，放開 Tab 回到繪製。"
                : "繪製模式中：點擊起點與終點建立牆段，可拖曳端點調整。按住 Tab 可暫時拖曳底圖，按住 Alt 可暫時取消吸附。"
              : "Ctrl+滾輪可縮放，滾輪可上下拖曳，Shift+滾輪可左右拖曳。"
          : "請先上傳圖片。"}
      </div>
    </section>
  );
}

