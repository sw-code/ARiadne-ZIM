# ARiadne CMS

1. `npm install && npm run dev:db` starts PostgreSQL on port 5435 (including the `ariadne_cms_test` database used by the tests).
2. `npm run dev:server` runs the API on the dev settings in `dev/dev.env`; `npm run dev:ui` serves the editor UI with Vite.
3. `npm test`, `npm run type-check`, `npm run lint` and `npm run format:check` are the checks CI runs.
