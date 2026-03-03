import { useCallback, useState } from "react";
import type { Point2D, StaircaseLinkItem } from "../types/floorplan";

/** "waiting-a" = next click sets A; "waiting-b" = A is placed, next click sets B & commits */
export type StaircaseLinkMarkingState = "idle" | "waiting-a" | "waiting-b";

const createLinkId = () =>
  `staircase-link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export interface UseStaircaseLinkMarkingReturn {
  links: StaircaseLinkItem[];
  selectedLinkId: string | null;
  markingState: StaircaseLinkMarkingState;
  pendingA: Point2D | null;
  startMarking: () => void;
  stopMarking: () => void;
  handleLinkClick: (worldPoint: Point2D) => void;
  deleteLink: (id: string) => void;
  selectLink: (id: string | null) => void;
  moveLinkPoint: (id: string, end: "a" | "b", worldPoint: Point2D) => void;
  updateLinkAngles: (id: string, arrivalAngleAtA: number, arrivalAngleAtB: number) => void;
  hydrateLinks: (items: StaircaseLinkItem[]) => void;
  resetLinks: () => void;
}

export function useStaircaseLinkMarking(): UseStaircaseLinkMarkingReturn {
  const [links, setLinks] = useState<StaircaseLinkItem[]>([]);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [markingState, setMarkingState] = useState<StaircaseLinkMarkingState>("idle");
  const [pendingA, setPendingA] = useState<Point2D | null>(null);

  const startMarking = useCallback(() => {
    setMarkingState("waiting-a");
    setPendingA(null);
  }, []);

  const stopMarking = useCallback(() => {
    setMarkingState("idle");
    setPendingA(null);
  }, []);

  const handleLinkClick = useCallback(
    (worldPoint: Point2D) => {
      if (markingState === "waiting-a") {
        setPendingA(worldPoint);
        setMarkingState("waiting-b");
      } else if (markingState === "waiting-b" && pendingA) {
        const item: StaircaseLinkItem = {
          id: createLinkId(),
          positionA: pendingA,
          positionB: worldPoint,
          arrivalAngleAtB: 0,
          arrivalAngleAtA: 180,
        };
        setLinks((prev) => [...prev, item]);
        setSelectedLinkId(item.id);
        setPendingA(null);
        setMarkingState("waiting-a"); // ready for another link immediately
      }
    },
    [markingState, pendingA],
  );

  const deleteLink = useCallback((id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    setSelectedLinkId((prev) => (prev === id ? null : prev));
  }, []);

  const selectLink = useCallback((id: string | null) => {
    setSelectedLinkId(id);
  }, []);

  const updateLinkAngles = useCallback(
    (id: string, arrivalAngleAtA: number, arrivalAngleAtB: number) => {
      setLinks((prev) =>
        prev.map((l) =>
          l.id === id ? { ...l, arrivalAngleAtA, arrivalAngleAtB } : l,
        ),
      );
    },
    [],
  );

  const moveLinkPoint = useCallback(
    (id: string, end: "a" | "b", worldPoint: Point2D) => {
      setLinks((prev) =>
        prev.map((l) =>
          l.id === id
            ? end === "a"
              ? { ...l, positionA: worldPoint }
              : { ...l, positionB: worldPoint }
            : l,
        ),
      );
    },
    [],
  );

  const hydrateLinks = useCallback((items: StaircaseLinkItem[]) => {
    setLinks(items);
    setSelectedLinkId(null);
    setMarkingState("idle");
    setPendingA(null);
  }, []);

  const resetLinks = useCallback(() => {
    setLinks([]);
    setSelectedLinkId(null);
    setMarkingState("idle");
    setPendingA(null);
  }, []);

  return {
    links,
    selectedLinkId,
    markingState,
    pendingA,
    startMarking,
    stopMarking,
    handleLinkClick,
    deleteLink,
    selectLink,
    moveLinkPoint,
    updateLinkAngles,
    hydrateLinks,
    resetLinks,
  };
}
