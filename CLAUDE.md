# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (exposed on LAN via host: true in vite.config.ts)
npm run build      # Type-check + Vite build
npx tsc -b         # Type-check only (no emit)
npm run preview    # Preview production build
```

No test framework, no linter. Type-check with `npx tsc -b` before committing.

## Architecture

Pure client-side SPA. No backend. All state persisted to `localStorage` key `floorplan-editor-data`.

### View Routing

`src/App.tsx` is the monolithic root. It manages all top-level state and renders two mutually exclusive views via `activeView: "design" | "viewer"`:

- **Design view** (`"design"`) — 2D floor plan editor. Always kept in the DOM (never unmounted) with `visibility: hidden` when the 3D viewer is active, to prevent the Konva canvas from losing its GPU context on mobile Safari.
- **3D Viewer** (`"viewer"`) — conditionally rendered as an `absolute inset-0 z-10` overlay on top of the design view. Mounted only when active.

### Data Flow

`FloorplanData` (`src/types/floorplan.ts`) is the central data type flowing through everything:
- `walls: WallSegment[]` — pixel-space coordinates (scaled by `pixelsPerMeter`)
- `scale: FloorplanScale` — calibration: pixels per meter
- `windows: WindowOpening[]` — offsets along wall length
- `furniture: FurnitureItem[]` — 2D positions in pixel space

### 2D Editor (`src/components/Canvas.tsx`)

Built on react-konva. All content lives in a single `<Group>` transformed by `{ x, y, scale }` state. Key interactions:
- Mouse wheel → pan (default) / zoom (Ctrl+wheel)
- Single-finger drag → pan (Konva `draggable`)
- Two-finger pinch → zoom + pan simultaneously (custom `onTouchStart/Move/End` on Stage)
- `visibility: hidden` on container when viewer is active — canvas context is preserved

Coordinate system: everything in the Group is in **pixel space** (image pixels). `meterToPixel`/`pixelToMeter` in `src/utils/coordinateConverter.ts` convert using `scale.pixelsPerMeter`.

### 3D Viewer (`src/step2/viewer/GeometryPreview.tsx`)

Three.js scene rebuilt whenever `floorplanData`, `ceilingHeight`, or `wallThickness` changes. Key design points:

- **Two control modes**: OrbitControls (third-person) and PointerLockControls (first-person/desktop). Mobile uses manual touch look + virtual joystick instead of Pointer Lock (not supported on iOS Safari).
- All `controls.lock()` / `controls.unlock()` calls are wrapped in `try/catch` — iOS Safari throws on Pointer Lock API calls.
- `preserveDrawingBuffer: true` on the renderer for mobile GPU reliability.
- Explicit `renderer.dispose()` then `WEBGL_lose_context.loseContext()` in cleanup to release iOS Safari's limited WebGL context pool.
- React StrictMode is intentionally removed from `src/main.tsx` — double-invocation in dev mode exhausts the mobile WebGL context pool.

**First-person on mobile:**
- Virtual joystick (bottom-left, `md:hidden`) updates `keyStateRef` (forward/back/left/right)
- Single-finger drag on canvas → `touchstart/touchmove/touchend` listeners on `renderer.domElement` → rotates `camera.rotation` (YXZ order)
- Animation loop reads from `keyStateRef` and moves camera even without Pointer Lock

**Multi-segment measurement:**
- Click to place first point (pending sphere), click again to commit a segment (Group: sphere + sphere + line)
- Undo/redo via Ctrl+Z / Ctrl+Y; clear with Q
- Label positions updated each frame via direct DOM writes (`labelEl.style.left/top`) to avoid React re-renders

### 3D Pipeline (`src/step2/`)

```
FloorplanData
  → buildGeometryFromFloorplan()   (src/step2/geometry/)
      → wall meshes, floor mesh, geometry errors
  → buildCollisionData()           (src/step2/collision/)
      → wall AABBs for resolveMovement()
  → buildFurnitureMeshes()         (src/step2/viewer/furniture/)
      → loads OBJ/DAE models async
```

### PNG Metadata System

`src/utils/pngMetadata.ts` — embeds `FloorplanData` as a base64-encoded `tEXt` chunk (`house_data` key) in exported PNG files. Used by the House Gallery to load pre-built floor plans from `resources/maps/*.png`.

### Static Assets

- `resources/maps/` — gallery PNG images (may contain embedded `house_data` tEXt chunk)
- `resources/furniture/` — OBJ/MTL/DAE 3D models referenced via `new URL(..., import.meta.url)`
- `resources/icons/` — SVG toolbar icons

### Custom Tailwind Tokens

Defined in `tailwind.config.cjs`:
- `primary: "#137fec"` — accent color
- `background-dark: "#121212"`, `surface-dark: "#2d2d2d"`, `surface-darker: "#1a1a1a"`, `border-dark: "#3c3c3c"`

Key CSS components in `src/index.css`: `.viewer-icon-btn` (hover scoped to `@media (hover: hover) and (pointer: fine)` to prevent sticky hover on mobile), `.viewer-icon-btn-active`, `.segmented-pill`, `.tool-triangle`.

## UI Language

All user-facing text is in Traditional Chinese (繁體中文).
