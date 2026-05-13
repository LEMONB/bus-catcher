# BusCatcher

Веб-приложение для проверки времени прибытия автобусов в Москве.

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Загрузка данных GTFS

Данные автобусных маршрутов Москвы загружаются через BusMaps API:

```bash
npm run download-gtfs
```

Необходимо установить переменную окружения `BUSMAPS_API_KEY`.

### 3. Запуск

```bash
npm run serve
```

Откройте http://localhost:3000

## Использование

1. Кликните на **остановку отправления** 🚌
2. Кликните на **остановку назначения** 🏁
3. Кликните на карту где выходите 🏠
4. Увидите список автобусов и успеете ли вы на них

## Разработка

### Запуск тестов

```bash
npm test
```

## Структура проекта

```
├── index.html      # Главная страница
├── js/app.js       # Приложение
├── css/style.css   # Стили
├── sw.js          # Service Worker
├── tests/         # Тесты
├── data/gtfs/    # Данные GTFS
└── PRD.md        # Требования
```

## Деплой на VPS

### Требования

- Docker + Docker Compose
- BusMaps API ключ (получить на https://busmaps.com)

### Шаги на VPS

**1. Клонировать репозиторий:**

```bash
git clone <repo-url> buscatcher
cd buscatcher
```

**2. Создать `.env` файл:**

```bash
cat > .env << EOF
BUSMAPS_API_KEY=ваш_ключ_от_busmaps
ADMIN_TOKEN=ваш_секретный_токен
EOF
```

> `ADMIN_TOKEN` используется для защиты эндпоинта `/api/admin/refresh-gtfs`.

**3. Запустить деплой:**

```bash
chmod +x deploy.sh
./deploy.sh
```

Это скачает образы с Docker Hub и запустит 2 контейнера:
- `buscatcher-api` (backend, порт 3001)
- `buscatcher-nginx` (frontend, порт 80)

**4. Проверить:**

Откройте `http://<ваш-ip>/` — приложение загрузится. При первом запуске backend автоматически импортирует GTFS данные через BusMaps API (это займёт несколько минут).

### Обновление

```bash
./deploy.sh
```

Скрипт сам сделает `docker compose pull` и перезапустит контейнеры. URL GTFS кэшируется на 7 дней, поэтому обновление GTFS не будет лишний раз обращаться к BusMaps API.
