# 📋 Пошаговая инструкция по деплою

## Быстрый деплой (автоматический скрипт)

```bash
# Сделайте скрипт исполняемым
chmod +x deploy.sh

# Запустите деплой
./deploy.sh
```

Скрипт автоматически:
- ✅ Установит Docker и Docker Compose
- ✅ Скопирует файлы на сервер
- ✅ Установит Node.js
- ✅ Установит зависимости

## Ручной деплой (пошагово)

### Шаг 1: Подключение к серверу

```bash
ssh root@164.92.248.246
# Пароль: CanadaChili2025$end
```

### Шаг 2: Установка Docker

```bash
# Обновление системы
apt update && apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
rm get-docker.sh

# Установка Docker Compose
apt install -y docker-compose-plugin

# Проверка
docker --version
docker compose version
```

### Шаг 3: Копирование проекта на сервер

**С локального компьютера:**

```bash
cd "/Users/mymac/TRAINING/ВАЙБКОДИНГ (ДАМИР ХАЛИЛОВ)/MY PROJECTS/hub-sales-ai"

# Установите sshpass (если нужно)
# macOS: brew install hudochenkov/sshpass/sshpass

# Копирование файлов
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'dist' \
    -e "sshpass -p 'CanadaChili2025\$end' ssh -o StrictHostKeyChecking=no" \
    ./ root@164.92.248.246:/opt/hub-sales-ai/
```

Или используйте SCP:

```bash
scp -r . root@164.92.248.246:/opt/hub-sales-ai/
```

### Шаг 4: Настройка на сервере

```bash
# Подключитесь к серверу
ssh root@164.92.248.246

# Перейдите в директорию проекта
cd /opt/hub-sales-ai

# Создайте .env файл (если его нет)
cp .env.example .env
nano .env
```

**Заполните в .env:**
- Все переменные уже есть (Telegram, Database, Claude)
- **Добавьте Stripe ключи** (получите в Stripe Dashboard):
  - `STRIPE_SECRET_KEY=sk_live_...`
  - `STRIPE_PUBLIC_KEY=pk_live_...`
  - `STRIPE_WEBHOOK_SECRET=whsec_...`
  - `STRIPE_PREMIUM_PRICE_ID=price_...`
  - `STRIPE_TEST_DRIVE_PRICE_ID=price_...`
- `ADMIN_CHAT_ID` - ваш Telegram ID
- `CLUB_CHANNEL_ID` - ID закрытого канала

### Шаг 5: Установка Node.js и зависимостей

```bash
# Установка Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Установка зависимостей
npm install

# Генерация Prisma Client
npm run db:generate

# Применение миграций (создание таблиц в БД)
npm run db:migrate
```

### Шаг 6: Настройка SSL сертификата

```bash
# Установка Certbot
apt install -y certbot

# Получение сертификата (DNS должен быть настроен!)
certbot certonly --standalone -d api.sorokafes.com

# Сертификаты будут в:
# /etc/letsencrypt/live/api.sorokafes.com/fullchain.pem
# /etc/letsencrypt/live/api.sorokafes.com/privkey.pem
```

### Шаг 7: Обновление Nginx конфигурации

```bash
nano nginx/nginx.conf
```

Раскомментируйте строки с SSL сертификатами:

```nginx
ssl_certificate /etc/letsencrypt/live/api.sorokafes.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/api.sorokafes.com/privkey.pem;
```

### Шаг 8: Запуск проекта

```bash
# Сборка Docker образов
docker compose build

# Запуск в фоне
docker compose up -d

# Проверка статуса
docker compose ps

# Просмотр логов
docker compose logs -f app
```

### Шаг 9: Настройка Telegram Webhook

```bash
# Убедитесь, что WEBHOOK_URL в .env установлен
# WEBHOOK_URL=https://api.sorokafes.com

# Перезапустите контейнер
docker compose restart app
```

### Шаг 10: Создание админ-пользователя

```bash
# Подключитесь к базе данных
# Используйте psql или любой PostgreSQL клиент

# Установите флаг is_admin для вашего Telegram ID
# Замените YOUR_TELEGRAM_ID на ваш реальный ID
psql -h basesformyvibecoding-do-user-30740491-0.e.db.ondigitalocean.com \
     -U doadmin \
     -d HUBSalesAi \
     -p 25060 \
     -c "UPDATE users SET is_admin = true WHERE telegram_id = YOUR_TELEGRAM_ID;"
```

## Проверка работы

1. **Проверьте логи:**
   ```bash
   docker compose logs -f app
   ```

2. **Проверьте статус контейнеров:**
   ```bash
   docker compose ps
   ```

3. **Проверьте бота в Telegram:**
   - Откройте `@HUBSalesAI_bot`
   - Отправьте `/start`
   - Проверьте ответ

4. **Проверьте webhook endpoint:**
   ```bash
   curl https://api.sorokafes.com/webhooks/stripe
   ```

## Настройка DNS

В панели управления доменом (где купили sorokafes.com):

1. **www.sorokafes.com** → CNAME на Gamma (или A-запись на IP Gamma)
2. **sorokafes.com** → A-запись на `164.92.248.246`
3. **api.sorokafes.com** → A-запись на `164.92.248.246`

## Настройка Stripe Webhook

1. Зайдите в Stripe Dashboard → Developers → Webhooks
2. Add endpoint:
   - URL: `https://api.sorokafes.com/webhooks/stripe`
   - События:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
     - `invoice.payment_succeeded`
3. Скопируйте Signing secret → вставьте в `.env` как `STRIPE_WEBHOOK_SECRET`

## Полезные команды

```bash
# Остановка
docker compose down

# Перезапуск
docker compose restart app

# Просмотр логов
docker compose logs -f app
docker compose logs -f nginx
docker compose logs -f redis

# Обновление кода
git pull
docker compose build
docker compose up -d
```

## Troubleshooting

### Бот не отвечает
```bash
# Проверьте логи
docker compose logs app

# Проверьте токен в .env
# Проверьте подключение к БД
```

### Webhooks не работают
```bash
# Проверьте Nginx
docker compose logs nginx

# Проверьте SSL сертификат
certbot certificates

# Проверьте webhook secret в Stripe
```

### Ошибки базы данных
```bash
# Проверьте подключение
npm run db:migrate

# Проверьте credentials в .env
```

