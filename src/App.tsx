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

const CONTINUOUS_WALL_ICON = new URL("../resources/icons/continuous-wall.svg", import.meta.url).href;
const SINGLE_SECTION_WALL_ICON = new URL(
  "../resources/icons/single-section-wall.svg",
  import.meta.url,
).href;
const WINDOW_NORMAL_ICON = new URL("../resources/icons/window.svg", import.meta.url).href;
const WINDOW_FLOOR_ICON = new URL(
  "../resources/icons/floor-to-ceiling-window.svg",
  import.meta.url,
).href;
const WINDOW_TRANSOM_ICON = new URL("../resources/icons/transom.svg", import.meta.url).href;
const WINDOW_BALCONY_ICON = new URL("../resources/icons/balcony.svg", import.meta.url).href;

const nowIso = () => new Date().toISOString();
type ViewMode = "design" | "viewer";
type TopMenu = "file" | "edit" | "view";
type ToolMode = "upload" | "calibrate" | "wall" | "window" | "furniture";
type ToolIcon =
  | { kind: "material"; name: string }
  | { kind: "svg"; src: string };
type LayerVisibilityState = {
  image: boolean;
  walls: boolean;
  windows: boolean;
  furniture: boolean;
};

const TOOL_ITEMS: Array<{ key: ToolMode; label: string }> = [
  { key: "upload", label: "上傳" },
  { key: "calibrate", label: "校正" },
  { key: "wall", label: "牆線" },
  { key: "window", label: "窗戶" },
  { key: "furniture", label: "家具" },
];

const WINDOW_TYPE_OPTIONS: Array<{ type: WindowType; label: string; iconSrc: string }> = [
  { type: "floor", label: "落地窗", iconSrc: WINDOW_FLOOR_ICON },
  { type: "normal", label: "一般窗", iconSrc: WINDOW_NORMAL_ICON },
  { type: "high", label: "氣窗", iconSrc: WINDOW_TRANSOM_ICON },
  { type: "balcony", label: "陽台窗", iconSrc: WINDOW_BALCONY_ICON },
];

const WALL_DRAW_MODE_OPTIONS = [
  {
    key: "continuous",
    label: "連續牆體",
    iconSrc: CONTINUOUS_WALL_ICON,
    continuous: true,
  },
  {
    key: "single",
    label: "單段式牆體",
    iconSrc: SINGLE_SECTION_WALL_ICON,
    continuous: false,
  },
] as const;

const DEFAULT_LAYER_VISIBILITY: LayerVisibilityState = {
  image: true,
  walls: true,
  windows: true,
  furniture: true,
};

