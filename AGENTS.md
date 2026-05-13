# Разработка BusCatcher

Веб-приложение для проверки времени прибытия автобусов в Москве. PWA с Leaflet картой и GTFS данными. Express backend с SQLite.

## Команды

```
npm run dev           # Vite dev server → localhost:3000 (proxy /api → :3001)
npm run build         # Vite build → dist/bundle.js (iife, leaflet external/CDN)
npm run server        # tsx server/index.ts → localhost:3001
npm test              # Vitest client tests (tests/**/*.test.ts excl server/)
npm run test:server   # Vitest server tests (tests/server/**/*.test.ts)
npm run test:watch    # Watch mode
npm run test:coverage # Client tests with coverage
npm run typecheck     # tsc --project tsconfig.app.json --noEmit
npm run typecheck:server # tsc --project tsconfig.server.json --noEmit
npm run lint          # eslint .
npm run lint:fix      # eslint . --fix
npm run format        # prettier --write
npm run format:check  # prettier --check
npm run check         # lint + format:check + typecheck + typecheck:server + test
npm run download-gtfs # node scripts/download-gtfs.js (requires BUSMAPS_API_KEY)
```

**Порядок проверки:** `lint → format:check → typecheck → typecheck:server → test → test:server`

Или одной командой: `npm run check`

## Подход: TDD

1. **Сначала тест** — пишем тест ДО реализации
2. **Запускаем** — видим fail
3. **Пишем код** — минимальный, чтобы тест прошёл
4. **Рефакторим** — тесты продолжают проходить

## Правила тестирования

- **Не копипастить код в тесты** — логика должна быть в отдельном модуле с публичным API
- **Тестировать через публичные методы** — модуль экспортирует функции для тестирования
- **Если не можем протестировать — код не нужен**
- **Vitest environment: `node`** — `tests/setup.ts` мокает `window`, `history`, `location`
- **Client тесты:** `tests/**/*.test.ts` (исключая `tests/server/`)
- **Server тесты:** `tests/server/**/*.test.ts` — отдельный config `vitest.server.config.ts`
- **Coverage исключает:** `js/app.ts`, `js/index.ts`, `js/map.ts` (client), `server/index.ts` (server)
- **Один тест-файл = один модуль**

## Архитектура

```
js/                      # Client TypeScript модули
├── index.ts             # Entry — импортирует все модули
├── app.ts               # Главная логика: загрузка GTFS, map clicks, UI flow
├── map.ts               # Leaflet карта, маркеры, рендеринг
├── gtfs/
│   ├── loader.ts        # Загрузка GTFS файлов (fetch)
│   ├── parser.ts        # CSV парсинг (с прогрессом для больших файлов)
│   ├── cache.ts         # Кэши trips/stopTimes для быстрого поиска
│   └── api-client.ts    # Клиент к backend API
├── routing/
│   ├── finder.ts        # Поиск маршрутов A→B
│   └── availability.ts  # Фильтрация доступных остановок
├── state/
│   ├── store.ts         # URL state (?stopA=&stopB=&home=)
│   └── favorites.ts     # Избранное (localStorage)
├── ui/
│   ├── search.ts        # Поиск остановок
│   └── bus-list.ts      # Рендеринг списка автобусов
└── utils/
    ├── distance.ts      # Геометрия (Haversine)
    └── time.ts          # Время, типы Stop/Point

server/                  # Express backend (TypeScript, tsx)
├── index.ts             # Entry — Express app, routes, CORS
├── db.ts                # SQLite (better-sqlite3) — GTFS данные
├── gtfs-importer.ts     # Импорт GTFS в SQLite
├── busmaps.ts           # BusMaps API клиент
├── scheduler.ts         # Cron для обновления GTFS
└── routes/
    ├── stops.ts         # GET /api/stops
    ├── routes.ts        # GET /api/routes
    ├── trips.ts         # GET /api/trips
    └── admin.ts         # POST /api/admin/refresh-gtfs

tests/                   # Тесты
├── setup.ts             # Mock window/history для node env
├── *.test.ts            # Client unit тесты
└── server/
    ├── setup.ts         # Server test setup
    ├── api.test.ts      # API integration тесты
    └── busmaps.test.ts  # BusMaps client тесты

data/gtfs/               # GTFS данные (stops.txt, routes.txt, trips.txt, stop_times_*.txt)
```

