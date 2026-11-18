# ChronoLog web

React 19 + Vite + TypeScript. The entry code (`src/main.tsx`, `src/env.ts`, `src/services/`) is
strict TypeScript; the dashboard components are still `.jsx` and are rewritten in roadmap Phase 6.

```bash
npm run dev -w chronolog-web         # from the repo root; http://localhost:3000
npm run build -w chronolog-web       # output in apps/web/dist
npm test -w chronolog-web            # Vitest + Testing Library
npm run typecheck -w chronolog-web
```

Build-time settings: `VITE_API_URL` and `VITE_WS_URL` (default `http://localhost:5000`).
