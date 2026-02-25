# AGENTS.md

## Cursor Cloud specific instructions

This is a pure client-side React + Vite SPA (no backend, no database, no external services). All data persistence uses browser `localStorage`.

### Services

| Service | Command | URL |
|---|---|---|
| Vite dev server | `npm run dev -- --host 0.0.0.0` | http://localhost:5173 |

### Key commands

- **Dev server:** `npm run dev` (add `-- --host 0.0.0.0` for network access)
- **Type check:** `npx tsc -b`
- **Build:** `npm run build` (runs `tsc -b && vite build`)
- **Preview prod build:** `npm run preview`

### Notes

- No linter (ESLint) is configured in this project. TypeScript strict mode (`tsc -b`) serves as the primary static analysis tool.
- No automated test framework is configured. Manual browser testing is the primary verification method.
- The app UI is in Traditional Chinese (繁體中文). The 2D editor is "Design" tab, 3D viewer is "3D View" tab.
- Static 3D assets (OBJ, DAE, textures) live in `/resources/furniture/` and are bundled by Vite.
- The Dockerfile uses Node 20 for build; Node 22 (current VM default) works fine for local development.
