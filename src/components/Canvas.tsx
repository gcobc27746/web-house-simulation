import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { CurrentWallPreview, WallEndpoint } from "../hooks/useWallDrawing";
import type {
  FurnitureItem,
  FloorplanPolygon,
  FloorplanScale,
  Point2D,
  StaircaseLinkItem,
  TourStartPoint,
  WallSegment,
  WindowOpening,
  WindowType,
} from "../types/floorplan";
import { getFurnitureCatalogItem } from "../furniture/catalog";
import { meterToPixel, pixelToMeter } from "../utils/coordinateConverter";
import { alignWithShift, findSnapPoint } from "../utils/snapHelper";

interface CanvasProps {
  image: HTMLImageElement | null;
  layerVisibility?: {
    image: boolean;
    walls: boolean;
    windows: boolean;
    furniture: boolean;
  };
  enableSnapping?: boolean;
  showHintBar?: boolean;
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
  isWindowMode: boolean;
  windows: WindowOpening[];
  selectedWindowId: string | null;
  selectedWindowType: WindowType;
  onAddWindowByOffsets: (wallId: string, startOffset: number, endOffset: number) => void;
  onSelectWindow: (id: string | null) => void;
  furniture: FurnitureItem[];
  selectedFurnitureId: string | null;
  onSelectFurniture: (id: string | null) => void;
  onMoveFurniture: (id: string, position: Point2D) => void;
  staircaseLinks?: StaircaseLinkItem[];
  selectedStaircaseLinkId?: string | null;
  pendingLinkA?: Point2D | null;
  isStaircaseLinkMode?: boolean;
  onStaircaseLinkClick?: (worldPoint: Point2D) => void;
  onSelectStaircaseLink?: (id: string | null) => void;
  onMoveStaircaseLinkPoint?: (id: string, end: "a" | "b", worldPoint: Point2D) => void;
  onUpdateStaircaseLinkAngle?: (id: string, end: "a" | "b", angleDeg: number) => void;
  tourStartPoint?: TourStartPoint | null;
  isTourMode?: boolean;
  onSetTourStart?: (pos: Point2D, angleDeg?: number) => void;
  onMoveTourStart?: (pos: Point2D) => void;
  onUpdateTourAngle?: (angleDeg: number) => void;
  className?: string;
  onCanvasStatusChange?: (status: {
    cursor: Point2D | null;
    zoomPercent: number;
  }) => void;
}

interface TransformState {
  x: number;
  y: number;
  scale: number;
}

