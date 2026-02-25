import { useMemo, useState } from "react";
import { FURNITURE_CATALOG_ITEMS } from "../furniture/catalog";
import type { FurnitureCatalogId } from "../types/floorplan";

interface FurniturePanelProps {
  canPlace: boolean;
  furnitureCount: number;
  selectedFurnitureId: string | null;
  onClose?: () => void;
  onAddFurniture: (catalogId: FurnitureCatalogId) => void;
  onRotateSelected: (deltaDeg: number) => void;
  onDeleteSelected: () => void;
}

export function FurniturePanel({
  canPlace,
  furnitureCount,
  selectedFurnitureId,
  onClose,
  onAddFurniture,
  onRotateSelected,
  onDeleteSelected,
}: FurniturePanelProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"all" | "bed" | "sofa">("all");

  const categories = useMemo(() => {
    const set = new Set<"bed" | "sofa">();
    for (const item of FURNITURE_CATALOG_ITEMS) {
      if (item.category === "bed" || item.category === "sofa") set.add(item.category);
    }
    return ["all", ...Array.from(set)] as const;
  }, []);

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return FURNITURE_CATALOG_ITEMS.filter((item) => {
      if (activeCategory !== "all" && item.category !== activeCategory) return false;
      if (!keyword) return true;
      const haystack = [item.label, item.category, ...item.tags].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [activeCategory, query]);

  return (
    <section className="panel">
      <div className="flex items-start justify-between gap-2">
        <h2>家具放置</h2>
        {onClose && (
          <button
            type="button"
            className="rounded-md border border-border-dark bg-surface-dark px-1.5 py-1 text-slate-300 transition hover:border-primary hover:text-white"
            title="關閉家具視窗"
            onClick={onClose}
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        )}
      </div>
      <p className="calibration-status">搜尋家具並加入畫布，2D/3D 會同步。</p>

      <div className="mb-3">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜尋家具（例：bed、sofa）"
          className="w-full rounded-md border border-border-dark bg-background-dark px-3 py-2 text-sm text-slate-100"
          disabled={!canPlace}
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            className={`rounded-md border px-2 py-1 text-xs ${
              activeCategory === category
                ? "border-primary bg-primary/20 text-primary"
                : "border-border-dark text-slate-300"
            }`}
            disabled={!canPlace}
          >
            {category === "all" ? "全部" : category === "bed" ? "床" : "沙發"}
          </button>
        ))}
      </div>

      <div className="mb-3 max-h-60 space-y-2 overflow-y-auto rounded-md border border-border-dark p-2">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border-dark bg-background-dark/50 p-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  alt={item.label}
                  className="size-10 rounded object-cover"
                />
              ) : (
                <div className="flex size-10 items-center justify-center rounded bg-surface-dark text-[10px] text-slate-400">
                  3D
                </div>
              )}
              <div className="min-w-0">
              <p className="truncate text-sm text-slate-100">{item.label}</p>
              <p className="text-[11px] text-slate-400">
                {item.category} · {item.footprint.width.toFixed(2)}m x {item.footprint.depth.toFixed(2)}m
              </p>
              </div>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => onAddFurniture(item.id)}
              disabled={!canPlace}
            >
              新增
            </button>
          </div>
        ))}
        {filteredItems.length === 0 && (
          <p className="text-xs text-slate-400">找不到符合條件的家具。</p>
        )}
      </div>

      <div className="wall-actions">
        <button
          type="button"
          className="btn"
          onClick={() => onRotateSelected(-15)}
          disabled={!selectedFurnitureId}
        >
          左轉 15°
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => onRotateSelected(15)}
          disabled={!selectedFurnitureId}
        >
          右轉 15°
        </button>
        <button
          type="button"
          className="btn btn-link"
          onClick={onDeleteSelected}
          disabled={!selectedFurnitureId}
        >
          刪除選取家具
        </button>
      </div>

      <p className="calibration-status">家具數量：{furnitureCount}</p>
      <p className="calibration-status">
        {selectedFurnitureId ? `已選取：${selectedFurnitureId}` : "尚未選取家具"}
      </p>
      {!canPlace && <p className="calibration-status">請先上傳圖片並完成比例尺校正。</p>}
    </section>
  );
}