function SvgIconImage({ src, className }: { src: string; className: string }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      className={`inline-block shrink-0 select-none svg-icon-invert ${className}`}
    />
  );
}

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
  const toolSidebarRef = useRef<HTMLElement>(null);
  const topMenuRef = useRef<HTMLElement>(null);

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
  const [openTopMenu, setOpenTopMenu] = useState<TopMenu | null>(null);
  const [openToolVariantMenu, setOpenToolVariantMenu] = useState<"wall" | "window" | null>(null);
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
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!toolSidebarRef.current?.contains(target)) {
        setOpenToolVariantMenu(null);
      }
      if (!topMenuRef.current?.contains(target)) {
        setOpenTopMenu(null);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    setOpenTopMenu(null);
    if (activeView !== "design") {
      setOpenToolVariantMenu(null);
    }
  }, [activeView]);

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

  const activeWindowOption =
    WINDOW_TYPE_OPTIONS.find((option) => option.type === windowMarking.selectedType) ??
    WINDOW_TYPE_OPTIONS[1];
  const activeWindowTypeLabel = activeWindowOption.label;

  const activeWallOption =
    WALL_DRAW_MODE_OPTIONS.find((option) => option.continuous === wallDrawing.isContinuousMode) ??
    WALL_DRAW_MODE_OPTIONS[0];
  const activeWallDrawModeLabel = activeWallOption.label;

  const layerLabelMap: Record<keyof LayerVisibilityState, string> = {
    image: "底圖",
    walls: "牆線",
    windows: "窗戶",
    furniture: "家具",
  };

  const sidebarToolIcons: Record<ToolMode, ToolIcon> = {
    upload: { kind: "material", name: "add_photo_alternate" },
    calibrate: { kind: "material", name: "straighten" },
    wall: { kind: "svg", src: activeWallOption.iconSrc },
    window: { kind: "svg", src: activeWindowOption.iconSrc },
    furniture: { kind: "material", name: "chair" },
  };

  const handleToolButtonClick = (tool: ToolMode) => {
    setOpenToolVariantMenu(null);
    setActiveTool(tool);
    if (tool === "furniture") {
      setIsFurnitureDrawerOpen((previous) => (activeTool === "furniture" ? !previous : true));
    }
  };

  const handleVariantTriggerClick = (tool: "wall" | "window") => {
    setActiveTool(tool);
    setOpenToolVariantMenu((previous) => (previous === tool ? null : tool));
  };

  const toggleTopMenu = (menu: TopMenu) => {
    setOpenTopMenu((previous) => (previous === menu ? null : menu));
  };
  const topMenuItemClass =
    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";
  const topMenuGroupTitleClass = "px-3 pb-1 pt-2 text-[11px] uppercase tracking-wide text-slate-400";

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
          <span className="rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs text-primary">
            模式：{activeWallDrawModeLabel}
          </span>
          <span className="text-xs text-slate-400">可由左側牆體工具子選單切換</span>
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
          <span className="rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs text-primary">
            窗型：{activeWindowTypeLabel}
          </span>
          <span className="text-xs text-slate-400">可由左側窗戶工具子選單切換</span>
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

    return null;
  })();

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-background-dark text-slate-100">
      <header className="relative z-50 flex h-10 items-center border-b border-black bg-surface-darker px-4 text-[13px] text-slate-300">
        <div className="mr-6 flex items-center gap-2 text-white">
          <span className="material-symbols-outlined text-[20px] text-primary">layers</span>
          <span className="text-base font-bold tracking-tight">SpatialPlanner</span>
        </div>
        <nav ref={topMenuRef} className="hidden items-center gap-1 md:flex">
          <div className="relative">
            <button
              type="button"
              className={`rounded px-3 py-1 transition-colors ${
                openTopMenu === "file" ? "bg-white/15 text-white" : "hover:bg-white/10"
              }`}
              onClick={() => toggleTopMenu("file")}
            >
              File
            </button>
            {openTopMenu === "file" && (
              <div className="absolute left-0 top-full z-[70] mt-1 min-w-[220px] overflow-hidden rounded-lg border border-border-dark bg-surface-dark py-1 shadow-panel">
                <button
                  type="button"
                  className={topMenuItemClass}
                  onClick={() => {
                    jsonImportInputRef.current?.click();
                    setOpenTopMenu(null);
                  }}
                >
                  匯入 JSON
                </button>
                <button
                  type="button"
                  className={topMenuItemClass}
                  onClick={() => {
                    storage.exportJSON();
                    setOpenTopMenu(null);
                  }}
                >
                  匯出 JSON
                </button>
                <div className="my-1 h-px bg-white/10" />
                <button
                  type="button"
                  className={`${topMenuItemClass} text-rose-200 hover:bg-rose-500/10`}
                  onClick={() => {
                    handleClearLocalData();
                    setOpenTopMenu(null);
                  }}
                >
                  清除本地資料
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              className={`rounded px-3 py-1 transition-colors ${
                openTopMenu === "edit" ? "bg-white/15 text-white" : "hover:bg-white/10"
              }`}
              onClick={() => toggleTopMenu("edit")}
            >
              Edit
            </button>
            {openTopMenu === "edit" && (
              <div className="absolute left-0 top-full z-[70] mt-1 min-w-[240px] overflow-hidden rounded-lg border border-border-dark bg-surface-dark py-1 shadow-panel">
                <button
                  type="button"
                  className={topMenuItemClass}
                  onClick={() => {
                    setEnableSnapping((previous) => !previous);
                    setOpenTopMenu(null);
                  }}
                >
                  <span className="w-4 text-primary">{enableSnapping ? "✓" : ""}</span>
                  <span>啟用吸附</span>
                </button>
                <div className="my-1 h-px bg-white/10" />
                <p className={topMenuGroupTitleClass}>牆線工具</p>
                <button
                  type="button"
                  className={topMenuItemClass}
                  onClick={() => {
                    wallDrawing.undo();
                    setOpenTopMenu(null);
                  }}
                  disabled={!wallDrawing.canUndo}
                >
                  Undo
                </button>
                <button
                  type="button"
                  className={topMenuItemClass}
                  onClick={() => {
                    wallDrawing.redo();
                    setOpenTopMenu(null);
                  }}
                  disabled={!wallDrawing.canRedo}
                >
                  Redo
                </button>
                <button
                  type="button"
                  className={`${topMenuItemClass} text-rose-200 hover:bg-rose-500/10`}
                  onClick={() => {
                    if (!wallDrawing.selectedWallId) return;
                    wallDrawing.deleteWall(wallDrawing.selectedWallId);
                    setOpenTopMenu(null);
                  }}
                  disabled={!wallDrawing.selectedWallId}
                >
                  刪除選取牆段
                </button>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              className={`rounded px-3 py-1 transition-colors ${
                openTopMenu === "view" ? "bg-white/15 text-white" : "hover:bg-white/10"
              }`}
              onClick={() => toggleTopMenu("view")}
            >
              View
            </button>
            {openTopMenu === "view" && (
              <div className="absolute left-0 top-full z-[70] mt-1 min-w-[260px] overflow-hidden rounded-lg border border-border-dark bg-surface-dark py-1 shadow-panel">
                <button
                  type="button"
                  className={topMenuItemClass}
                  onClick={() => {
                    setShowCanvasHint((previous) => !previous);
                    setOpenTopMenu(null);
                  }}
                >
                  <span className="w-4 text-primary">{showCanvasHint ? "✓" : ""}</span>
                  <span>顯示畫布提示</span>
                </button>
                {import.meta.env.DEV && (
                  <button
                    type="button"
                    className={topMenuItemClass}
                    onClick={() => {
                      setIsDevJsonVisible((previous) => !previous);
                      setOpenTopMenu(null);
                    }}
                  >
                    <span className="w-4 text-primary">{isDevJsonVisible ? "✓" : ""}</span>
                    <span>顯示開發 JSON</span>
                  </button>
                )}
                <div className="my-1 h-px bg-white/10" />
                <p className={topMenuGroupTitleClass}>圖層工具</p>
                {(Object.keys(layerVisibility) as Array<keyof LayerVisibilityState>).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={topMenuItemClass}
                    onClick={() => {
                      toggleLayer(key);
                      setOpenTopMenu(null);
                    }}
                  >
                    <span className="w-4 text-primary">{layerVisibility[key] ? "✓" : ""}</span>
                    <span>{layerLabelMap[key]}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className={topMenuItemClass}
                  onClick={() => {
                    setLayerVisibility(DEFAULT_LAYER_VISIBILITY);
                    setOpenTopMenu(null);
                  }}
                >
                  重設圖層
                </button>
                <div className="my-1 h-px bg-white/10" />
                <p className={topMenuGroupTitleClass}>視圖切換</p>
                <button
                  type="button"
                  className={topMenuItemClass}
                  onClick={() => {
                    setActiveView("design");
                    setOpenTopMenu(null);
                  }}
                >
                  <span className="w-4 text-primary">{activeView === "design" ? "✓" : ""}</span>
                  <span>切換到 2D</span>
                </button>
                <button
                  type="button"
                  className={topMenuItemClass}
                  onClick={() => {
                    setActiveView("viewer");
                    setOpenTopMenu(null);
                  }}
                >
                  <span className="w-4 text-primary">{activeView === "viewer" ? "✓" : ""}</span>
                  <span>切換到 3D</span>
                </button>
              </div>
            )}
          </div>
        </nav>
        <div className="ml-auto flex h-full items-center">
          <div className="segmented-control min-w-[140px]">
            <div className={`segmented-pill ${activeView === "viewer" ? "viewer" : ""}`} />
            <button
              type="button"
              className={`relative z-10 flex-1 px-4 text-[12px] transition-colors ${
                activeView === "design"
                  ? "font-bold text-slate-900"
                  : "font-semibold text-slate-500 hover:text-slate-300"
              }`}
              onClick={() => setActiveView("design")}
            >
              2D
            </button>
            <button
              type="button"
              className={`relative z-10 flex-1 px-4 text-[12px] transition-colors ${
                activeView === "viewer"
                  ? "font-bold text-slate-900"
                  : "font-semibold text-slate-500 hover:text-slate-300"
              }`}
              onClick={() => setActiveView("viewer")}
            >
              3D
            </button>
          </div>
        </div>
      </header>

      {activeView === "design" ? (
        <>
          <div className="z-40 flex h-12 items-center overflow-x-auto border-b border-black bg-surface-dark px-4 text-[13px]">
            <div className="flex min-w-max items-center gap-4">{contextToolbar}</div>
          </div>
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <aside
              ref={toolSidebarRef}
              className="z-30 flex w-[72px] shrink-0 flex-col items-center border-r border-black bg-surface-dark py-2"
            >
              <div className="flex w-full flex-col gap-1 px-1">
                {TOOL_ITEMS.map((item) => {
                  const hasVariants = item.key === "wall" || item.key === "window";
                  const isActive = activeTool === item.key;
                  const toolIcon = sidebarToolIcons[item.key];
                  const isVariantMenuOpen =
                    (item.key === "wall" || item.key === "window") &&
                    openToolVariantMenu === item.key;

                  return (
                    <div key={item.key} className="relative">
                      <button
                        type="button"
                        title={item.label}
                        className={`relative flex h-14 w-full items-center justify-center rounded-lg transition-colors ${
                          isActive
                            ? "bg-primary text-icon-active shadow-lg"
                            : "text-icon-inactive hover:bg-white/10 hover:text-icon-active"
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleToolButtonClick(item.key);
                        }}
                      >
                        {toolIcon.kind === "material" ? (
                          <span className="material-symbols-outlined text-[28px]">{toolIcon.name}</span>
                        ) : (
                          <SvgIconImage
                            src={toolIcon.src}
                            className={`h-7 w-7 ${isActive ? "opacity-100" : "opacity-75"}`}
                          />
                        )}
                      </button>
                      {hasVariants && (
                        <button
                          type="button"
                          aria-label={`${item.label} 子功能`}
                          className={`absolute bottom-1 right-1 z-20 flex h-4 w-4 items-center justify-center rounded-sm transition ${
                            isVariantMenuOpen ? "bg-white/20" : "hover:bg-white/15"
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (item.key === "wall" || item.key === "window") {
                              handleVariantTriggerClick(item.key);
                            }
                          }}
                        >
                          <span
                            className={`text-[10px] leading-none ${
                              isActive || isVariantMenuOpen ? "text-white" : "text-icon-inactive"
                            }`}
                          >
                            ▾
                          </span>
                        </button>
                      )}

                      {item.key === "wall" && openToolVariantMenu === "wall" && (
                        <div className="flyout-menu absolute left-[76px] top-0 z-50 flex min-w-[210px] flex-col overflow-hidden rounded-lg border border-border-dark bg-surface-dark">
                          {WALL_DRAW_MODE_OPTIONS.map((option) => {
                            const selected = wallDrawing.isContinuousMode === option.continuous;
                            return (
                              <button
                                key={option.key}
                                type="button"
                                className={`flex items-center gap-3 px-4 py-3 text-left text-[13px] transition ${
                                  selected ? "bg-primary text-white" : "text-white hover:bg-white/10"
                                }`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActiveTool("wall");
                                  wallDrawing.setContinuousMode(option.continuous);
                                  setOpenToolVariantMenu(null);
                                }}
                              >
                                <SvgIconImage src={option.iconSrc} className="h-5 w-5 opacity-100" />
                                <span className="flex-1 font-medium">{option.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {item.key === "window" && openToolVariantMenu === "window" && (
                        <div className="flyout-menu absolute left-[76px] top-0 z-50 flex min-w-[210px] flex-col overflow-hidden rounded-lg border border-border-dark bg-surface-dark">
                          {WINDOW_TYPE_OPTIONS.map((option) => {
                            const selected = windowMarking.selectedType === option.type;
                            return (
                              <button
                                key={option.type}
                                type="button"
                                className={`flex items-center gap-3 px-4 py-3 text-left text-[13px] transition ${
                                  selected ? "bg-primary text-white" : "text-white hover:bg-white/10"
                                }`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActiveTool("window");
                                  windowMarking.setWindowType(option.type);
                                  setOpenToolVariantMenu(null);
                                }}
                              >
                                <SvgIconImage src={option.iconSrc} className="h-5 w-5 opacity-100" />
                                <span className="flex-1 font-medium">{option.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>

          <section className="relative flex min-w-0 flex-1 overflow-hidden bg-[#0a0a0a]">
            <div className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-[0.08]" />
            <Canvas
              className="relative z-10 h-full w-full"
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

            {activeTool === "upload" && !uploadedImage && (
              <section
                className={`absolute left-1/2 top-6 z-30 w-[420px] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl border border-border-dark bg-surface-dark/95 p-4 shadow-panel backdrop-blur ${
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
              <aside className="absolute bottom-4 right-4 top-4 z-30 w-[380px] overflow-y-auto rounded-xl border border-border-dark bg-surface-darker/95 p-3 shadow-panel backdrop-blur">
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
                className={`absolute bottom-4 right-4 z-40 flex max-w-[460px] items-center gap-3 rounded-lg px-3 py-2 text-sm ${
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
        <footer className="z-50 flex h-8 items-center justify-between border-t border-black bg-surface-darker px-4 text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <span>
              X: {canvasStatus.cursor ? canvasStatus.cursor.x.toFixed(0) : "--"} Y:{" "}
              {canvasStatus.cursor ? canvasStatus.cursor.y.toFixed(0) : "--"}
            </span>
            <span>Unit: Metric</span>
          </div>
          <span className="font-mono">{canvasStatus.zoomPercent}%</span>
        </footer>
      </>
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

