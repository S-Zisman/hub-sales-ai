# Быстрый старт HUB SALES AI

## Что нужно сделать перед запуском

### 1. Установить зависимости

```bash
npm install
```

### 2. Настроить .env файл

Убедитесь, что все переменные в `.env` заполнены:

**Обязательные:**
- `TELEGRAM_BOT_TOKEN` - уже есть
- `KLAUDE_API_KEY` - уже есть  
- `DATABASE_URL` - уже есть (DigitalOcean)
- `REDIS_URL` - для локальной разработки: `redis://localhost:6379`

**Stripe (нужно добавить):**
- `STRIPE_SECRET_KEY` - получить в Stripe Dashboard
- `STRIPE_PUBLIC_KEY` - получить в Stripe Dashboard
- `STRIPE_WEBHOOK_SECRET` - после настройки webhook
- `STRIPE_PREMIUM_PRICE_ID` - создать продукт в Stripe
- `STRIPE_TEST_DRIVE_PRICE_ID` - создать продукт в Stripe

**Telegram (опционально):**
- `ADMIN_CHAT_ID` - ваш Telegram ID для админ-команд
- `CLUB_CHANNEL_ID` - ID закрытого канала

### 3. Настроить базу данных

```bash
# Генерация Prisma Client
npm run db:generate

# Применение миграций (создание таблиц)
npm run db:migrate
```

### 4. Запустить Redis (для локальной разработки)

```bash
# Через Docker
docker run -d -p 6379:6379 redis:7-alpine

# Или установить локально
# macOS: brew install redis && brew services start redis
# Ubuntu: sudo apt install redis-server && sudo systemctl start redis
```

### 5. Запустить бота

```bash
# Режим разработки (с автоперезагрузкой)
npm run dev

# Или продакшн
npm run build
npm start
```

## Настройка Stripe

### Создание продуктов

1. Зайдите в Stripe Dashboard → Products
2. Создайте продукт "Premium Club":
   - Тип: Recurring
   - Цена: £17/мес
   - Сохраните Price ID → вставьте в `STRIPE_PREMIUM_PRICE_ID`

3. Создайте продукт "Test-Drive":
   - Тип: Recurring  
   - Цена: £9/мес
   - Сохраните Price ID → вставьте в `STRIPE_TEST_DRIVE_PRICE_ID`

### Создание промокодов

1. Stripe Dashboard → Coupons
2. Создайте промокод `PREMIUM17`:
   - Скидка: фиксированная сумма или процент
   - Примените к Premium продукту

3. Создайте промокод `SOROKA`:
   - Скидка: фиксированная сумма или процент
   - Примените к Test-Drive продукту

### Настройка Webhook

1. Stripe Dashboard → Developers → Webhooks
2. Add endpoint:
   - URL: `http://localhost:3000/webhooks/stripe` (для разработки)
   - События:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
     - `invoice.payment_succeeded`
3. Скопируйте Signing secret → вставьте в `STRIPE_WEBHOOK_SECRET`

## Тестирование

1. Откройте бота в Telegram: `@HUBSalesAI_bot`
2. Отправьте `/start`
3. Пройдите квалификацию
4. Проверьте работу ИИ-продавца

## Следующие шаги

- Настройте админ-пользователя в базе данных
- Создайте закрытый канал и укажите `CLUB_CHANNEL_ID`
- Настройте DNS для продакшн-развертывания
- См. `DEPLOYMENT.md` для развертывания на сервере


