# HUB SALES AI - AI Business HUB Ecosystem

Интеллектуальная экосистема продаж с ИИ-агентом, управлением подписками и встроенной CRM.

## Архитектура

Система состоит из следующих компонентов:

1. **Telegram Bot** - ИИ-продавец на базе Claude 3.5 Sonnet
2. **Stripe Integration** - Обработка платежей и подписок
3. **PostgreSQL Database** - Хранение данных пользователей и подписок
4. **Redis** - Сессии бота и очереди задач
5. **Nginx** - Reverse proxy для webhooks

## Технологический стек

- **Node.js 20** + **TypeScript**
- **grammY** - Telegram Bot Framework
- **Prisma** - ORM для PostgreSQL
- **Stripe** - Платежная система
- **Anthropic Claude API** - ИИ-модель
- **BullMQ** - Очереди задач
- **Docker** + **Docker Compose** - Контейнеризация

## Установка и запуск

### 1. Клонирование и установка зависимостей

```bash
cd hub-sales-ai
npm install
```

### 2. Настройка переменных окружения

Скопируйте `.env.example` в `.env` и заполните все необходимые значения:

```bash
cp .env.example .env
```

**Обязательные переменные:**
- `TELEGRAM_BOT_TOKEN` - Токен Telegram бота
- `KLAUDE_API_KEY` - API ключ Anthropic Claude
- `STRIPE_SECRET_KEY` - Секретный ключ Stripe
- `STRIPE_WEBHOOK_SECRET` - Секрет для верификации webhooks
- `DATABASE_URL` - Строка подключения к PostgreSQL
- `REDIS_URL` - URL подключения к Redis

### 3. Настройка базы данных

```bash
# Генерация Prisma Client
npm run db:generate

# Применение миграций
npm run db:migrate
```

### 4. Настройка Stripe

1. Создайте продукты и цены в Stripe Dashboard:
   - Premium Club: £17/мес
   - Test-Drive: £9/мес

2. Создайте промокоды:
   - `PREMIUM17` - скидка на Premium
   - `SOROKA` - скидка на Test-Drive

3. Настройте webhook endpoint:
   - URL: `https://api.sorokafes.com/webhooks/stripe`
   - События: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_*`

### 5. Запуск в режиме разработки

```bash
npm run dev
```

### 6. Запуск с Docker

```bash
# Сборка и запуск всех сервисов
docker-compose up -d

# Просмотр логов
docker-compose logs -f app
```

## Структура проекта

```
hub-sales-ai/
├── src/
│   ├── bot/           # Логика Telegram бота
│   │   ├── handlers.ts    # Обработчики команд и сообщений
│   │   ├── admin.ts       # Админ-команды CRM
│   │   ├── fsm.ts         # Finite State Machine
│   │   └── index.ts       # Инициализация бота
│   ├── services/      # Бизнес-логика
│   │   ├── claude.ts      # Интеграция с Claude API
│   │   ├── stripe.ts      # Интеграция со Stripe
│   │   ├── subscription.ts # Управление подписками
│   │   ├── redis.ts       # Redis клиент
│   │   └── queue.ts       # Очереди задач
│   ├── webhooks/      # Webhook handlers
│   │   └── stripe.ts      # Stripe webhooks
│   ├── database/      # База данных
│   │   └── client.ts      # Prisma клиент
│   ├── config/        # Конфигурация
│   │   └── index.ts       # Загрузка конфига
│   └── index.ts       # Точка входа
├── prisma/
│   └── schema.prisma  # Схема базы данных
├── nginx/
│   └── nginx.conf     # Конфигурация Nginx
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## Основные функции

### ИИ-Продавец

Бот использует методологию SPIN и технику Challenger для квалификации лидов и продажи продуктов:
- Квалификация (ниша, оборот, команда)
- Усиление боли
- Презентация решения
- Закрытие сделки

### Управление подписками

- Автоматическое создание одноразовых ссылок для входа в канал
- Kick Protocol - автоматическое исключение при истечении подписки
- Grace period - 3 дня на обновление платежной информации

### Админ-панель CRM

Доступна через команды в боте (только для админов):

- `/stats` - Статистика: лиды, продажи, MRR
- `/lead [telegram_id]` - Карточка лида
- `/broadcast` - Рассылка сообщений

## Развертывание

### DigitalOcean Droplet

1. Создайте Droplet (2 vCPU, 4GB RAM, Ubuntu 24.04)
2. Установите Docker и Docker Compose
3. Склонируйте репозиторий
4. Настройте `.env` файл
5. Запустите `docker-compose up -d`

### DNS настройка

- `www.sorokafes.com` → CNAME на Gamma
- `sorokafes.com` → A-запись на IP сервера (редирект на www)
- `api.sorokafes.com` → A-запись на IP сервера

### SSL сертификаты

Используйте Let's Encrypt для получения бесплатных SSL сертификатов:

```bash
certbot certonly --standalone -d api.sorokafes.com
```

Затем обновите пути в `nginx/nginx.conf`.

## Мониторинг

- Логи приложения: `docker-compose logs -f app`
- Логи базы данных: `docker-compose logs -f db`
- Prisma Studio: `npm run db:studio`

## Безопасность

- Все секреты хранятся в `.env` (не коммитится)
- Webhook подписи проверяются
- SSL/TLS для всех соединений
- Rate limiting для рассылок

## Лицензия

ISC
