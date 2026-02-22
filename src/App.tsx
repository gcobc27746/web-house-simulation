import { useCallback, useEffect, useMemo, useState } from "react";
import { Canvas } from "./components/Canvas";
import { DistanceInputDialog } from "./components/DistanceInputDialog";
import { FurniturePanel } from "./components/FurniturePanel";
import { ImageUpload } from "./components/ImageUpload";
import { ScaleCalibration } from "./components/ScaleCalibration";
import { StorageControls } from "./components/StorageControls";
import { WallDrawing } from "./components/WallDrawing";
import { WindowMarking } from "./components/WindowMarking";
import { getFurnitureCatalogItem } from "./furniture/catalog";
import { useFloorplanStorage } from "./hooks/useFloorplanStorage";
import { useScaleCalibration } from "./hooks/useScaleCalibration";
import { useWallDrawing } from "./hooks/useWallDrawing";
import { useWindowMarking } from "./hooks/useWindowMarking";
import { GeometryPreview } from "./step2/viewer/GeometryPreview";
import type { LoadedImagePayload } from "./hooks/useImageUpload";
import type { FloorplanData, FurnitureCatalogId, FurnitureItem, Point2D } from "./types/floorplan";

const nowIso = () => new Date().toISOString();
type ViewMode = "design" | "viewer";
type ToolMode = "upload" | "calibrate" | "wall" | "furniture" | "layers" | "settings";

function createInitialData(): FloorplanData {
  const createdAt = nowIso();
  return {
    meta: {
      version: "1.0.0",
      createdAt,
      updatedAt: createdAt,
    },
    walls: [],
    polygons: [],
    windows: [],
    furniture: [],
  };
}

