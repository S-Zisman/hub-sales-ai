import { Queue, Worker } from 'bullmq';
import { redis } from './redis';
import { Bot } from 'grammy';

// Broadcast queue for sending messages
export const broadcastQueue = new Queue('broadcast', { connection: redis });

/**
 * Initialize broadcast worker
 */
export function initBroadcastWorker(bot: Bot): void {
  const worker = new Worker(
    'broadcast',
    async (job) => {
      const { telegramId, message } = job.data;

      try {
        await bot.api.sendMessage(telegramId, message);
        console.log(`Broadcast sent to ${telegramId}`);
      } catch (error) {
        console.error(`Error sending broadcast to ${telegramId}:`, error);
        throw error;
      }
    },
    {
      connection: redis,
      limiter: {
        max: 25, // 25 messages per second (Telegram limit is 30)
        duration: 1000,
      },
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    console.log(`Broadcast job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Broadcast job ${job?.id} failed:`, err);
  });
}


