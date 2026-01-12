#!/bin/bash

# Скрипт деплоя HUB SALES AI на DigitalOcean сервер
# Использование: ./deploy.sh

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Конфигурация сервера
SERVER_IP="164.92.248.246"
SERVER_USER="root"
SERVER_PASSWORD="CanadaChili2025$end"
PROJECT_DIR="/opt/hub-sales-ai"

echo -e "${GREEN}🚀 Начинаю деплой HUB SALES AI на сервер...${NC}"

# Проверка наличия SSH ключа или установка sshpass
if ! command -v sshpass &> /dev/null; then
    echo -e "${YELLOW}Устанавливаю sshpass для подключения по паролю...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install hudochenkov/sshpass/sshpass
    else
        echo "Установите sshpass: sudo apt install sshpass"
        exit 1
    fi
fi

# Функция для выполнения команд на сервере
run_remote() {
    sshpass -p "$SERVER_PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_IP" "$1"
}

# Функция для копирования файлов
copy_files() {
    sshpass -p "$SERVER_PASSWORD" scp -o StrictHostKeyChecking=no -r "$1" "$SERVER_USER@$SERVER_IP:$2"
}

echo -e "${YELLOW}📦 Шаг 1: Проверка подключения к серверу...${NC}"
if ! run_remote "echo 'Connection OK'"; then
    echo -e "${RED}❌ Не удалось подключиться к серверу${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Подключение установлено${NC}"

echo -e "${YELLOW}📦 Шаг 2: Установка Docker и Docker Compose...${NC}"
run_remote "
    if ! command -v docker &> /dev/null; then
        curl -fsSL https://get.docker.com -o get-docker.sh
        sh get-docker.sh
        rm get-docker.sh
    fi
    
    if ! command -v docker compose &> /dev/null; then
        apt-get update
        apt-get install -y docker-compose-plugin
    fi
"
echo -e "${GREEN}✅ Docker установлен${NC}"

echo -e "${YELLOW}📦 Шаг 3: Создание директории проекта...${NC}"
run_remote "mkdir -p $PROJECT_DIR"
echo -e "${GREEN}✅ Директория создана${NC}"

echo -e "${YELLOW}📦 Шаг 4: Копирование файлов проекта...${NC}"
# Копируем все файлы кроме node_modules и .git
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'dist' \
    -e "sshpass -p '$SERVER_PASSWORD' ssh -o StrictHostKeyChecking=no" \
    ./ "$SERVER_USER@$SERVER_IP:$PROJECT_DIR/"

echo -e "${GREEN}✅ Файлы скопированы${NC}"

echo -e "${YELLOW}📦 Шаг 5: Настройка переменных окружения...${NC}"
run_remote "
    cd $PROJECT_DIR
    if [ ! -f .env ]; then
        cp .env.example .env
        echo '⚠️  ВАЖНО: Отредактируйте .env файл на сервере!'
    fi
"

echo -e "${YELLOW}📦 Шаг 6: Установка Node.js (если нужно)...${NC}"
run_remote "
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    fi
"

echo -e "${YELLOW}📦 Шаг 7: Установка зависимостей и настройка БД...${NC}"
run_remote "
    cd $PROJECT_DIR
    npm install
    npm run db:generate
    echo '⚠️  ВАЖНО: Примените миграции: npm run db:migrate'
"

echo -e "${YELLOW}📦 Шаг 8: Настройка Nginx и SSL...${NC}"
run_remote "
    if ! command -v nginx &> /dev/null; then
        apt-get update
        apt-get install -y nginx certbot python3-certbot-nginx
    fi
"

echo -e "${GREEN}✅ Базовая установка завершена!${NC}"
echo ""
echo -e "${YELLOW}📋 Следующие шаги (выполните вручную на сервере):${NC}"
echo ""
echo "1. Подключитесь к серверу:"
echo "   ssh root@$SERVER_IP"
echo ""
echo "2. Отредактируйте .env файл:"
echo "   cd $PROJECT_DIR"
echo "   nano .env"
echo "   (Заполните все переменные, особенно Stripe keys)"
echo ""
echo "3. Примените миграции БД:"
echo "   npm run db:migrate"
echo ""
echo "4. Настройте SSL сертификат:"
echo "   certbot certonly --standalone -d api.sorokafes.com"
echo ""
echo "5. Обновите nginx.conf с путями к сертификатам"
echo ""
echo "6. Запустите проект:"
echo "   docker-compose up -d"
echo ""
echo "7. Проверьте логи:"
echo "   docker-compose logs -f app"
echo ""
echo -e "${GREEN}✨ Готово!${NC}"

