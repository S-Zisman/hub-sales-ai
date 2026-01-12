# Настройка Stripe для HUB SALES AI

## Статические ссылки (для теста)

У вас уже есть статические ссылки Stripe:
- **Test-Drive**: `https://buy.stripe.com/test_14A28qeAl2YH4eOf1H7ok04` (£13)
- **Premium**: `https://buy.stripe.com/test_14A4gy77TeHph1A6vb7ok00` (£57)

Эти ссылки уже добавлены в `.env` файл.

## Использование статических ссылок

Чтобы использовать статические ссылки вместо динамических сессий:

1. В `.env` установите:
   ```bash
   USE_STATIC_STRIPE_LINKS=true
   ```

2. Перезапустите бота:
   ```bash
   docker compose restart app
   ```

⚠️ **Важно**: Статические ссылки не позволяют отследить, кто именно оплатил. Для продакшн рекомендуется использовать динамические сессии.

## Настройка динамических сессий (рекомендуется)

### 1. Создайте продукты в Stripe Dashboard

**Premium Club:**
- Зайдите в Stripe Dashboard → Products
- Create product
- Name: "Premium Club"
- Type: Recurring
- Price: £57/month
- Сохраните Price ID (начинается с `price_...`)

**Test-Drive:**
- Create product
- Name: "Test-Drive"
- Type: Recurring
- Price: £13/month
- Сохраните Price ID

### 2. Создайте промокоды

**PREMIUM17:**
- Stripe Dashboard → Coupons
- Create coupon
- Code: `PREMIUM17`
- Discount: Fixed amount £40 (чтобы получить £17 из £57)
- Apply to: Premium product

**SOROKA:**
- Create coupon
- Code: `SOROKA`
- Discount: Fixed amount £4 (чтобы получить £9 из £13)
- Apply to: Test-Drive product

### 3. Настройте Webhook

1. Stripe Dashboard → Developers → Webhooks
2. Add endpoint
3. URL: `https://api.sorokafes.com/webhooks/stripe`
4. События:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `invoice.payment_succeeded`
5. Скопируйте Signing secret → вставьте в `.env` как `STRIPE_WEBHOOK_SECRET`

### 4. Обновите .env

```bash
# Используйте динамические сессии
USE_STATIC_STRIPE_LINKS=false

# Добавьте Price IDs
STRIPE_PREMIUM_PRICE_ID=price_xxxxx
STRIPE_TEST_DRIVE_PRICE_ID=price_xxxxx

# Добавьте Stripe ключи
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_PUBLIC_KEY=pk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

## Проверка работы

1. Протестируйте оплату через бота
2. Проверьте webhook логи в Stripe Dashboard
3. Убедитесь, что пользователь получает доступ после оплаты

## Разница между статическими и динамическими ссылками

**Статические ссылки:**
- ✅ Быстро настроить
- ❌ Нельзя отследить, кто оплатил
- ❌ Нельзя применить промокод автоматически
- ❌ Нельзя связать оплату с Telegram ID

**Динамические сессии:**
- ✅ Полный контроль над процессом
- ✅ Автоматическое применение промокодов
- ✅ Связь оплаты с Telegram ID
- ✅ Автоматическая активация подписки
- ✅ Отслеживание всех платежей

Рекомендуется использовать динамические сессии для продакшн.

