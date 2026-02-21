import { useMemo, useState } from "react";
import type { WindowOpening, WindowType } from "../types/floorplan";

export interface WindowDraft {
  wallId: string;
  startOffset: number;
  currentOffset: number;
}

export interface WindowPreset {
  sillHeight: number;
  openingHeight: number;
  label: string;
}

export const WINDOW_PRESETS: Record<WindowType, WindowPreset> = {
  floor: { sillHeight: 0, openingHeight: 2.1, label: "落地窗" },
  normal: { sillHeight: 0.9, openingHeight: 1.2, label: "一般窗" },
  high: { sillHeight: 1.8, openingHeight: 0.6, label: "氣窗" },
  balcony: { sillHeight: 0.9, openingHeight: 9, label: "陽台窗" },
};

const createWindowId = () =>
  `window-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function useWindowMarking() {
  const [isWindowMode, setIsWindowMode] = useState(false);
  const [selectedType, setSelectedType] = useState<WindowType>("normal");
  const [windows, setWindows] = useState<WindowOpening[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WindowDraft | null>(null);

  const selectedPreset = useMemo(
    () => WINDOW_PRESETS[selectedType],
    [selectedType],
  );

  const startWindowMode = () => {
    setIsWindowMode(true);
    setDraft(null);
    setSelectedWindowId(null);
  };

  const stopWindowMode = () => {
    setIsWindowMode(false);
    setDraft(null);
  };

  const beginWindowDraft = (wallId: string, startOffset: number) => {
    const clampedStart = Math.max(0, startOffset);
    setDraft({
      wallId,
      startOffset: clampedStart,
      currentOffset: clampedStart,
    });
  };

  const updateWindowDraft = (offset: number) => {
    setDraft((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        currentOffset: Math.max(0, offset),
      };
    });
  };

  const commitWindow = (offset: number): WindowOpening | null => {
    if (!draft) return null;
    const nextOffset = Math.max(0, offset);
    const startOffset = Math.min(draft.startOffset, nextOffset);
    const endOffset = Math.max(draft.startOffset, nextOffset);
    const width = endOffset - startOffset;
    if (width <= 0) return null;

    const preset = WINDOW_PRESETS[selectedType];
    const created: WindowOpening = {
      id: createWindowId(),
      wallId: draft.wallId,
      type: selectedType,
      startOffset,
      endOffset,
      width,
      sillHeight: preset.sillHeight,
      openingHeight: preset.openingHeight,
    };
    setWindows((previous) => [...previous, created]);
    setDraft(null);
    return created;
  };

  const addWindowByOffsets = (
    wallId: string,
    rawStartOffset: number,
    rawEndOffset: number,
  ): WindowOpening | null => {
    const startOffset = Math.min(rawStartOffset, rawEndOffset);
    const endOffset = Math.max(rawStartOffset, rawEndOffset);
    const width = endOffset - startOffset;
    if (width <= 0) return null;

    const preset = WINDOW_PRESETS[selectedType];
    const created: WindowOpening = {
      id: createWindowId(),
      wallId,
      type: selectedType,
      startOffset,
      endOffset,
      width,
      sillHeight: preset.sillHeight,
      openingHeight: preset.openingHeight,
    };
    setWindows((previous) => [...previous, created]);
    return created;
  };

  const deleteWindow = (id: string) => {
    setWindows((previous) => previous.filter((item) => item.id !== id));
    setSelectedWindowId((previous) => (previous === id ? null : previous));
  };

  const resetWindows = () => {
    setWindows([]);
    setSelectedWindowId(null);
    setDraft(null);
    setIsWindowMode(false);
  };

  const hydrateWindows = (nextWindows: WindowOpening[]) => {
    setWindows(nextWindows);
    setSelectedWindowId(null);
    setDraft(null);
    setIsWindowMode(false);
  };

  return {
    isWindowMode,
    selectedType,
    selectedPreset,
    windows,
    selectedWindowId,
    draft,
    startWindowMode,
    stopWindowMode,
    setWindowType: setSelectedType,
    beginWindowDraft,
    updateWindowDraft,
    commitWindow,
    addWindowByOffsets,
    cancelDraft: () => setDraft(null),
    selectWindow: setSelectedWindowId,
    deleteWindow,
    resetWindows,
    hydrateWindows,
  };
}
