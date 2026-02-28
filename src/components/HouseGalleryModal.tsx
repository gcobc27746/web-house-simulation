import { useState } from "react";
import { decodeHouseData, readPngMetadata } from "../utils/pngMetadata";
import { validateFloorplanData } from "../utils/dataValidator";
import type { FloorplanData } from "../types/floorplan";

// Enumerate all map images at build time (relative to this file: src/components/)
const MAP_MODULES = import.meta.glob<string>("../../resources/maps/*.{png,jpg,jpeg,PNG,JPG}", {
  query: "?url",
  import: "default",
  eager: true,
});

interface MapEntry {
  url: string;
  filename: string;
  name: string;
}

const MAP_ENTRIES: MapEntry[] = Object.entries(MAP_MODULES).map(([path, url]) => {
  const filename = path.split("/").pop() ?? path;
  const name = filename.replace(/\.[^.]+$/, "");
  return { url, filename, name };
});

export interface GalleryLoadResult {
  image: HTMLImageElement;
  filename: string;
  width: number;
  height: number;
  floorplanData?: FloorplanData;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (result: GalleryLoadResult) => void;
}

export function HouseGalleryModal({ isOpen, onClose, onSelect }: Props) {
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelect = async (entry: MapEntry) => {
    setLoadingFile(entry.filename);
    setError(null);
    try {
      const response = await fetch(entry.url);
      if (!response.ok) throw new Error("無法取得圖片");
      const blob = await response.blob();

      // Attempt to read embedded FloorplanData from PNG tEXt chunk
      let floorplanData: FloorplanData | undefined;
      const raw = await readPngMetadata(blob, "house_data");
      if (raw) {
        const decoded = decodeHouseData(raw);
        try {
          const parsed: unknown = JSON.parse(decoded);
          if (validateFloorplanData(parsed)) {
            floorplanData = parsed;
          }
        } catch {
          // metadata exists but is not FloorplanData — ignore
        }
      }

      // Load the image element
      const imgUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        onSelect({
          image: img,
          filename: entry.filename,
          width: img.naturalWidth,
          height: img.naturalHeight,
          floorplanData,
        });
        setLoadingFile(null);
      };
      img.onerror = () => {
        setError("圖片載入失敗");
        setLoadingFile(null);
      };
      img.src = imgUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
      setLoadingFile(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex w-[680px] max-w-[95vw] max-h-[80vh] flex-col rounded-2xl border border-border-dark bg-surface-darker shadow-panel">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-dark px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">home</span>
            <h2 className="text-base font-semibold text-white">房屋圖庫</h2>
            {MAP_ENTRIES.length > 0 && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300">
                {MAP_ENTRIES.length} 張
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label="關閉"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {MAP_ENTRIES.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <span className="material-symbols-outlined text-5xl mb-3">image_not_supported</span>
              <p className="text-sm">resources/maps 資料夾中尚無圖片</p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-slate-400">
                點選圖片以載入底圖；若圖片含有房屋元數據，將同時恢復平面圖資料。
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {MAP_ENTRIES.map((entry) => (
                  <button
                    key={entry.filename}
                    type="button"
                    disabled={loadingFile !== null}
                    onClick={() => handleSelect(entry)}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-border-dark bg-background-dark transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                  >
                    <img
                      src={entry.url}
                      alt={entry.name}
                      className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-2">
                      <p className="truncate text-left text-xs font-medium text-white">
                        {entry.name}
                      </p>
                    </div>
                    {loadingFile === entry.filename && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          {error && (
            <p className="mt-3 text-center text-sm text-rose-300">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