const createFurnitureId = () =>
  `furniture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeRotation = (rotationDeg: number) => {
  const normalized = rotationDeg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const getDefaultFurniturePosition = (data: FloorplanData): Point2D => {
  if (data.walls.length === 0) return { x: 1.5, y: 1.5 };
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const wall of data.walls) {
    minX = Math.min(minX, wall.start.x, wall.end.x);
    maxX = Math.max(maxX, wall.start.x, wall.end.x);
    minY = Math.min(minY, wall.start.y, wall.end.y);
    maxY = Math.max(maxY, wall.start.y, wall.end.y);
  }
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  };
};

export default function App() {
  const [floorplanData, setFloorplanData] = useState<FloorplanData>(
    createInitialData,
  );
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(
    null,
  );
  const [ceilingHeight, setCeilingHeight] = useState(2.8);
  const [wallThickness, setWallThickness] = useState(0.12);
  const [cameraHeight, setCameraHeight] = useState(1.7);
  const [moveSpeed, setMoveSpeed] = useState(2.8);
  const [lookSensitivity, setLookSensitivity] = useState(1);
  const [collisionRadius, setCollisionRadius] = useState(0.25);
  const [showCollisionDebug, setShowCollisionDebug] = useState(false);
  const [isDistanceDialogOpen, setIsDistanceDialogOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewMode>("design");
  const [activeTool, setActiveTool] = useState<ToolMode>("upload");
  const [furniture, setFurniture] = useState<FurnitureItem[]>([]);
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [canvasStatus, setCanvasStatus] = useState<{
    cursor: { x: number; y: number } | null;
    zoomPercent: number;
  }>({
    cursor: null,
    zoomPercent: 100,
  });
  const calibration = useScaleCalibration();
  const wallDrawing = useWallDrawing();
  const windowMarking = useWindowMarking();

  const applyLoadedData = useCallback(
    (nextData: FloorplanData) => {
      setFloorplanData(nextData);
      calibration.hydrateScale(nextData.scale ?? null);
      wallDrawing.hydrateWalls(nextData.walls);
      windowMarking.hydrateWindows(nextData.windows ?? []);
      setFurniture(nextData.furniture ?? []);
      setSelectedFurnitureId(null);
      setIsDistanceDialogOpen(false);
    },
    [calibration, wallDrawing, windowMarking],
  );

  const storage = useFloorplanStorage(floorplanData, applyLoadedData);

  const onImageLoaded = (payload: LoadedImagePayload) => {
    calibration.stopCalibrationMode();
    wallDrawing.cancelCurrentWall();
    wallDrawing.stopDrawing();
    windowMarking.stopWindowMode();
    windowMarking.cancelDraft();
    setUploadedImage(payload.image);
    setFloorplanData((previous) => ({
      ...previous,
      image: {
        width: payload.width,
        height: payload.height,
        filename: payload.filename,
      },
      meta: {
        ...previous.meta,
        updatedAt: nowIso(),
      },
    }));
  };

  const measurementDistancePx = useMemo(() => {
    if (calibration.measurementPoints.length !== 2) return null;
    return Math.hypot(
      calibration.measurementPoints[1].x - calibration.measurementPoints[0].x,
      calibration.measurementPoints[1].y - calibration.measurementPoints[0].y,
    );
  }, [calibration.measurementPoints]);

  useEffect(() => {
    if (calibration.isCalibrationMode && calibration.measurementPoints.length === 2) {
      setIsDistanceDialogOpen(true);
    }
  }, [calibration.isCalibrationMode, calibration.measurementPoints.length]);

  const onConfirmDistance = (distance: number) => {
    const nextScale = calibration.calculateScale(distance);
    if (!nextScale) return false;

    setFloorplanData((previous) => ({
      ...previous,
      scale: nextScale,
      meta: {
        ...previous.meta,
        updatedAt: nowIso(),
      },
    }));
    setIsDistanceDialogOpen(false);
    return true;
  };

  const onCancelDistance = () => {
    setIsDistanceDialogOpen(false);
    calibration.clearMeasurement();
  };

  const onResetCalibration = () => {
    setIsDistanceDialogOpen(false);
    calibration.resetCalibration();
    wallDrawing.resetWalls();
    windowMarking.resetWindows();
    setFurniture([]);
    setSelectedFurnitureId(null);
    setFloorplanData((previous) => ({
      ...previous,
      scale: undefined,
      walls: [],
      polygons: [],
      windows: [],
      furniture: [],
      meta: {
        ...previous.meta,
        updatedAt: nowIso(),
      },
    }));
  };

  useEffect(() => {
    setFloorplanData((previous) => ({
      ...previous,
      walls: wallDrawing.walls,
      polygons: wallDrawing.polygons,
      windows: windowMarking.windows,
      furniture,
      meta: {
        ...previous.meta,
        updatedAt: nowIso(),
      },
    }));
  }, [furniture, wallDrawing.walls, wallDrawing.polygons, windowMarking.windows]);

  const addFurniture = (catalogId: FurnitureCatalogId) => {
    const catalogItem = getFurnitureCatalogItem(catalogId);
    if (!catalogItem) return;
    const position = getDefaultFurniturePosition(floorplanData);
    const created: FurnitureItem = {
      id: createFurnitureId(),
      catalogId,
      position,
      rotationDeg: 0,
      width: catalogItem.footprint.width,
      depth: catalogItem.footprint.depth,
    };
    setFurniture((previous) => [...previous, created]);
    setSelectedFurnitureId(created.id);
    wallDrawing.selectWall(null);
    windowMarking.selectWindow(null);
  };

  const moveFurniture = (id: string, position: Point2D) => {
    setFurniture((previous) =>
      previous.map((item) => (item.id === id ? { ...item, position } : item)),
    );
  };

  const rotateSelectedFurniture = (deltaDeg: number) => {
    if (!selectedFurnitureId) return;
    setFurniture((previous) =>
      previous.map((item) =>
        item.id === selectedFurnitureId
          ? { ...item, rotationDeg: normalizeRotation(item.rotationDeg + deltaDeg) }
          : item,
      ),
    );
  };

  const deleteSelectedFurniture = () => {
    if (!selectedFurnitureId) return;
    setFurniture((previous) => previous.filter((item) => item.id !== selectedFurnitureId));
    setSelectedFurnitureId(null);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Delete") {
        if (selectedFurnitureId) {
          deleteSelectedFurniture();
          return;
        }
        if (windowMarking.selectedWindowId) {
          windowMarking.deleteWindow(windowMarking.selectedWindowId);
          return;
        }
        if (wallDrawing.selectedWallId) {
          wallDrawing.deleteWall(wallDrawing.selectedWallId);
        }
      }
      if (event.key === "Escape") {
        wallDrawing.cancelCurrentWall();
        windowMarking.cancelDraft();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    deleteSelectedFurniture,
    wallDrawing.cancelCurrentWall,
    wallDrawing.deleteWall,
    wallDrawing.selectedWallId,
    selectedFurnitureId,
    windowMarking.cancelDraft,
    windowMarking.deleteWindow,
    windowMarking.selectedWindowId,
  ]);

  const imageInfoText = useMemo(() => {
    if (!floorplanData.image) return "尚未設定 image metadata。";
    return `${floorplanData.image.filename} (${floorplanData.image.width}x${floorplanData.image.height})`;
  }, [floorplanData.image]);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-background-dark text-slate-100">
      <header className="z-40 flex items-center justify-between border-b border-border-dark bg-surface-darker px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
            <span className="material-symbols-outlined">architecture</span>
          </div>
          <div>
            <h1 className="text-base font-bold">SpatialPlanner</h1>
            <p className="text-xs text-slate-400">Project: Floorplan Simulation</p>
          </div>
        </div>
        <div className="hidden rounded-lg border border-border-dark bg-surface-dark p-1 md:flex">
          <button
            type="button"
            className={`rounded px-4 py-1.5 text-sm font-medium transition ${
              activeView === "design"
                ? "bg-primary/20 text-primary"
                : "text-slate-400 hover:text-white"
            }`}
            onClick={() => setActiveView("design")}
          >
            Design
          </button>
          <button
            type="button"
            className={`rounded px-4 py-1.5 text-sm font-medium transition ${
              activeView === "viewer"
                ? "bg-primary/20 text-primary"
                : "text-slate-400 hover:text-white"
            }`}
            onClick={() => setActiveView("viewer")}
          >
            3D View
          </button>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary px-4 py-2 text-sm font-semibold text-white"
          onClick={() => setActiveView(activeView === "design" ? "viewer" : "design")}
        >
          <span className="material-symbols-outlined text-base">swap_horiz</span>
          {activeView === "design" ? "前往 3D" : "回到 2D"}
        </button>
      </header>

      {activeView === "design" ? (
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[72px] flex-col items-center border-r border-border-dark bg-surface-darker py-4">
            {[
              { key: "upload", icon: "upload_file", label: "上傳" },
              { key: "calibrate", icon: "straighten", label: "校正" },
              { key: "wall", icon: "edit", label: "牆線" },
              { key: "furniture", icon: "bed", label: "家具" },
              { key: "layers", icon: "layers", label: "圖層" },
              { key: "settings", icon: "settings", label: "設定" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                title={item.label}
                className={`mb-2 flex size-10 items-center justify-center rounded-xl transition ${
                  activeTool === item.key
                    ? "bg-primary/20 text-primary ring-1 ring-primary/30"
                    : "text-slate-400 hover:bg-surface-dark hover:text-white"
                }`}
                onClick={() => setActiveTool(item.key as ToolMode)}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
              </button>
            ))}
          </aside>

          <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0d1218]">
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <Canvas
                className="h-full"
                image={uploadedImage}
                isCalibrationMode={calibration.isCalibrationMode}
                measurementPoints={calibration.measurementPoints}
                scale={calibration.scale}
                onAddMeasurementPoint={calibration.addMeasurementPoint}
                isDrawingMode={wallDrawing.isDrawingMode && Boolean(calibration.scale)}
                walls={wallDrawing.walls}
                polygons={wallDrawing.polygons}
                selectedWallId={wallDrawing.selectedWallId}
                currentWall={wallDrawing.currentWall}
                onBeginWall={wallDrawing.beginWall}
                onUpdateCurrentWall={wallDrawing.updateCurrentWall}
                onCompleteCurrentWall={wallDrawing.completeCurrentWall}
                onSelectWall={(id) => {
                  wallDrawing.selectWall(id);
                  if (id) setSelectedFurnitureId(null);
                }}
                onMoveWallEndpoint={wallDrawing.moveWallEndpoint}
                isWindowMode={windowMarking.isWindowMode}
                windows={windowMarking.windows}
                selectedWindowId={windowMarking.selectedWindowId}
                selectedWindowType={windowMarking.selectedType}
                onAddWindowByOffsets={windowMarking.addWindowByOffsets}
                onSelectWindow={(id) => {
                  windowMarking.selectWindow(id);
                  if (id) setSelectedFurnitureId(null);
                }}
                furniture={furniture}
                selectedFurnitureId={selectedFurnitureId}
                onSelectFurniture={(id) => {
                  setSelectedFurnitureId(id);
                  if (id) {
                    wallDrawing.selectWall(null);
                    windowMarking.selectWindow(null);
                  }
                }}
                onMoveFurniture={moveFurniture}
                onCanvasStatusChange={setCanvasStatus}
              />
            </div>
            <div className="flex h-8 items-center justify-between border-t border-border-dark bg-surface-darker px-4 text-xs text-slate-400">
              <div className="flex items-center gap-4">
                <span>
                  X: {canvasStatus.cursor ? canvasStatus.cursor.x.toFixed(0) : "--"} Y:{" "}
                  {canvasStatus.cursor ? canvasStatus.cursor.y.toFixed(0) : "--"}
                </span>
                <span>Unit: Metric</span>
              </div>
              <span className="font-mono">{canvasStatus.zoomPercent}%</span>
            </div>
          </section>

          <aside className="w-80 overflow-y-auto border-l border-border-dark bg-surface-darker p-4">
            {activeTool === "upload" && (
              <>
                <ImageUpload onImageLoaded={onImageLoaded} />
                <StorageControls
                  onExport={storage.exportJSON}
                  onImport={storage.importJSON}
                  onClear={() => {
                    const confirmed = window.confirm("確定要清除本地資料嗎？此動作無法復原。");
                    if (!confirmed) return;
                    storage.clearStorage();
                    calibration.resetCalibration();
                    wallDrawing.resetWalls();
                    windowMarking.resetWindows();
                    setFurniture([]);
                    setSelectedFurnitureId(null);
                    setUploadedImage(null);
                    setIsDistanceDialogOpen(false);
                    setFloorplanData(createInitialData());
                  }}
                />
              </>
            )}

            {activeTool === "calibrate" && (
              <ScaleCalibration
                canCalibrate={Boolean(uploadedImage)}
                isCalibrationMode={calibration.isCalibrationMode}
                measurementPointsCount={calibration.measurementPoints.length}
                pixelDistance={measurementDistancePx}
                scale={calibration.scale}
                onStartCalibration={() => {
                  wallDrawing.stopDrawing();
                  setIsDistanceDialogOpen(false);
                  calibration.startCalibration();
                }}
                onResetCalibration={onResetCalibration}
              />
            )}

            {activeTool === "wall" && (
              <WallDrawing
                canDraw={Boolean(uploadedImage && calibration.scale)}
                isDrawingMode={wallDrawing.isDrawingMode}
                isContinuousMode={wallDrawing.isContinuousMode}
                wallsCount={wallDrawing.walls.length}
                polygonsCount={wallDrawing.polygons.length}
                selectedWallId={wallDrawing.selectedWallId}
                canUndo={wallDrawing.canUndo}
                canRedo={wallDrawing.canRedo}
                onToggleDrawingMode={() => {
                  setIsDistanceDialogOpen(false);
                  calibration.stopCalibrationMode();
                  windowMarking.stopWindowMode();
                  windowMarking.cancelDraft();
                  if (wallDrawing.isDrawingMode) {
                    wallDrawing.cancelCurrentWall();
                    wallDrawing.stopDrawing();
                  } else if (calibration.scale) {
                    wallDrawing.startDrawing();
                  }
                }}
                onToggleContinuousMode={wallDrawing.setContinuousMode}
                onUndo={wallDrawing.undo}
                onRedo={wallDrawing.redo}
                onDeleteSelected={() => {
                  if (!wallDrawing.selectedWallId) return;
                  wallDrawing.deleteWall(wallDrawing.selectedWallId);
                }}
                windowControls={
                  <WindowMarking
                    canMark={Boolean(uploadedImage && calibration.scale && wallDrawing.walls.length > 0)}
                    isWindowMode={windowMarking.isWindowMode}
                    selectedType={windowMarking.selectedType}
                    windowsCount={windowMarking.windows.length}
                    selectedWindowId={windowMarking.selectedWindowId}
                    onToggleWindowMode={() => {
                      setIsDistanceDialogOpen(false);
                      calibration.stopCalibrationMode();
                      wallDrawing.cancelCurrentWall();
                      wallDrawing.stopDrawing();
                      if (windowMarking.isWindowMode) {
                        windowMarking.stopWindowMode();
                        windowMarking.cancelDraft();
                      } else if (uploadedImage && calibration.scale && wallDrawing.walls.length > 0) {
                        windowMarking.startWindowMode();
                      }
                    }}
                    onSelectType={windowMarking.setWindowType}
                    onDeleteSelectedWindow={() => {
                      if (!windowMarking.selectedWindowId) return;
                      windowMarking.deleteWindow(windowMarking.selectedWindowId);
                    }}
                  />
                }
              />
            )}

            {activeTool === "furniture" && (
              <FurniturePanel
                canPlace={Boolean(uploadedImage && calibration.scale)}
                furnitureCount={furniture.length}
                selectedFurnitureId={selectedFurnitureId}
                onAddFurniture={addFurniture}
                onRotateSelected={rotateSelectedFurniture}
                onDeleteSelected={deleteSelectedFurniture}
              />
            )}

            {(activeTool === "layers" || activeTool === "settings") && (
              <section className="panel">
                <h2 className="text-base font-bold">資料狀態</h2>
                <p className="calibration-status">{imageInfoText}</p>
                {!uploadedImage && floorplanData.image && (
                  <p className="calibration-status">
                    已恢復資料，但圖片檔案需重新上傳（JSON/LocalStorage 不含圖片內容）。
                  </p>
                )}
                <pre className="json-view">
                  {JSON.stringify(
                    {
                      meta: floorplanData.meta,
                      image: floorplanData.image ?? null,
                      scale: floorplanData.scale ?? null,
                      walls: floorplanData.walls,
                      polygons: floorplanData.polygons,
                      windows: floorplanData.windows,
                      furniture: floorplanData.furniture,
                    },
                    null,
                    2,
                  )}
                </pre>
              </section>
            )}

            {storage.status && (
              <section className={`panel storage-status ${storage.status.type}`}>
                <p>{storage.status.message}</p>
                <button type="button" className="btn btn-link" onClick={storage.clearStatus}>
                  關閉
                </button>
              </section>
            )}
          </aside>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <GeometryPreview
            floorplanData={floorplanData}
            ceilingHeight={ceilingHeight}
            wallThickness={wallThickness}
            cameraHeight={cameraHeight}
            moveSpeed={moveSpeed}
            lookSensitivity={lookSensitivity}
            collisionRadius={collisionRadius}
            showCollisionDebug={showCollisionDebug}
            onCeilingHeightChange={setCeilingHeight}
            onWallThicknessChange={setWallThickness}
            onCameraHeightChange={setCameraHeight}
            onMoveSpeedChange={setMoveSpeed}
            onLookSensitivityChange={setLookSensitivity}
            onCollisionRadiusChange={setCollisionRadius}
            onShowCollisionDebugChange={setShowCollisionDebug}
          />
        </div>
      )}

      <DistanceInputDialog
        isOpen={isDistanceDialogOpen}
        pixelDistance={measurementDistancePx}
        onConfirm={onConfirmDistance}
        onCancel={onCancelDistance}
      />
    </main>
  );
}

