import express from 'express';
import { createBot } from './bot';
import { config } from './config';
import stripeWebhook from './webhooks/stripe';
import { checkExpiredSubscriptions } from './services/subscription';
import { initBroadcastWorker } from './services/queue';

// Initialize bot
const bot = createBot();

// Initialize broadcast worker
initBroadcastWorker(bot);

// Set bot instance for webhooks
import('./webhooks/stripe').then(module => {
  module.setBotInstance(bot);
});

// Start bot (using long polling for development, webhook for production)
const webhookUrl = process.env.WEBHOOK_URL;
const useWebhook = process.env.NODE_ENV === 'production' && webhookUrl && !webhookUrl.startsWith('#');

if (useWebhook) {
  // Webhook mode
  const fullWebhookUrl = `${webhookUrl}/bot/webhook`;
  bot.api.setWebhook(fullWebhookUrl).then(() => {
    console.log('Webhook set:', fullWebhookUrl);
  }).catch((err) => {
    console.error('Failed to set webhook, falling back to long polling:', err);
    bot.start();
  });

  // Webhook endpoint
  const app = express();
  app.use(express.json());

  app.post('/bot/webhook', async (req: express.Request, res: express.Response) => {
    try {
      await bot.handleUpdate(req.body);
      res.sendStatus(200);
    } catch (error) {
      console.error('Webhook error:', error);
      res.sendStatus(500);
    }
  });

  app.use('/webhooks', stripeWebhook);

  app.listen(config.server.port, () => {
    console.log(`Server running on port ${config.server.port}`);
  });
} else {
  // Long polling mode (development or when webhook URL not set)
  console.log('Starting bot in long polling mode...');
  
  // Delete any existing webhook first
  bot.api.deleteWebhook({ drop_pending_updates: true }).then(() => {
    console.log('Webhook deleted (if existed)');
  }).catch((err) => {
    console.log('No webhook to delete or error:', err.message);
  }).finally(() => {
    // Start long polling with channel_post updates
    console.log('Starting bot.start()...');
    bot.start({
      allowed_updates: ['message', 'channel_post', 'callback_query'],
    }).then(() => {
      console.log('Bot started successfully, waiting for updates (including channel posts)...');
    }).catch((err) => {
      console.error('Failed to start bot:', err);
    });
  });

  // Also start webhook server for Stripe
  const app = express();
  app.use(express.json());
  app.use('/webhooks', stripeWebhook);

  app.listen(config.server.port, () => {
    console.log(`Webhook server running on port ${config.server.port}`);
  });
}

// Schedule expired subscription check (run every hour)
setInterval(async () => {
  try {
    const kicked = await checkExpiredSubscriptions(bot);
    if (kicked > 0) {
      console.log(`Kicked ${kicked} users with expired subscriptions`);
    }
  } catch (error) {
    console.error('Error checking expired subscriptions:', error);
  }
}, 60 * 60 * 1000); // 1 hour

console.log('HUB Sales AI Bot started');

