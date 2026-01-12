-- Инициализация базы данных HUB SALES AI
-- Выполнить вручную через psql или любой PostgreSQL клиент

-- Создание enum типов
CREATE TYPE "CrmStatus" AS ENUM ('NEW', 'QUALIFIED', 'WARM', 'CUSTOMER', 'CHURNED', 'VIP');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE', 'TRIALING');
CREATE TYPE "ResourceType" AS ENUM ('GAMMA_PAGE', 'PDF_DOWNLOAD', 'ZOOM_LINK');
CREATE TYPE "ConversationRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM_NOTE');
CREATE TYPE "BotState" AS ENUM ('IDLE', 'QUALIFICATION', 'PROBLEM_AMPLIFICATION', 'SOLUTION_PRESENTATION', 'CLOSING');

-- Таблица пользователей
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "stripe_customer_id" TEXT,
    "username" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "crm_status" "CrmStatus" NOT NULL DEFAULT 'NEW',
    "lead_score" INTEGER NOT NULL DEFAULT 0,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");
CREATE UNIQUE INDEX "users_stripe_customer_id_key" ON "users"("stripe_customer_id");
CREATE INDEX "users_telegram_id_idx" ON "users"("telegram_id");
CREATE INDEX "users_crm_status_idx" ON "users"("crm_status");

-- Таблица подписок
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stripe_subscription_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "plan_id" TEXT NOT NULL,
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");
CREATE INDEX "subscriptions_current_period_end_idx" ON "subscriptions"("current_period_end");

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Таблица ссылок доступа
CREATE TABLE "access_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "resource_type" "ResourceType" NOT NULL,
    "target_url" TEXT NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "access_links_token_key" ON "access_links"("token");
CREATE INDEX "access_links_token_idx" ON "access_links"("token");
CREATE INDEX "access_links_user_id_idx" ON "access_links"("user_id");
CREATE INDEX "access_links_is_used_idx" ON "access_links"("is_used");

ALTER TABLE "access_links" ADD CONSTRAINT "access_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Таблица истории диалогов
CREATE TABLE "conversation_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ConversationRole" NOT NULL,
    "content" TEXT NOT NULL,
    "context_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conversation_logs_user_id_idx" ON "conversation_logs"("user_id");
CREATE INDEX "conversation_logs_created_at_idx" ON "conversation_logs"("created_at");

ALTER TABLE "conversation_logs" ADD CONSTRAINT "conversation_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Таблица сессий бота
CREATE TABLE "bot_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "current_state" "BotState" NOT NULL DEFAULT 'IDLE',
    "temp_data" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bot_sessions_user_id_key" ON "bot_sessions"("user_id");
CREATE INDEX "bot_sessions_user_id_idx" ON "bot_sessions"("user_id");

ALTER TABLE "bot_sessions" ADD CONSTRAINT "bot_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

