import { BotState } from '@prisma/client';
import { prisma } from '../database/client';
import { redis } from '../services/redis';

const STATE_KEY_PREFIX = 'bot:state:';
const TEMP_DATA_PREFIX = 'bot:temp:';

/**
 * Get current bot state for user
 */
export async function getBotState(telegramId: number): Promise<BotState> {
  const key = `${STATE_KEY_PREFIX}${telegramId}`;
  const state = await redis.get(key);

  if (state) {
    return state as BotState;
  }

  // Try to get from database
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
    include: { botSessions: true },
  });

  if (user?.botSessions?.[0]) {
    const dbState = user.botSessions[0].currentState;
    // Cache in Redis
    await redis.set(key, dbState);
    return dbState;
  }

  return BotState.IDLE;
}

/**
 * Set bot state for user
 */
export async function setBotState(telegramId: number, state: BotState): Promise<void> {
  const key = `${STATE_KEY_PREFIX}${telegramId}`;
  await redis.set(key, state);

  // Also save to database
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });

  if (user) {
    await prisma.botSession.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        currentState: state,
      },
      update: {
        currentState: state,
        updatedAt: new Date(),
      },
    });
  }
}

/**
 * Get temporary data for user (JSON)
 */
export async function getTempData<T = any>(telegramId: number): Promise<T | null> {
  const key = `${TEMP_DATA_PREFIX}${telegramId}`;
  const data = await redis.get(key);

  if (!data) {
    // Try database
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      include: { botSessions: true },
    });

    if (user?.botSessions?.[0]?.tempData) {
      return JSON.parse(user.botSessions[0].tempData);
    }

    return null;
  }

  return JSON.parse(data);
}

/**
 * Set temporary data for user (JSON)
 */
export async function setTempData(telegramId: number, data: any): Promise<void> {
  const key = `${TEMP_DATA_PREFIX}${telegramId}`;
  await redis.set(key, JSON.stringify(data));

  // Also save to database
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });

  if (user) {
    await prisma.botSession.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        tempData: JSON.stringify(data),
      },
      update: {
        tempData: JSON.stringify(data),
        updatedAt: new Date(),
      },
    });
  }
}

/**
 * Clear all state for user (on reset)
 */
export async function clearState(telegramId: number): Promise<void> {
  const stateKey = `${STATE_KEY_PREFIX}${telegramId}`;
  const tempKey = `${TEMP_DATA_PREFIX}${telegramId}`;

  await redis.del(stateKey, tempKey);

  // Also clear in database
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });

  if (user) {
    await prisma.botSession.updateMany({
      where: { userId: user.id },
      data: {
        currentState: BotState.IDLE,
        tempData: null,
      },
    });
  }
}


