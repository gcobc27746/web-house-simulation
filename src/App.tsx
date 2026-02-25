import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "./components/Canvas";
import { DistanceInputDialog } from "./components/DistanceInputDialog";
import { FurniturePanel } from "./components/FurniturePanel";
import { getFurnitureCatalogItem } from "./furniture/catalog";
import { useFloorplanStorage } from "./hooks/useFloorplanStorage";
import { type LoadedImagePayload, useImageUpload } from "./hooks/useImageUpload";
import { useScaleCalibration } from "./hooks/useScaleCalibration";
import { useWallDrawing } from "./hooks/useWallDrawing";
import { useWindowMarking } from "./hooks/useWindowMarking";
import { GeometryPreview } from "./step2/viewer/GeometryPreview";
import type {
  FloorplanData,
  FurnitureCatalogId,
  FurnitureItem,
  Point2D,
  WindowType,
} from "./types/floorplan";

const nowIso = () => new Date().toISOString();
type ViewMode = "design" | "viewer";
type ToolMode = "upload" | "calibrate" | "wall" | "window" | "furniture" | "layers" | "settings";
type LayerVisibilityState = {
  image: boolean;
  walls: boolean;
  windows: boolean;
  furniture: boolean;
};

const TOOL_ITEMS: Array<{ key: ToolMode; icon: string; label: string }> = [
  { key: "upload", icon: "add_photo_alternate", label: "上傳" },
  { key: "calibrate", icon: "straighten", label: "校正" },
  { key: "wall", icon: "polyline", label: "牆線" },
  { key: "window", icon: "window", label: "窗戶" },
  { key: "furniture", icon: "chair", label: "家具" },
  { key: "layers", icon: "layers", label: "圖層" },
  { key: "settings", icon: "settings", label: "設定" },
];

const WINDOW_TYPE_OPTIONS: Array<{ type: WindowType; label: string }> = [
  { type: "floor", label: "落地窗" },
  { type: "normal", label: "一般窗" },
  { type: "high", label: "氣窗" },
  { type: "balcony", label: "陽台窗" },
];