## Важные детали

### Client
- **Leaflet загружается через CDN** (не бандлится) — `vite.config.ts` external: `leaflet`
- **GTFS данные обязательны** — без `data/gtfs/*.txt` приложение не загрузится
- **stop_times разбит на 3 файла** (`stop_times_1.txt`, `stop_times_2.txt`, `stop_times_3.txt`) — большие данные
- **`parseCSVWithProgress`** — асинхронный парсер с callback для прогресс-бара
- **User flow:** homePoint → stopA → stopB → список автобусов (4 шага)
- **State сохраняется в URL** — `loadFromURL` восстанавливает состояние при загрузке
- **Path alias:** `@` → `/js` в vite.config.ts
- **Vite dev proxy:** `/api` → `http://localhost:3001`

### Server
- **Express 5** + **better-sqlite3** — GTFS данные хранятся в SQLite
- **Порт:** 3001 (env `PORT`)
- **GTFS импорт:** при первом запуске автоматически импортирует из BusMaps API
- **GTFS кэш:** URL GTFS кэшируется на 7 дней, чтобы не спамить API
- **Admin endpoint:** `POST /api/admin/refresh-gtfs` защищён `ADMIN_TOKEN`
- **Cron:** автоматическое обновление GTFS по расписанию

### Environment
- **`BUSMAPS_API_KEY`** — для загрузки GTFS данных (download-gtfs)
- **`ADMIN_TOKEN`** — для защиты admin endpoint (default: `buscatcher-admin`)
- **`VITE_API_URL`** — URL backend для dev сервера

## CI/CD

- **Dev pipeline** (`ci-dev.yml`): push на non-main ветки → lint + typecheck + test + build Docker dev images
- **Main pipeline** (`ci-main.yml`): push на main → promote dev images to latest → deploy на VPS через SSH
- **Pre-PR** (`ci-pre-pr.yml`): workflow_dispatch → создаёт PR в main
- **Rollback** (`ci-rollback.yml`): restore previous Docker images

## Docker

- **Multi-stage Dockerfile** с target `backend` и `frontend`
- **docker-compose.yml**: backend (port 3001) + frontend (nginx, port 3080:80)
- **deploy.sh**: pull + up -d + health check
- **Docker Hub:** `quietjbs/sha256:buscatcher-{backend|frontend}-{dev|latest|prev}`

## ESLint

- Flat config (`eslint.config.mjs`) с TypeScript-ESLint
- **extends:** `@eslint/js/recommended` + `typescript-eslint/recommended` + `eslint-config-prettier`
- **Отключены:** `consistent-indexed-object-style`, `no-explicit-any`
- **Unused vars:** `argsIgnorePattern: '^_'`, `varsIgnorePattern: '^_'`
- **Игнорирует:** `dist`, `node_modules`, `**/bundle.js`, `*.json`, `data`, `tmp`
- **Server файлы:** `globals.node`, **Client/Tests:** `globals.browser`

## Prettier

- `tabWidth: 4`, `printWidth: 120`, `singleQuote: true`, `semi: true`, `trailingComma: "es5"`

## TypeScript

- **`tsconfig.app.json`** — client (js/, tests/) — ESNext, DOM libs
- **`tsconfig.server.json`** — server (server/) — ES2023, no DOM, strict: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`
- **`tsconfig.json`** — base config

## Коммиты

- Одно изменение = один коммит
- Коммит после завершения каждого модуля
