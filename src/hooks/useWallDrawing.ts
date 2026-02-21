import { useMemo, useState } from "react";
import type { Point2D, WallSegment } from "../types/floorplan";
import { detectClosedPolygons } from "../utils/polygonDetector";

export type WallEndpoint = "start" | "end";

export interface CurrentWallPreview {
  start: Point2D;
  end: Point2D;
}

const createWallId = () =>
  `wall-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function useWallDrawing() {
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isContinuousMode, setIsContinuousMode] = useState(true);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [currentWall, setCurrentWall] = useState<CurrentWallPreview | null>(null);
  const [history, setHistory] = useState<WallSegment[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const walls = useMemo(() => history[historyIndex] ?? [], [history, historyIndex]);
  const polygons = useMemo(() => detectClosedPolygons(walls), [walls]);

  const pushWallsHistory = (nextWalls: WallSegment[]) => {
    const nextIndex = historyIndex + 1;
    setHistory((previous) => [...previous.slice(0, historyIndex + 1), nextWalls]);
    setHistoryIndex(nextIndex);
  };

  const startDrawing = () => {
    setIsDrawingMode(true);
    setCurrentWall(null);
    setSelectedWallId(null);
  };

  const stopDrawing = () => {
    setIsDrawingMode(false);
    setCurrentWall(null);
  };

  const beginWall = (start: Point2D) => {
    setCurrentWall({ start, end: start });
  };

  const updateCurrentWall = (end: Point2D) => {
    setCurrentWall((previous) => {
      if (!previous) return previous;
      return { ...previous, end };
    });
  };

  const addWall = (start: Point2D, end: Point2D): WallSegment | null => {
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length <= 0) return null;

    const newWall: WallSegment = {
      id: createWallId(),
      start,
      end,
    };
    pushWallsHistory([...walls, newWall]);
    return newWall;
  };

  const completeCurrentWall = (end: Point2D) => {
    if (!currentWall) return null;

    const created = addWall(currentWall.start, end);
    if (!created) return null;

    if (isContinuousMode) {
      setCurrentWall({ start: end, end });
    } else {
      setCurrentWall(null);
    }
    return created;
  };

  const cancelCurrentWall = () => {
    setCurrentWall(null);
  };

  const selectWall = (id: string | null) => {
    setSelectedWallId(id);
  };

  const moveWallEndpoint = (
    wallId: string,
    endpoint: WallEndpoint,
    newPosition: Point2D,
  ) => {
    const nextWalls = walls.map((wall) => {
      if (wall.id !== wallId) return wall;
      return {
        ...wall,
        [endpoint]: newPosition,
      };
    });
    pushWallsHistory(nextWalls);
  };

  const deleteWall = (id: string) => {
    const nextWalls = walls.filter((wall) => wall.id !== id);
    pushWallsHistory(nextWalls);
    setSelectedWallId((previous) => (previous === id ? null : previous));
  };

  const undo = () => {
    if (historyIndex <= 0) return;
    setHistoryIndex((previous) => previous - 1);
    setCurrentWall(null);
    setSelectedWallId(null);
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    setHistoryIndex((previous) => previous + 1);
    setCurrentWall(null);
    setSelectedWallId(null);
  };

  const resetWalls = () => {
    setHistory([[]]);
    setHistoryIndex(0);
    setSelectedWallId(null);
    setCurrentWall(null);
    setIsDrawingMode(false);
  };

  const hydrateWalls = (nextWalls: WallSegment[]) => {
    setHistory([nextWalls]);
    setHistoryIndex(0);
    setSelectedWallId(null);
    setCurrentWall(null);
    setIsDrawingMode(false);
  };

  return {
    walls,
    polygons,
    isDrawingMode,
    isContinuousMode,
    selectedWallId,
    currentWall,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    startDrawing,
    stopDrawing,
    setContinuousMode: setIsContinuousMode,
    beginWall,
    updateCurrentWall,
    completeCurrentWall,
    cancelCurrentWall,
    addWall,
    selectWall,
    moveWallEndpoint,
    deleteWall,
    undo,
    redo,
    hydrateWalls,
    resetWalls,
  };
}
