# Разработка BusCatcher

Веб-приложение для проверки времени прибытия автобусов в Москве. PWA с Leaflet картой и GTFS данными.

## Команды

```
npm run serve       # Dev server (Vite) → localhost:3000
npm run build       # Build → dist/bundle.js (iife, leaflet external/CDN)
npm test            # Run all tests (vitest run)
npm run test:watch  # Watch mode
npm run test:coverage # With coverage
npm run typecheck   # tsc --noEmit
npm run lint        # eslint js/
npm run lint:fix    # eslint --fix
npm run download-gtfs # Download Moscow GTFS data
```

**Порядок проверки:** `lint → typecheck → test`

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
- **Coverage исключает:** `app.ts`, `index.ts`, `map.ts` (UI/entry points)
- **Один тест-файл = один модуль**

## Архитектура

```
js/                      # TypeScript модули
├── index.ts             # Entry — импортирует все модули
├── app.ts               # Главная логика: загрузка GTFS, map clicks, UI flow
├── map.ts               # Leaflet карта, маркеры, рендеринг
├── gtfs/
│   ├── loader.ts        # Загрузка GTFS файлов (fetch)
│   ├── parser.ts        # CSV парсинг (с прогрессом для больших файлов)
│   └── cache.ts         # Кэши trips/stopTimes для быстрого поиска
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

tests/                   # Тесты
├── setup.ts             # Mock window/history для node env
├── *.test.ts            # Unit тесты по модулям
└── vitest.d.ts          # Type declarations

data/gtfs/               # GTFS данные (stops.txt, routes.txt, trips.txt, stop_times_*.txt)
```

## Важные детали

- **Leaflet загружается через CDN** (не бандлится) — `vite.config.ts` external: `leaflet`
- **GTFS данные обязательны** — без `data/gtfs/*.txt` приложение не загрузится
- **stop_times разбит на 3 файла** (`stop_times_1.txt`, `stop_times_2.txt`, `stop_times_3.txt`) — большие данные
- **`parseCSVWithProgress`** — асинхронный парсер с callback для прогресс-бара
- **User flow:** homePoint → stopA → stopB → список автобусов (4 шага)
- **State сохраняется в URL** — `loadFromURL` восстанавливает состояние при загрузке

## ESLint

- TypeScript-ESLint с `@typescript-eslint/stylistic`
- Отключены: `consistent-indexed-object-style`, `no-explicit-any`
- Игнорирует: `**/bundle.js`, `**/dist/**`

## Коммиты

- Одно изменение = один коммит
- Коммит после завершения каждого модуля
