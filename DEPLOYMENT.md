# Руководство по развертыванию HUB SALES AI

## Предварительные требования

1. DigitalOcean Droplet (2 vCPU, 4GB RAM, Ubuntu 24.04)
2. База данных PostgreSQL на DigitalOcean
3. Домен (sorokafes.com)
4. Stripe аккаунт с настроенными продуктами
5. Telegram Bot Token

## Шаг 1: Подготовка сервера

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Установка Docker Compose
sudo apt install docker-compose-plugin -y

# Добавление пользователя в группу docker
sudo usermod -aG docker $USER
```

## Шаг 2: Клонирование проекта

```bash
cd /opt
sudo git clone <repository-url> hub-sales-ai
cd hub-sales-ai
sudo chown -R $USER:$USER .
```

## Шаг 3: Настройка переменных окружения

```bash
cp .env.example .env
nano .env
```

Заполните все необходимые переменные:
- Telegram Bot Token
- Database credentials (DigitalOcean)
- Stripe keys
- Claude API Key
- Admin Chat ID
- Club Channel ID

## Шаг 4: Настройка базы данных

```bash
# Установка Node.js (если нужно)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Установка зависимостей
npm install

# Генерация Prisma Client
npm run db:generate

# Применение миграций
npm run db:migrate
```

## Шаг 5: Настройка Stripe

1. Создайте продукты в Stripe Dashboard:
   - Premium Club: £17/мес (recurring)
   - Test-Drive: £9/мес (recurring)

2. Создайте промокоды:
   - `PREMIUM17` - скидка на Premium
   - `SOROKA` - скидка на Test-Drive

3. Настройте webhook:
   - URL: `https://api.sorokafes.com/webhooks/stripe`
   - События:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`
     - `invoice.payment_succeeded`

4. Скопируйте Webhook Secret в `.env`

## Шаг 6: Настройка DNS

В панели управления доменом:

1. **www.sorokafes.com** → CNAME на Gamma (или A-запись на IP Gamma)
2. **sorokafes.com** → A-запись на IP вашего сервера (164.92.248.246)
3. **api.sorokafes.com** → A-запись на IP вашего сервера

## Шаг 7: Настройка SSL (Let's Encrypt)

```bash
# Установка Certbot
sudo apt install certbot -y

# Получение сертификата
sudo certbot certonly --standalone -d api.sorokafes.com

# Сертификаты будут в:
# /etc/letsencrypt/live/api.sorokafes.com/fullchain.pem
# /etc/letsencrypt/live/api.sorokafes.com/privkey.pem
```

Обновите `nginx/nginx.conf` с путями к сертификатам.

## Шаг 8: Сборка и запуск

```bash
# Сборка Docker образов
docker-compose build

# Запуск в фоне
docker-compose up -d

# Просмотр логов
docker-compose logs -f app
```

## Шаг 9: Настройка Telegram Webhook (опционально)

Если используете webhook вместо long polling:

```bash
# Установите WEBHOOK_URL в .env
WEBHOOK_URL=https://api.sorokafes.com

# Перезапустите контейнер
docker-compose restart app
```

## Шаг 10: Создание админ-пользователя

Подключитесь к базе данных и установите флаг `is_admin = true`:

```sql
UPDATE users SET is_admin = true WHERE telegram_id = YOUR_TELEGRAM_ID;
```

## Мониторинг

```bash
# Статус контейнеров
docker-compose ps

# Логи приложения
docker-compose logs -f app

# Логи базы данных
docker-compose logs -f db

# Логи Redis
docker-compose logs -f redis

# Логи Nginx
docker-compose logs -f nginx
```

## Обновление

```bash
# Остановка
docker-compose down

# Получение обновлений
git pull

# Пересборка
docker-compose build

# Запуск
docker-compose up -d
```

## Резервное копирование

```bash
# Бэкап базы данных (если используете локальную)
docker-compose exec db pg_dump -U $DB_USERNAME $DB_NAME > backup.sql

# Восстановление
docker-compose exec -T db psql -U $DB_USERNAME $DB_NAME < backup.sql
```

## Troubleshooting

### Бот не отвечает
- Проверьте логи: `docker-compose logs app`
- Убедитесь, что токен правильный
- Проверьте подключение к базе данных

### Webhooks не работают
- Проверьте, что Nginx правильно проксирует запросы
- Убедитесь, что SSL сертификат валиден
- Проверьте webhook secret в Stripe Dashboard

### Ошибки базы данных
- Проверьте подключение к DigitalOcean Database
- Убедитесь, что миграции применены
- Проверьте права доступа пользователя БД


