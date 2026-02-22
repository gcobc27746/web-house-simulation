import { useCallback, useEffect, useRef, useState } from "react";
import type { FloorplanData } from "../types/floorplan";
import { validateFloorplanData } from "../utils/dataValidator";
import { FURNITURE_CATALOG_ITEMS } from "../furniture/catalog";

const STORAGE_KEY = "floorplan-editor-data";

type StorageStatus = {
  type: "success" | "error";
  message: string;
} | null;

const withUpdatedAt = (data: FloorplanData): FloorplanData => ({
  ...data,
  meta: {
    ...data.meta,
    updatedAt: new Date().toISOString(),
  },
});

const normalizeFloorplanData = (data: FloorplanData): FloorplanData => ({
  ...data,
  windows: data.windows ?? [],
  furniture: (data.furniture ?? []).map((item) => {
    const legacyType = (item as unknown as { type?: string }).type;
    if (!item.catalogId && legacyType === "bed") {
      return {
        ...item,
        catalogId: FURNITURE_CATALOG_ITEMS[0]?.id ?? "bed-fullsize-black-v1",
      };
    }
    return item;
  }),
});

export function useFloorplanStorage(
  data: FloorplanData,
  setData: (data: FloorplanData) => void,
) {
  const [status, setStatus] = useState<StorageStatus>(null);
  const hasLoadedRef = useRef(false);
  const setDataRef = useRef(setData);

  useEffect(() => {
    setDataRef.current = setData;
  }, [setData]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        hasLoadedRef.current = true;
        return;
      }

      const parsed = JSON.parse(saved) as unknown;
      if (!validateFloorplanData(parsed)) {
        setStatus({ type: "error", message: "LocalStorage 資料格式不正確，已忽略。" });
        hasLoadedRef.current = true;
        return;
      }

      setDataRef.current(normalizeFloorplanData(parsed));
      setStatus({ type: "success", message: "已從 LocalStorage 恢復資料。" });
    } catch {
      setStatus({ type: "error", message: "讀取 LocalStorage 失敗。" });
    } finally {
      hasLoadedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) return;

    const timeoutId = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(withUpdatedAt(data)));
      } catch {
        setStatus({ type: "error", message: "自動儲存失敗，請確認瀏覽器空間。" });
      }
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [data]);

  const exportJSON = useCallback(() => {
    try {
      const exportData = withUpdatedAt(data);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `floorplan-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setStatus({ type: "success", message: "JSON 匯出成功。" });
    } catch {
      setStatus({ type: "error", message: "JSON 匯出失敗。" });
    }
  }, [data]);

  const importJSON = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          if (!validateFloorplanData(parsed)) {
            setStatus({ type: "error", message: "匯入失敗：JSON 格式不符合規範。" });
            return;
          }

          if (parsed.meta.version !== "1.0.0") {
            setStatus({ type: "error", message: "匯入失敗：版本不相容。" });
            return;
          }

          setDataRef.current(normalizeFloorplanData(parsed));
          setStatus({ type: "success", message: "JSON 匯入成功。" });
        } catch {
          setStatus({ type: "error", message: "匯入失敗：無法解析 JSON。" });
        }
      };
      reader.onerror = () =>
        setStatus({ type: "error", message: "匯入失敗：讀取檔案時發生錯誤。" });
      reader.readAsText(file);
    },
    [],
  );

  const clearStorage = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setStatus({ type: "success", message: "已清除 LocalStorage 資料。" });
  }, []);

  const clearStatus = useCallback(() => setStatus(null), []);

  return {
    exportJSON,
    importJSON,
    clearStorage,
    status,
    clearStatus,
  };
}