const DEFAULT_LAYER_VISIBILITY: LayerVisibilityState = {
  image: true,
  walls: true,
  windows: true,
  furniture: true,
};

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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const jsonImportInputRef = useRef<HTMLInputElement>(null);

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
  const [isFurnitureDrawerOpen, setIsFurnitureDrawerOpen] = useState(false);
  const [isImageDragging, setIsImageDragging] = useState(false);
  const [showCanvasHint, setShowCanvasHint] = useState(true);
  const [enableSnapping, setEnableSnapping] = useState(true);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibilityState>(
    DEFAULT_LAYER_VISIBILITY,
  );
  const [isDevJsonVisible, setIsDevJsonVisible] = useState(false);
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
  const imageUpload = useImageUpload();

  const resetWorkspaceData = useCallback(() => {
    calibration.resetCalibration();
    wallDrawing.resetWalls();
    windowMarking.resetWindows();
    setFurniture([]);
    setSelectedFurnitureId(null);
    setUploadedImage(null);
    setIsDistanceDialogOpen(false);
    setLayerVisibility(DEFAULT_LAYER_VISIBILITY);
    setFloorplanData(createInitialData());
  }, [calibration, wallDrawing, windowMarking]);

  const applyLoadedData = useCallback(
    (nextData: FloorplanData) => {
      setFloorplanData(nextData);
      calibration.hydrateScale(nextData.scale ?? null);
      wallDrawing.hydrateWalls(nextData.walls);
      windowMarking.hydrateWindows(nextData.windows ?? []);
      setFurniture(nextData.furniture ?? []);
      setSelectedFurnitureId(null);
      setIsDistanceDialogOpen(false);
      setUploadedImage(null);
    },
    [calibration, wallDrawing, windowMarking],
  );

  const storage = useFloorplanStorage(floorplanData, applyLoadedData);

  const handleClearLocalData = useCallback(() => {
    const confirmed = window.confirm("確定要清除本地資料嗎？此動作無法復原。");
    if (!confirmed) return;
    storage.clearStorage();
    resetWorkspaceData();
  }, [resetWorkspaceData, storage]);

  const onJsonImportChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    storage.importJSON(file);
    event.target.value = "";
  };

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

  const handleImageFile = async (file: File) => {
    const payload = await imageUpload.loadFile(file);
    if (!payload) return;
    onImageLoaded(payload);
  };

  const onImageInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleImageFile(file);
    event.target.value = "";
  };

  const onImageDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsImageDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handleImageFile(file);
  };

  const onImageDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsImageDragging(true);
  };

  const onImageDragLeave = () => {
    setIsImageDragging(false);
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
    if (activeTool === "furniture") {
      setIsFurnitureDrawerOpen(true);
    }
  }, [activeTool]);

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

  const debugJsonText = useMemo(
    () =>
      JSON.stringify(
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
      ),
    [floorplanData],
  );

  const toggleLayer = (key: keyof LayerVisibilityState) => {
    setLayerVisibility((previous) => ({ ...previous, [key]: !previous[key] }));
  };

  const contextToolbar = (() => {
    if (activeTool === "upload") {
      return (
        <>
          <button
            type="button"
            className="btn h-8 px-3 py-0 text-xs"
            onClick={() => imageInputRef.current?.click()}
          >
            選擇圖片
          </button>
          <span className="text-xs text-slate-300">支援 JPG / PNG，建議小於 10MB</span>
          <span className="text-xs text-slate-400">{imageInfoText}</span>
          {!uploadedImage && floorplanData.image && (
            <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
              已恢復資料，請重新上傳原始圖片。
            </span>
          )}
        </>
      );
    }

    if (activeTool === "calibrate") {
      return (
        <>
          <button
            type="button"
            className="btn h-8 px-3 py-0 text-xs"
            onClick={() => {
              wallDrawing.stopDrawing();
              windowMarking.stopWindowMode();
              windowMarking.cancelDraft();
              setIsDistanceDialogOpen(false);
              calibration.startCalibration();
            }}
            disabled={!uploadedImage}
          >
            {calibration.isCalibrationMode ? "重新開始量測" : "開始校正"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-border-dark px-3 py-1.5 text-xs text-slate-200 transition hover:border-primary hover:text-white"
            onClick={onResetCalibration}
          >
            清除校正
          </button>
          <span className="text-xs text-slate-300">
            點位：{calibration.measurementPoints.length}/2
          </span>
          {measurementDistancePx !== null && (
            <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-xs text-primary">
              {measurementDistancePx.toFixed(2)} px
            </span>
          )}
          {calibration.scale && (
            <span className="font-mono text-xs text-slate-200">
              1px = {calibration.scale.pixelsPerMeter.toFixed(4)}m
            </span>
          )}
        </>
      );
    }

    if (activeTool === "wall") {
      return (
        <>
          <button
            type="button"
            className="btn h-8 px-3 py-0 text-xs"
            onClick={() => {
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
            disabled={!uploadedImage || !calibration.scale}
          >
            {wallDrawing.isDrawingMode ? "停止繪製" : "開始繪製"}
          </button>
          <label className="flex items-center gap-2 text-xs text-slate-200">
            <input
              type="checkbox"
              checked={wallDrawing.isContinuousMode}
              onChange={(event) => wallDrawing.setContinuousMode(event.target.checked)}
              disabled={!uploadedImage || !calibration.scale}
            />
            連續繪製
          </label>
          <div className="h-5 w-px bg-white/10" />
          <button
            type="button"
            className="rounded-lg border border-border-dark px-2 py-1.5 text-xs text-slate-200 transition hover:border-primary hover:text-white disabled:opacity-40"
            onClick={wallDrawing.undo}
            disabled={!wallDrawing.canUndo}
          >
            Undo
          </button>
          <button
            type="button"
            className="rounded-lg border border-border-dark px-2 py-1.5 text-xs text-slate-200 transition hover:border-primary hover:text-white disabled:opacity-40"
            onClick={wallDrawing.redo}
            disabled={!wallDrawing.canRedo}
          >
            Redo
          </button>
          <button
            type="button"
            className="rounded-lg border border-rose-500/30 px-2 py-1.5 text-xs text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-40"
            onClick={() => {
              if (!wallDrawing.selectedWallId) return;
              wallDrawing.deleteWall(wallDrawing.selectedWallId);
            }}
            disabled={!wallDrawing.selectedWallId}
          >
            刪除選取牆段
          </button>
          <span className="text-xs text-slate-400">
            牆段：{wallDrawing.walls.length}｜Polygon：{wallDrawing.polygons.length}
          </span>
        </>
      );
    }

    if (activeTool === "window") {
      return (
        <>
          <button
            type="button"
            className="btn h-8 px-3 py-0 text-xs"
            onClick={() => {
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
            disabled={!uploadedImage || !calibration.scale || wallDrawing.walls.length === 0}
          >
            {windowMarking.isWindowMode ? "停止窗戶模式" : "開始窗戶模式"}
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {WINDOW_TYPE_OPTIONS.map((option) => (
              <button
                key={option.type}
                type="button"
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  windowMarking.selectedType === option.type
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-border-dark text-slate-300 hover:border-primary hover:text-white"
                }`}
                onClick={() => windowMarking.setWindowType(option.type)}
                disabled={!uploadedImage || !calibration.scale}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="rounded-lg border border-rose-500/30 px-2 py-1.5 text-xs text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-40"
            onClick={() => {
              if (!windowMarking.selectedWindowId) return;
              windowMarking.deleteWindow(windowMarking.selectedWindowId);
            }}
            disabled={!windowMarking.selectedWindowId}
          >
            刪除選取窗戶
          </button>
          <span className="text-xs text-slate-400">窗戶：{windowMarking.windows.length}</span>
        </>
      );
    }

    if (activeTool === "furniture") {
      return (
        <>
          <button
            type="button"
            className="btn h-8 px-3 py-0 text-xs"
            onClick={() => setIsFurnitureDrawerOpen((previous) => !previous)}
            disabled={!uploadedImage || !calibration.scale}
          >
            {isFurnitureDrawerOpen ? "收合家具抽屜" : "開啟家具抽屜"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-border-dark px-2 py-1.5 text-xs text-slate-200 transition hover:border-primary hover:text-white disabled:opacity-40"
            onClick={() => rotateSelectedFurniture(-15)}
            disabled={!selectedFurnitureId}
          >
            左轉 15°
          </button>
          <button
            type="button"
            className="rounded-lg border border-border-dark px-2 py-1.5 text-xs text-slate-200 transition hover:border-primary hover:text-white disabled:opacity-40"
            onClick={() => rotateSelectedFurniture(15)}
            disabled={!selectedFurnitureId}
          >
            右轉 15°
          </button>
          <button
            type="button"
            className="rounded-lg border border-rose-500/30 px-2 py-1.5 text-xs text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-40"
            onClick={deleteSelectedFurniture}
            disabled={!selectedFurnitureId}
          >
            刪除選取家具
          </button>
          <span className="text-xs text-slate-400">家具：{furniture.length}</span>
        </>
      );
    }

    if (activeTool === "layers") {
      return (
        <>
          <span className="text-xs text-slate-300">圖層顯示</span>
          {(Object.keys(layerVisibility) as Array<keyof LayerVisibilityState>).map((key) => (
            <button
              key={key}
              type="button"
              className={`rounded-full border px-3 py-1 text-xs transition ${
                layerVisibility[key]
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border-dark text-slate-300 hover:border-primary hover:text-white"
              }`}
              onClick={() => toggleLayer(key)}
            >
              {key === "image"
                ? "底圖"
                : key === "walls"
                  ? "牆線"
                  : key === "windows"
                    ? "窗戶"
                    : "家具"}
            </button>
          ))}
          <button
            type="button"
            className="rounded-lg border border-border-dark px-3 py-1.5 text-xs text-slate-200 transition hover:border-primary hover:text-white"
            onClick={() => setLayerVisibility(DEFAULT_LAYER_VISIBILITY)}
          >
            重設圖層
          </button>
        </>
      );
    }

    return (
      <>
        <label className="flex items-center gap-2 text-xs text-slate-200">
          <input
            type="checkbox"
            checked={enableSnapping}
            onChange={(event) => setEnableSnapping(event.target.checked)}
          />
          啟用吸附
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-200">
          <input
            type="checkbox"
            checked={showCanvasHint}
            onChange={(event) => setShowCanvasHint(event.target.checked)}
          />
          顯示畫布提示
        </label>
        <button
          type="button"
          className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-200 transition hover:bg-rose-500/10"
          onClick={handleClearLocalData}
        >
          清除本地資料
        </button>
        {import.meta.env.DEV && (
          <button
            type="button"
            className="rounded-lg border border-border-dark px-3 py-1.5 text-xs text-slate-200 transition hover:border-primary hover:text-white"
            onClick={() => setIsDevJsonVisible((previous) => !previous)}
          >
            {isDevJsonVisible ? "隱藏開發 JSON" : "顯示開發 JSON"}
          </button>
        )}
      </>
    );
  })();

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-background-dark text-slate-100">
      <header className="relative z-40 flex items-center justify-between border-b border-border-dark bg-surface-darker px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
            <span className="material-symbols-outlined">architecture</span>
          </div>
          <div>
            <h1 className="text-base font-bold">SpatialPlanner</h1>
            <p className="text-xs text-slate-400">Project: Floorplan Simulation</p>
          </div>
        </div>
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="pointer-events-auto rounded-lg border border-border-dark bg-surface-dark p-1">
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
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-border-dark px-3 py-2 text-sm text-slate-200 transition hover:border-primary hover:text-white"
            onClick={() => jsonImportInputRef.current?.click()}
          >
            匯入 JSON
          </button>
          <button
            type="button"
            className="rounded-lg border border-border-dark px-3 py-2 text-sm text-slate-200 transition hover:border-primary hover:text-white"
            onClick={storage.exportJSON}
          >
            匯出 JSON
          </button>
        </div>
      </header>

      {activeView === "design" ? (
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[76px] flex-col items-center border-r border-border-dark bg-surface-darker py-3">
            {TOOL_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                title={item.label}
                className={`mb-1 flex h-12 w-12 items-center justify-center rounded-xl transition ${
                  activeTool === item.key
                    ? "bg-primary text-white shadow-lg shadow-primary/30"
                    : "text-slate-400 hover:bg-surface-dark hover:text-white"
                }`}
                onClick={() => setActiveTool(item.key)}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
              </button>
            ))}
          </aside>

          <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0d1218]">
            <div className="flex min-h-12 items-center gap-3 overflow-x-auto border-b border-border-dark bg-surface-dark px-4">
              <div className="flex min-w-0 items-center gap-3">{contextToolbar}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <Canvas
                className="h-full"
                image={uploadedImage}
                layerVisibility={layerVisibility}
                enableSnapping={enableSnapping}
                showHintBar={showCanvasHint}
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

            {activeTool === "upload" && !uploadedImage && (
              <section
                className={`absolute left-1/2 top-20 z-30 w-[420px] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl border border-border-dark bg-surface-dark/95 p-4 shadow-panel backdrop-blur ${
                  isImageDragging ? "border-primary" : ""
                }`}
                onDrop={onImageDrop}
                onDragOver={onImageDragOver}
                onDragLeave={onImageDragLeave}
              >
                <p className="text-sm font-semibold text-slate-100">拖放圖片快速上傳</p>
                <p className="mt-1 text-xs text-slate-400">也可使用上方工具列按鈕選擇檔案。</p>
                <button
                  type="button"
                  className="btn mt-3 h-8 px-3 py-0 text-xs"
                  onClick={() => imageInputRef.current?.click()}
                >
                  選擇圖片
                </button>
                {imageUpload.error && (
                  <div className="mt-3 rounded-lg border border-rose-600/30 bg-rose-600/10 px-2 py-1 text-xs text-rose-200">
                    {imageUpload.error}
                    <button
                      type="button"
                      className="ml-2 text-rose-100 underline"
                      onClick={() => imageUpload.setError(null)}
                    >
                      關閉
                    </button>
                  </div>
                )}
              </section>
            )}

            {activeTool === "furniture" && isFurnitureDrawerOpen && (
              <aside className="absolute bottom-12 right-4 top-16 z-30 w-[380px] overflow-y-auto rounded-xl border border-border-dark bg-surface-darker/95 p-3 shadow-panel backdrop-blur">
                <FurniturePanel
                  canPlace={Boolean(uploadedImage && calibration.scale)}
                  furnitureCount={furniture.length}
                  selectedFurnitureId={selectedFurnitureId}
                  onClose={() => setIsFurnitureDrawerOpen(false)}
                  onAddFurniture={addFurniture}
                  onRotateSelected={rotateSelectedFurniture}
                  onDeleteSelected={deleteSelectedFurniture}
                />
              </aside>
            )}

            {import.meta.env.DEV && isDevJsonVisible && (
              <aside className="absolute bottom-12 right-4 z-40 w-[420px] rounded-xl border border-primary/30 bg-[#0b1320]/95 p-4 shadow-panel backdrop-blur">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-primary">開發模式 JSON Viewer</h2>
                  <button
                    type="button"
                    className="text-xs text-slate-300 hover:text-white"
                    onClick={() => setIsDevJsonVisible(false)}
                  >
                    關閉
                  </button>
                </div>
                <pre className="json-view max-h-[320px]">{debugJsonText}</pre>
              </aside>
            )}

            {storage.status && (
              <section
                className={`absolute bottom-12 left-4 z-40 rounded-lg px-3 py-2 text-sm ${
                  storage.status.type === "success"
                    ? "border border-emerald-700/30 bg-emerald-900/20 text-emerald-200"
                    : "border border-rose-700/30 bg-rose-900/20 text-rose-200"
                }`}
              >
                <p className="inline">{storage.status.message}</p>
                <button type="button" className="btn btn-link" onClick={storage.clearStatus}>
                  關閉
                </button>
              </section>
            )}

            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden-input"
              onChange={onImageInputChange}
            />
          </section>
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

      <input
        ref={jsonImportInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden-input"
        onChange={onJsonImportChange}
      />

      <DistanceInputDialog
        isOpen={isDistanceDialogOpen}
        pixelDistance={measurementDistancePx}
        onConfirm={onConfirmDistance}
        onCancel={onCancelDistance}
      />
    </main>
  );
}