const BASE_VIEWPORT = {
  width: 1000,
  height: 640,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function Canvas({
  image,
  layerVisibility = {
    image: true,
    walls: true,
    windows: true,
    furniture: true,
  },
  enableSnapping = true,
  showHintBar = true,
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
  isWindowMode,
  windows,
  selectedWindowId,
  selectedWindowType,
  onAddWindowByOffsets,
  onSelectWindow,
  furniture,
  selectedFurnitureId,
  onSelectFurniture,
  onMoveFurniture,
  staircaseLinks = [],
  selectedStaircaseLinkId = null,
  pendingLinkA = null,
  isStaircaseLinkMode = false,
  onStaircaseLinkClick,
  onSelectStaircaseLink,
  onMoveStaircaseLinkPoint,
  onUpdateStaircaseLinkAngle,
  tourStartPoint,
  isTourMode = false,
  onSetTourStart,
  onMoveTourStart,
  onUpdateTourAngle,
  className,
  onCanvasStatusChange,
}: CanvasProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const stageWrapRef = useRef<HTMLDivElement | null>(null);
  const lastTouchesRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const tapStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const [transform, setTransform] = useState<TransformState>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const [viewport, setViewport] = useState({
    width: BASE_VIEWPORT.width,
    height: BASE_VIEWPORT.height,
  });
  const [isTabPanning, setIsTabPanning] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const [windowSelection, setWindowSelection] = useState<{
    start: Point2D;
    end: Point2D;
  } | null>(null);

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
    const stageWrap = stageWrapRef.current;
    if (!stageWrap) return;

    const updateViewport = () => {
      const width = Math.max(320, stageWrap.clientWidth);
      const height = Math.max(320, stageWrap.clientHeight);
      setViewport((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };

    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(stageWrap);
    return () => observer.disconnect();
  }, []);

  // Prevent browser native pinch-zoom on iOS Safari so our custom handler takes over
  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    const prevent = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    el.addEventListener("touchmove", prevent, { passive: false });
    return () => el.removeEventListener("touchmove", prevent);
  }, []);

  useEffect(() => {
    if (!image) return;

    const fitScale = Math.min(
      (viewport.width - 40) / image.width,
      (viewport.height - 40) / image.height,
      1,
    );

    setTransform({
      scale: fitScale,
      x: (viewport.width - image.width * fitScale) / 2,
      y: (viewport.height - image.height * fitScale) / 2,
    });
  }, [image, viewport.height, viewport.width]);

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

  useEffect(() => {
    if (!onCanvasStatusChange) return;
    onCanvasStatusChange({
      cursor: null,
      zoomPercent: Math.round(transform.scale * 100),
    });
  }, [onCanvasStatusChange, transform.scale]);
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

  const wallById = useMemo(() => {
    const map = new Map<string, WallSegment>();
    for (const wall of walls) map.set(wall.id, wall);
    return map;
  }, [walls]);

  const pixelWallById = useMemo(() => {
    const map = new Map<string, (typeof pixelWalls)[number]>();
    for (const wall of pixelWalls) map.set(wall.id, wall);
    return map;
  }, [pixelWalls]);

  const getWindowColor = (type: WindowType) => {
    if (type === "floor") return "#8e44ff";
    if (type === "high") return "#ff5f5f";
    if (type === "balcony") return "#00a0ff";
    return "#00a36c";
  };

  const getPointOnWallByOffset = (
    wall: WallSegment,
    wallPixel: { start: Point2D; end: Point2D },
    offset: number,
  ): Point2D | null => {
    const wallLength = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    if (wallLength <= 0) return null;
    const ratio = clamp(offset / wallLength, 0, 1);
    return {
      x: wallPixel.start.x + (wallPixel.end.x - wallPixel.start.x) * ratio,
      y: wallPixel.start.y + (wallPixel.end.y - wallPixel.start.y) * ratio,
    };
  };

  const windowSegments = useMemo(() => {
    const segments: Array<{
      id: string;
      type: WindowType;
      start: Point2D;
      end: Point2D;
      selected: boolean;
    }> = [];

    for (const windowOpening of windows) {
      const wall = wallById.get(windowOpening.wallId);
      const wallPixel = pixelWallById.get(windowOpening.wallId);
      if (!wall || !wallPixel) continue;
      const start = getPointOnWallByOffset(wall, wallPixel, windowOpening.startOffset);
      const end = getPointOnWallByOffset(wall, wallPixel, windowOpening.endOffset);
      if (!start || !end) continue;
      segments.push({
        id: windowOpening.id,
        type: windowOpening.type,
        start,
        end,
        selected: selectedWindowId === windowOpening.id,
      });
    }

    return segments;
  }, [pixelWallById, selectedWindowId, wallById, windows]);

  const selectionRect = useMemo(() => {
    if (!windowSelection) return null;
    const x = Math.min(windowSelection.start.x, windowSelection.end.x);
    const y = Math.min(windowSelection.start.y, windowSelection.end.y);
    const width = Math.abs(windowSelection.end.x - windowSelection.start.x);
    const height = Math.abs(windowSelection.end.y - windowSelection.start.y);
    return { x, y, width, height };
  }, [windowSelection]);

  const pixelFurniture = useMemo(() => {
    if (!scale) return [];
    return furniture.map((item) => {
      const catalog = getFurnitureCatalogItem(item.catalogId);
      const width = item.width > 0 ? item.width : (catalog?.footprint.width ?? 1);
      const depth = item.depth > 0 ? item.depth : (catalog?.footprint.depth ?? 1);
      return {
        ...item,
        center: meterToPixel(item.position.x, item.position.y, scale.pixelsPerMeter),
        widthPx: width / scale.pixelsPerMeter,
        depthPx: depth / scale.pixelsPerMeter,
        selected: selectedFurnitureId === item.id,
      };
    });
  }, [furniture, scale, selectedFurnitureId]);

  const LINK_COLORS = ["#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#f59e0b"];

  const pixelStaircaseLinks = useMemo(() => {
    if (!scale) return [];
    return staircaseLinks.map((link, idx) => ({
      ...link,
      pixelA: meterToPixel(link.positionA.x, link.positionA.y, scale.pixelsPerMeter),
      pixelB: meterToPixel(link.positionB.x, link.positionB.y, scale.pixelsPerMeter),
      color: LINK_COLORS[idx % LINK_COLORS.length],
      selected: selectedStaircaseLinkId === link.id,
    }));
  }, [staircaseLinks, scale, selectedStaircaseLinkId]);

  const pixelPendingA = useMemo(() => {
    if (!scale || !pendingLinkA) return null;
    return meterToPixel(pendingLinkA.x, pendingLinkA.y, scale.pixelsPerMeter);
  }, [pendingLinkA, scale]);

  const pixelTourStart = useMemo(() => {
    if (!scale || !tourStartPoint) return null;
    return meterToPixel(tourStartPoint.position.x, tourStartPoint.position.y, scale.pixelsPerMeter);
  }, [tourStartPoint, scale]);

  const clipSegmentWithRect = (
    start: Point2D,
    end: Point2D,
    rect: { x: number; y: number; width: number; height: number },
  ): { t0: number; t1: number } | null => {
    const xMin = rect.x;
    const xMax = rect.x + rect.width;
    const yMin = rect.y;
    const yMax = rect.y + rect.height;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let t0 = 0;
    let t1 = 1;

    const clip = (p: number, q: number): boolean => {
      if (p === 0) return q >= 0;
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    };

    if (!clip(-dx, start.x - xMin)) return null;
    if (!clip(dx, xMax - start.x)) return null;
    if (!clip(-dy, start.y - yMin)) return null;
    if (!clip(dy, yMax - start.y)) return null;

    if (t1 <= t0) return null;
    return { t0, t1 };
  };

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

  const onStageTouchStart = (e: KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length === 2) {
      const t = e.evt.touches;
      lastTouchesRef.current = {
        x1: t[0].clientX, y1: t[0].clientY,
        x2: t[1].clientX, y2: t[1].clientY,
      };
      setIsPinching(true);
      tapStartPosRef.current = null; // two-finger gesture, not a tap
      if (isWindowMode) setWindowSelection(null); // cancel window drag on pinch
    } else if (e.evt.touches.length === 1) {
      const stage = e.target.getStage();
      const pointer = stage?.getPointerPosition();
      if (isWindowMode && image && pointer) {
        // Window mode: start drag-to-select (mirrors onStageMouseDown window branch)
        const imagePoint = stageToImagePoint(pointer);
        if (isInsideImage(imagePoint)) {
          onSelectWall(null);
          onSelectFurniture(null);
          setWindowSelection({ start: imagePoint, end: imagePoint });
        }
        tapStartPosRef.current = null; // drag mode, not a tap
      } else {
        tapStartPosRef.current = pointer ?? null;
      }
    }
  };

  const onStageTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    if (!image) return;
    const touches = e.evt.touches;

    // Window mode: single-finger drag updates the selection rectangle
    if (touches.length === 1 && isWindowMode && windowSelection) {
      const stage = e.target.getStage();
      const pointer = stage?.getPointerPosition();
      if (pointer) {
        setWindowSelection((prev) =>
          prev ? { ...prev, end: clampToImageBounds(stageToImagePoint(pointer)) } : prev,
        );
      }
      return;
    }

    // If the single finger moved significantly, it's a drag — cancel tap intent
    if (touches.length === 1 && tapStartPosRef.current) {
      const stage = e.target.getStage();
      const cur = stage?.getPointerPosition();
      if (cur && Math.hypot(cur.x - tapStartPosRef.current.x, cur.y - tapStartPosRef.current.y) > 10) {
        tapStartPosRef.current = null;
      }
    }

    if (touches.length !== 2) {
      lastTouchesRef.current = null;
      return;
    }

    const t0 = touches[0];
    const t1 = touches[1];
    const prev = lastTouchesRef.current;

    if (!prev) {
      lastTouchesRef.current = { x1: t0.clientX, y1: t0.clientY, x2: t1.clientX, y2: t1.clientY };
      return;
    }

    const prevDist = Math.hypot(prev.x2 - prev.x1, prev.y2 - prev.y1);
    const newDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    if (prevDist < 1) return;

    const stage = e.target.getStage();
    if (!stage) return;
    const rect = stage.container().getBoundingClientRect();

    const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
    const midY = (t0.clientY + t1.clientY) / 2 - rect.top;
    const prevMidX = (prev.x1 + prev.x2) / 2 - rect.left;
    const prevMidY = (prev.y1 + prev.y2) / 2 - rect.top;
    const scaleFactor = newDist / prevDist;

    setTransform((cur) => {
      const newScale = clamp(cur.scale * scaleFactor, 0.05, 8);
      const ratio = newScale / cur.scale;
      return {
        scale: newScale,
        x: midX - (midX - cur.x) * ratio + (midX - prevMidX),
        y: midY - (midY - cur.y) * ratio + (midY - prevMidY),
      };
    });

    lastTouchesRef.current = { x1: t0.clientX, y1: t0.clientY, x2: t1.clientX, y2: t1.clientY };
  };

  const onStageTouchEnd = (e: KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2) {
      lastTouchesRef.current = null;
      setIsPinching(false);
    }

    if (e.evt.touches.length !== 0) return;

    // Window mode: finalize the drag-select (mirrors onStageMouseUp logic)
    if (isWindowMode && windowSelection && selectionRect) {
      if (selectionRect.width >= 2 && selectionRect.height >= 2) {
        for (const wall of pixelWalls) {
          const clipped = clipSegmentWithRect(wall.start, wall.end, selectionRect);
          if (!clipped) continue;
          const sourceWall = wallById.get(wall.id);
          if (!sourceWall) continue;
          const wallLength = Math.hypot(
            sourceWall.end.x - sourceWall.start.x,
            sourceWall.end.y - sourceWall.start.y,
          );
          if (wallLength <= 0) continue;
          const startOffset = wallLength * clipped.t0;
          const endOffset = wallLength * clipped.t1;
          if (endOffset - startOffset < 0.02) continue;
          onAddWindowByOffsets(wall.id, startOffset, endOffset);
        }
      }
      setWindowSelection(null);
      return;
    }

    // Single-tap: finger didn't move much — dispatch the appropriate action
    if (tapStartPosRef.current && image) {
      const pointer = tapStartPosRef.current;
      tapStartPosRef.current = null;
      const imagePoint = stageToImagePoint(pointer);
      if (isInsideImage(imagePoint)) {
        if (isCalibrationMode) {
          onAddMeasurementPoint(imagePoint);
        } else if (isStaircaseLinkMode && scale) {
          onStaircaseLinkClick?.(pixelToMeter(imagePoint.x, imagePoint.y, scale.pixelsPerMeter));
        } else if (isDrawingMode && scale) {
          const finalImagePoint = applyDrawingConstraint(imagePoint, false, false);
          const meterPoint = pixelToMeter(finalImagePoint.x, finalImagePoint.y, scale.pixelsPerMeter);
          if (!currentWall) {
            onSelectFurniture(null);
            onBeginWall(meterPoint);
          } else {
            onCompleteWall(meterPoint);
          }
        }
      }
    }
    tapStartPosRef.current = null;
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
    if (enableSnapping && !disableSnap) {
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
    if (event.target.hasName("window-line")) {
      return;
    }
    if (event.target.hasName("furniture-footprint")) {
      return;
    }
    if (event.target.hasName("staircase-link-marker")) {
      return;
    }
    if (event.target.hasName("tour-start-pin")) {
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

    if (isTourMode && scale) {
      const meterPoint = pixelToMeter(imagePoint.x, imagePoint.y, scale.pixelsPerMeter);
      onSetTourStart?.(meterPoint);
      return;
    }

    if (isStaircaseLinkMode && scale) {
      onStaircaseLinkClick?.(pixelToMeter(imagePoint.x, imagePoint.y, scale.pixelsPerMeter));
      return;
    }

    if (isWindowMode) {
      onSelectWall(null);
      onSelectFurniture(null);
      setWindowSelection({ start: imagePoint, end: imagePoint });
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
      onSelectFurniture(null);
      onBeginWall(meterPoint);
    } else {
      onCompleteWall(meterPoint);
    }
  };

  const onCompleteWall = (meterPoint: Point2D) => {
    onCompleteCurrentWall(meterPoint);
  };

  const onStageMouseMove = (event: KonvaEventObject<MouseEvent>) => {
    if (!image) return;

    const stage = event.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const imagePoint = stageToImagePoint(pointer);
    onCanvasStatusChange?.({
      cursor: isInsideImage(imagePoint) ? imagePoint : null,
      zoomPercent: Math.round(transform.scale * 100),
    });
    if (isWindowMode && windowSelection) {
      setWindowSelection((previous) =>
        previous ? { ...previous, end: clampToImageBounds(imagePoint) } : previous,
      );
      return;
    }

    if (!isDrawingMode || !scale || !currentWall) return;

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

  const onStageMouseUp = () => {
    if (!isWindowMode || !windowSelection || !selectionRect) return;
    if (selectionRect.width < 2 || selectionRect.height < 2) {
      setWindowSelection(null);
      return;
    }

    for (const wall of pixelWalls) {
      const clipped = clipSegmentWithRect(wall.start, wall.end, selectionRect);
      if (!clipped) continue;

      const sourceWall = wallById.get(wall.id);
      if (!sourceWall) continue;
      const wallLength = Math.hypot(
        sourceWall.end.x - sourceWall.start.x,
        sourceWall.end.y - sourceWall.start.y,
      );
      if (wallLength <= 0) continue;

      const startOffset = wallLength * clipped.t0;
      const endOffset = wallLength * clipped.t1;
      if (endOffset - startOffset < 0.02) continue;
      onAddWindowByOffsets(wall.id, startOffset, endOffset);
    }

    setWindowSelection(null);
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
    <section className={`relative h-full w-full overflow-hidden ${className ?? ""}`.trim()} ref={panelRef}>
      <div ref={stageWrapRef} className="h-full w-full">
        <Stage
          width={viewport.width}
          height={viewport.height}
          onWheel={onWheel}
          onMouseDown={onStageMouseDown}
          onMouseMove={onStageMouseMove}
          onMouseUp={onStageMouseUp}
          onTouchStart={onStageTouchStart}
          onTouchMove={onStageTouchMove}
          onTouchEnd={onStageTouchEnd}
        >
          <Layer>
            {image && (
              <Group
                name="canvas-group"
                x={transform.x}
                y={transform.y}
                scaleX={transform.scale}
                scaleY={transform.scale}
                draggable={!isPinching && !isCalibrationMode && !isWindowMode && !isStaircaseLinkMode && (!isDrawingMode || isTabPanning)}
                onDragEnd={(evt) => {
                  if (evt.target.name() !== "canvas-group") return;
                  setTransform((previous) => ({
                    ...previous,
                    x: evt.target.x(),
                    y: evt.target.y(),
                  }));
                }}
              >
                {layerVisibility.image && <KonvaImage image={image} />}
                {layerVisibility.walls &&
                  pixelPolygons.map((polygon) => (
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
                {layerVisibility.walls &&
                  pixelWalls.map((wall) => {
                    const isSelected = selectedWallId === wall.id;
                    return (
                      <Group key={wall.id}>
                        <Line
                          name="wall-line"
                          listening={!isDrawingMode}
                          points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
                          stroke={isSelected ? "#ff8a00" : "#3273dc"}
                          strokeWidth={isSelected ? invariantSelectedStrokeWidth : invariantStrokeWidth}
                          strokeScaleEnabled={false}
                          hitStrokeWidth={14 / transform.scale}
                          onMouseDown={(event) => {
                            event.cancelBubble = true;
                            onSelectWall(wall.id);
                            onSelectWindow(null);
                          }}
                          onClick={(event) => {
                            event.cancelBubble = true;
                            onSelectWall(wall.id);
                            onSelectWindow(null);
                          }}
                        />
                        <Circle
                          name="wall-endpoint"
                          listening={!isDrawingMode}
                          x={wall.start.x}
                          y={wall.start.y}
                          radius={invariantEndpointRadius}
                          fill={isSelected ? "#ff8a00" : "#3273dc"}
                          draggable={!isDrawingMode && !isWindowMode}
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
                          listening={!isDrawingMode}
                          x={wall.end.x}
                          y={wall.end.y}
                          radius={invariantEndpointRadius}
                          fill={isSelected ? "#ff8a00" : "#3273dc"}
                          draggable={!isDrawingMode && !isWindowMode}
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
                {layerVisibility.windows &&
                  windowSegments.map((segment) => (
                    <Line
                      key={segment.id}
                      name="window-line"
                      points={[segment.start.x, segment.start.y, segment.end.x, segment.end.y]}
                      stroke={segment.selected ? "#ff9f1a" : getWindowColor(segment.type)}
                      strokeWidth={(segment.selected ? 7 : 5) / transform.scale}
                      strokeScaleEnabled={false}
                      lineCap="round"
                      onMouseDown={(event) => {
                        event.cancelBubble = true;
                        onSelectWindow(segment.id);
                      }}
                      onClick={(event) => {
                        event.cancelBubble = true;
                        onSelectWindow(segment.id);
                      }}
                    />
                  ))}
                {layerVisibility.furniture &&
                  pixelFurniture.map((item) => (
                    <Group
                      key={item.id}
                      x={item.center.x}
                      y={item.center.y}
                      rotation={item.rotationDeg}
                      draggable={!isWindowMode}
                      onDragStart={(event) => {
                        event.cancelBubble = true;
                        onSelectFurniture(item.id);
                        onSelectWall(null);
                        onSelectWindow(null);
                      }}
                      onDragEnd={(event) => {
                        event.cancelBubble = true;
                        if (!scale) return;
                        const clamped = clampToImageBounds({
                          x: event.target.x(),
                          y: event.target.y(),
                        });
                        const meter = pixelToMeter(clamped.x, clamped.y, scale.pixelsPerMeter);
                        onMoveFurniture(item.id, meter);
                      }}
                    >
                      <Rect
                        name="furniture-footprint"
                        x={-item.widthPx / 2}
                        y={-item.depthPx / 2}
                        width={item.widthPx}
                        height={item.depthPx}
                        fill={item.selected ? "rgba(255, 153, 0, 0.22)" : "rgba(74, 222, 128, 0.2)"}
                        stroke={item.selected ? "#ff8a00" : "#4ade80"}
                        strokeWidth={item.selected ? 2.2 / transform.scale : 1.7 / transform.scale}
                        strokeScaleEnabled={false}
                        onMouseDown={() => {
                          onSelectFurniture(item.id);
                          onSelectWall(null);
                          onSelectWindow(null);
                        }}
                        onClick={() => {
                          onSelectFurniture(item.id);
                          onSelectWall(null);
                          onSelectWindow(null);
                        }}
                      />
                      <Line
                        name="furniture-footprint"
                        points={[0, 0, 0, -item.depthPx / 2 + 8 / transform.scale]}
                        stroke={item.selected ? "#ff8a00" : "#22c55e"}
                        strokeWidth={2 / transform.scale}
                        strokeScaleEnabled={false}
                        listening={false}
                      />
                    </Group>
                  ))}
                {pixelStaircaseLinks.map((link) => {
                  const r = 11 / transform.scale;
                  const fontSize = 10 / transform.scale;
                  const strokeW = (link.selected ? 2.5 : 1.5) / transform.scale;

                  // Arrow rendered at a constant screen size of ARROW_PX stage-pixels
                  const ARROW_PX = 32; // length in screen-pixels (stage space)
                  const L = ARROW_PX / transform.scale; // length in canvas-group (image pixel) space

                  // Direction vector from minimap angle (0=north/-Y, 90=east/+X)
                  const angleDir = (deg: number) => {
                    const rad = (deg * Math.PI) / 180;
                    return { dx: Math.sin(rad), dy: -Math.cos(rad) };
                  };

                  const dirA = angleDir(link.arrivalAngleAtA ?? 180);
                  const dirB = angleDir(link.arrivalAngleAtB ?? 0);

                  // Tip positions in canvas-group (image pixel) coordinates
                  const tipA = { x: link.pixelA.x + dirA.dx * L, y: link.pixelA.y + dirA.dy * L };
                  const tipB = { x: link.pixelB.x + dirB.dx * L, y: link.pixelB.y + dirB.dy * L };

                  // Arrowhead triangle points (in canvas-group coords)
                  const headPoints = (tip: { x: number; y: number }, dir: { dx: number; dy: number }) => {
                    const back = 8 / transform.scale;
                    const wing = 5 / transform.scale;
                    return [
                      tip.x, tip.y,
                      tip.x - dir.dx * back + (-dir.dy) * wing, tip.y - dir.dy * back + dir.dx * wing,
                      tip.x - dir.dx * back - (-dir.dy) * wing, tip.y - dir.dy * back - dir.dx * wing,
                    ];
                  };

                  // dragBoundFunc: constrains tip drag to ARROW_PX circle in stage space around the portal center
                  const makeTipBound = (cx_img: number, cy_img: number) =>
                    (pos: { x: number; y: number }) => {
                      const cx = transform.x + cx_img * transform.scale;
                      const cy = transform.y + cy_img * transform.scale;
                      const ddx = pos.x - cx;
                      const ddy = pos.y - cy;
                      const dist = Math.hypot(ddx, ddy);
                      if (dist < 0.1) return { x: cx, y: cy - ARROW_PX };
                      return { x: cx + (ddx / dist) * ARROW_PX, y: cy + (ddy / dist) * ARROW_PX };
                    };

                  // Compute minimap angle from dragged tip local position (canvas-group coords)
                  const tipAngle = (tipLocalX: number, tipLocalY: number, cxImg: number, cyImg: number) => {
                    const ddx = tipLocalX - cxImg;
                    const ddy = tipLocalY - cyImg;
                    const deg = Math.atan2(ddx, -ddy) * (180 / Math.PI);
                    return Math.round(((deg % 360) + 360) % 360);
                  };

                  return (
                    <Group key={link.id}>
                      {/* Connecting dashed line between A and B */}
                      <Line
                        points={[link.pixelA.x, link.pixelA.y, link.pixelB.x, link.pixelB.y]}
                        stroke={link.color}
                        strokeWidth={1.5 / transform.scale}
                        strokeScaleEnabled={false}
                        dash={[8 / transform.scale, 5 / transform.scale]}
                        opacity={link.selected ? 0.9 : 0.55}
                        listening={false}
                      />

                      {/* ── Arrival arrow at A (arrivalAngleAtA: direction when landing at A from B) ── */}
                      <Line
                        points={[link.pixelA.x, link.pixelA.y, tipA.x, tipA.y]}
                        stroke="#fff"
                        strokeWidth={2.5 / transform.scale}
                        strokeScaleEnabled={false}
                        opacity={0.8}
                        listening={false}
                      />
                      <Line
                        points={headPoints(tipA, dirA)}
                        closed
                        fill="#fff"
                        stroke="transparent"
                        opacity={0.8}
                        listening={false}
                      />
                      {/* Draggable tip handle for arrow A */}
                      <Circle
                        name="staircase-link-marker"
                        x={tipA.x}
                        y={tipA.y}
                        radius={7 / transform.scale}
                        fill={link.color}
                        stroke="#fff"
                        strokeWidth={1.5 / transform.scale}
                        strokeScaleEnabled={false}
                        opacity={0.95}
                        draggable={isStaircaseLinkMode}
                        dragBoundFunc={makeTipBound(link.pixelA.x, link.pixelA.y)}
                        onMouseDown={(e) => { e.cancelBubble = true; onSelectStaircaseLink?.(link.id); }}
                        onDragStart={(e) => { e.cancelBubble = true; onSelectStaircaseLink?.(link.id); }}
                        onDragMove={(e) => {
                          e.cancelBubble = true;
                          onUpdateStaircaseLinkAngle?.(link.id, "a", tipAngle(e.target.x(), e.target.y(), link.pixelA.x, link.pixelA.y));
                        }}
                        onDragEnd={(e) => {
                          e.cancelBubble = true;
                          onUpdateStaircaseLinkAngle?.(link.id, "a", tipAngle(e.target.x(), e.target.y(), link.pixelA.x, link.pixelA.y));
                        }}
                      />

                      {/* ── Arrival arrow at B (arrivalAngleAtB: direction when landing at B from A) ── */}
                      <Line
                        points={[link.pixelB.x, link.pixelB.y, tipB.x, tipB.y]}
                        stroke="#fff"
                        strokeWidth={2.5 / transform.scale}
                        strokeScaleEnabled={false}
                        opacity={0.8}
                        listening={false}
                      />
                      <Line
                        points={headPoints(tipB, dirB)}
                        closed
                        fill="#fff"
                        stroke="transparent"
                        opacity={0.8}
                        listening={false}
                      />
                      {/* Draggable tip handle for arrow B */}
                      <Circle
                        name="staircase-link-marker"
                        x={tipB.x}
                        y={tipB.y}
                        radius={7 / transform.scale}
                        fill={link.color}
                        stroke="#fff"
                        strokeWidth={1.5 / transform.scale}
                        strokeScaleEnabled={false}
                        opacity={0.95}
                        draggable={isStaircaseLinkMode}
                        dragBoundFunc={makeTipBound(link.pixelB.x, link.pixelB.y)}
                        onMouseDown={(e) => { e.cancelBubble = true; onSelectStaircaseLink?.(link.id); }}
                        onDragStart={(e) => { e.cancelBubble = true; onSelectStaircaseLink?.(link.id); }}
                        onDragMove={(e) => {
                          e.cancelBubble = true;
                          onUpdateStaircaseLinkAngle?.(link.id, "b", tipAngle(e.target.x(), e.target.y(), link.pixelB.x, link.pixelB.y));
                        }}
                        onDragEnd={(e) => {
                          e.cancelBubble = true;
                          onUpdateStaircaseLinkAngle?.(link.id, "b", tipAngle(e.target.x(), e.target.y(), link.pixelB.x, link.pixelB.y));
                        }}
                      />

                      {/* ── Portal A marker (draggable to move position) ── */}
                      <Group
                        name="staircase-link-marker"
                        x={link.pixelA.x}
                        y={link.pixelA.y}
                        draggable={isStaircaseLinkMode}
                        onMouseDown={(e) => { e.cancelBubble = true; onSelectStaircaseLink?.(link.id); }}
                        onClick={(e) => { e.cancelBubble = true; onSelectStaircaseLink?.(link.id); }}
                        onDragStart={(e) => { e.cancelBubble = true; onSelectStaircaseLink?.(link.id); }}
                        onDragEnd={(e) => {
                          e.cancelBubble = true;
                          if (!scale) return;
                          const clamped = clampToImageBounds({ x: e.target.x(), y: e.target.y() });
                          onMoveStaircaseLinkPoint?.(link.id, "a", pixelToMeter(clamped.x, clamped.y, scale.pixelsPerMeter));
                        }}
                      >
                        <Circle radius={r} fill={link.color} opacity={0.85} stroke={link.selected ? "#fff" : link.color} strokeWidth={strokeW} strokeScaleEnabled={false} />
                        <Text text="A" fontSize={fontSize} fontStyle="bold" fill="#fff" align="center" verticalAlign="middle" x={-r} y={-r} width={r * 2} height={r * 2} listening={false} />
                      </Group>

                      {/* ── Portal B marker (draggable to move position) ── */}
                      <Group
                        name="staircase-link-marker"
                        x={link.pixelB.x}
                        y={link.pixelB.y}
                        draggable={isStaircaseLinkMode}
                        onMouseDown={(e) => { e.cancelBubble = true; onSelectStaircaseLink?.(link.id); }}
                        onClick={(e) => { e.cancelBubble = true; onSelectStaircaseLink?.(link.id); }}
                        onDragStart={(e) => { e.cancelBubble = true; onSelectStaircaseLink?.(link.id); }}
                        onDragEnd={(e) => {
                          e.cancelBubble = true;
                          if (!scale) return;
                          const clamped = clampToImageBounds({ x: e.target.x(), y: e.target.y() });
                          onMoveStaircaseLinkPoint?.(link.id, "b", pixelToMeter(clamped.x, clamped.y, scale.pixelsPerMeter));
                        }}
                      >
                        <Circle radius={r} fill="transparent" stroke={link.color} strokeWidth={(link.selected ? 2.5 : 2) / transform.scale} strokeScaleEnabled={false} />
                        <Circle radius={r * 0.55} fill={link.color} opacity={0.85} listening={false} />
                        <Text text="B" fontSize={fontSize} fontStyle="bold" fill="#fff" align="center" verticalAlign="middle" x={-r} y={-r} width={r * 2} height={r * 2} listening={false} />
                      </Group>
                    </Group>
                  );
                })}
                {/* Pending A preview */}
                {pixelPendingA && (
                  <Group listening={false}>
                    <Circle
                      x={pixelPendingA.x}
                      y={pixelPendingA.y}
                      radius={11 / transform.scale}
                      fill="rgba(249,115,22,0.45)"
                      stroke="#f97316"
                      strokeWidth={1.5 / transform.scale}
                      strokeScaleEnabled={false}
                      dash={[5 / transform.scale, 3 / transform.scale]}
                    />
                    <Text
                      x={pixelPendingA.x - 11 / transform.scale}
                      y={pixelPendingA.y - 11 / transform.scale}
                      width={22 / transform.scale}
                      height={22 / transform.scale}
                      text="A"
                      fontSize={10 / transform.scale}
                      fontStyle="bold"
                      fill="#fff"
                      align="center"
                      verticalAlign="middle"
                      listening={false}
                    />
                  </Group>
                )}
                {/* ── Tour start point pin ── */}
                {pixelTourStart && tourStartPoint && (() => {
                  const PIN_R_PX = 10;
                  const TOUR_ARROW_PX = 32;

                  const r = PIN_R_PX / transform.scale;
                  const arrowL = TOUR_ARROW_PX / transform.scale;

                  // anchor = circle center = pixelTourStart
                  const cx = pixelTourStart.x;
                  const cy = pixelTourStart.y;

                  const rad = (tourStartPoint.angleDeg * Math.PI) / 180;
                  const dirDx = Math.sin(rad);
                  const dirDy = -Math.cos(rad);

                  const tipAbsX = cx + dirDx * arrowL;
                  const tipAbsY = cy + dirDy * arrowL;

                  const back = 8 / transform.scale;
                  const wing = 5 / transform.scale;
                  const arrowHeadPts = [
                    tipAbsX, tipAbsY,
                    tipAbsX - dirDx * back + (-dirDy) * wing, tipAbsY - dirDy * back + dirDx * wing,
                    tipAbsX - dirDx * back - (-dirDy) * wing, tipAbsY - dirDy * back - dirDx * wing,
                  ];

                  // dragBoundFunc for arrow tip: constrained to TOUR_ARROW_PX circle around center in stage coords
                  const tourTipBound = (pos: { x: number; y: number }) => {
                    const scx = transform.x + cx * transform.scale;
                    const scy = transform.y + cy * transform.scale;
                    const ddx = pos.x - scx;
                    const ddy = pos.y - scy;
                    const dist = Math.hypot(ddx, ddy);
                    if (dist < 0.1) return { x: scx, y: scy - TOUR_ARROW_PX };
                    return { x: scx + (ddx / dist) * TOUR_ARROW_PX, y: scy + (ddy / dist) * TOUR_ARROW_PX };
                  };

                  return (
                    <Group key="tour-start-group">
                      {/* Circle: draggable, centered on anchor */}
                      <Circle
                        name="tour-start-pin"
                        x={cx}
                        y={cy}
                        radius={r}
                        fill="#137fec"
                        stroke="#0a4fa0"
                        strokeWidth={1.5 / transform.scale}
                        strokeScaleEnabled={false}
                        draggable={isTourMode}
                        onMouseDown={(e) => { e.cancelBubble = true; }}
                        onClick={(e) => { e.cancelBubble = true; }}
                        onDragStart={(e) => { e.cancelBubble = true; }}
                        onDragEnd={(e) => {
                          e.cancelBubble = true;
                          if (!scale) return;
                          const clamped = clampToImageBounds({ x: e.target.x(), y: e.target.y() });
                          onMoveTourStart?.(pixelToMeter(clamped.x, clamped.y, scale.pixelsPerMeter));
                        }}
                      />
                      {/* White dot inside */}
                      <Circle
                        x={cx}
                        y={cy}
                        radius={r * 0.38}
                        fill="white"
                        listening={false}
                      />
                      {/* Arrow stem */}
                      <Line
                        points={[cx, cy, tipAbsX, tipAbsY]}
                        stroke="#137fec"
                        strokeWidth={2.5 / transform.scale}
                        strokeScaleEnabled={false}
                        listening={false}
                      />
                      {/* Arrowhead triangle */}
                      <Line
                        points={arrowHeadPts}
                        closed
                        fill="#137fec"
                        stroke="#137fec"
                        strokeWidth={1 / transform.scale}
                        strokeScaleEnabled={false}
                        listening={false}
                      />
                      {/* Draggable arrow tip handle */}
                      <Circle
                        name="tour-start-pin"
                        x={tipAbsX}
                        y={tipAbsY}
                        radius={7 / transform.scale}
                        fill="rgba(19,127,236,0.35)"
                        stroke="#137fec"
                        strokeWidth={1.5 / transform.scale}
                        strokeScaleEnabled={false}
                        draggable={isTourMode}
                        dragBoundFunc={tourTipBound}
                        onMouseDown={(e) => { e.cancelBubble = true; }}
                        onDragMove={(e) => {
                          e.cancelBubble = true;
                          const ddx = e.target.x() - cx;
                          const ddy = e.target.y() - cy;
                          const deg = Math.atan2(ddx, -ddy) * (180 / Math.PI);
                          onUpdateTourAngle?.(Math.round(((deg % 360) + 360) % 360));
                        }}
                        onDragEnd={(e) => {
                          e.cancelBubble = true;
                          e.target.x(tipAbsX);
                          e.target.y(tipAbsY);
                        }}
                      />
                    </Group>
                  );
                })()}

                {selectionRect && (
                  <Rect
                    x={selectionRect.x}
                    y={selectionRect.y}
                    width={selectionRect.width}
                    height={selectionRect.height}
                    stroke={getWindowColor(selectedWindowType)}
                    strokeWidth={1.5 / transform.scale}
                    fill="rgba(79, 127, 216, 0.12)"
                    listening={false}
                  />
                )}
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
      </div>
      {showHintBar && (
        <div className="canvas-hint">
          <p>
            {hasImage
              ? isCalibrationMode
                ? "校正模式中：請在圖片內點擊兩個量測點。"
                : isWindowMode
                  ? "窗戶模式中：拖曳框選範圍，若框到牆段會自動截取成窗戶。"
                  : isDrawingMode
                    ? isTabPanning
                      ? "Tab 暫時拖曳模式：可拖曳底圖，放開 Tab 回到繪製。"
                      : "繪製模式中：點擊起點與終點建立牆段，可拖曳端點調整。按住 Tab 可暫時拖曳底圖，按住 Alt 可暫時取消吸附。"
                    : "Ctrl+滾輪可縮放，滾輪可上下拖曳，Shift+滾輪可左右拖曳。"
              : "請先上傳圖片。"}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">{imageSizeText}</p>
        </div>
      )}
    </section>
  );
}

