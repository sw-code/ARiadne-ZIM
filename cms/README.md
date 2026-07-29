# ARiadne CMS

1. `npm install && npm run dev:db` starts PostgreSQL on port 5435 (including the `ariadne_cms_test` database used by the tests).
2. `npm run dev:server` runs the API on the dev settings in `dev/dev.env`; `npm run dev:ui` serves the editor UI with Vite.
3. `npm test`, `npm run type-check`, `npm run lint` and `npm run format:check` are the checks CI runs.

## Public endpoints

These need no password; every other `/api` route needs the editor sign-in.

- `POST /api/pois/ranked` takes `{ start, destination, profile? }` and answers every annotated place within the detour budget, plus up to 20 places picked by the interest profile, plus the non-sensitive places within 100 m of the destination. The app sends the destination rounded to three decimals and needs these to match its exact destination to a place within 25 m. The request is neither stored nor logged.
- `POST /api/walk-reports` stores one opt-in walk report (aggregates, no positions): 201, 400 for an invalid report, 429 once 1,000 reports have been accepted that day.
- `DELETE /api/walk-reports/:installId` deletes every report of an install and always answers 204.
- `GET /api/annotated-pois` is a compatibility route for the demo APKs installed before the ranked feed: the places with an active annotation, in the old shape. Remove it once the new APK is rolled out.

Request bodies of the public POST routes are limited to 64 KiB (413 above) and to 500 subtypes per profile or report.

## Walk reports and learning

- A report is stored with the day it arrived, without a time of day. At most 1,000 reports are accepted per day, across all installs.
- A daily job, run at startup and every 24 hours after it, deletes reports received more than 365 days ago and then rebuilds the learned model from the newest 5,000 reports. The model is held in memory only; until enough reports have come in (collaborative filtering from 30 installs with at least 3 reports each, association rules from 1,000 reports), the curated ranking applies.
