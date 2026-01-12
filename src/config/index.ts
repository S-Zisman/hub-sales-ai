import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Telegram Bot
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN!,
    username: process.env.TELEGRAM_BOT_USERNAME || 'HUBSalesAI_bot',
    adminChatId: process.env.ADMIN_CHAT_ID ? parseInt(process.env.ADMIN_CHAT_ID) : undefined,
    clubChannelId: process.env.CLUB_CHANNEL_ID ? parseInt(process.env.CLUB_CHANNEL_ID) : undefined,
  },

  // Database
  database: {
    url: process.env.DATABASE_URL || 
      `postgresql://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}?sslmode=${process.env.DB_SSLMODE}`,
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
    publicKey: process.env.STRIPE_PUBLIC_KEY!,
    premiumPriceId: process.env.STRIPE_PREMIUM_PRICE_ID!,
    testDrivePriceId: process.env.STRIPE_TEST_DRIVE_PRICE_ID!,
    premiumPromoCode: process.env.PREMIUM_PROMO_CODE || 'PREMIUM17',
    testDrivePromoCode: process.env.TEST_DRIVE_PROMO_CODE || 'SOROKA',
    // Статические ссылки (опционально, для теста)
    staticTestDriveLink: process.env.STRIPE_STATIC_TEST_DRIVE_LINK,
    staticPremiumLink: process.env.STRIPE_STATIC_PREMIUM_LINK,
    useStaticLinks: process.env.USE_STATIC_STRIPE_LINKS === 'true',
  },

  // Claude API
  claude: {
    apiKey: process.env.KLAUDE_API_KEY!,
    apiUrl: process.env.KLAUDE_API_BASE_URL || 'https://api.anthropic.com/v1',
    model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20240620',
  },

  // OpenAI API (fallback)
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    useAsFallback: process.env.USE_OPENAI === 'true',
  },

  // Server
  server: {
    port: parseInt(process.env.PORT || '3000'),
    webhookPath: process.env.WEBHOOK_PATH || '/webhooks',
  },

  // Business Logic
  business: {
    premiumPrice: 17, // £17/month
    testDrivePrice: 9, // £9/month
    gracePeriodDays: 3,
    accessLinkExpiryHours: 24,
  },
} as const;

// Validate required environment variables
const requiredVars = [
  'TELEGRAM_BOT_TOKEN',
  'KLAUDE_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

for (const varName of requiredVars) {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}


