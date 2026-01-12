import { prisma } from '../database/client';
import { Bot } from 'grammy';
import { config } from '../config';
import crypto from 'crypto';

/**
 * Generate one-time access link for club channel
 */
export async function generateAccessLink(
  userId: string,
  resourceType: 'GAMMA_PAGE' | 'PDF_DOWNLOAD' | 'ZOOM_LINK',
  targetUrl: string,
  expiresInHours: number = 24
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + expiresInHours);

  await prisma.accessLink.create({
    data: {
      userId,
      token,
      resourceType,
      targetUrl,
      expiresAt,
    },
  });

  // Return full URL with token
  return `${config.server.webhookPath}/access/${token}`;
}

/**
 * Validate and use access link
 */
export async function validateAccessLink(token: string): Promise<{
  valid: boolean;
  targetUrl?: string;
  userId?: string;
}> {
  const link = await prisma.accessLink.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!link) {
    return { valid: false };
  }

  if (link.isUsed) {
    return { valid: false };
  }

  if (new Date() > link.expiresAt) {
    return { valid: false };
  }

  // Mark as used
  await prisma.accessLink.update({
    where: { id: link.id },
    data: { isUsed: true },
  });

  return {
    valid: true,
    targetUrl: link.targetUrl,
    userId: link.userId,
  };
}

/**
 * Kick Protocol: Remove user from club channel
 */
export async function kickUserFromClub(
  bot: Bot,
  telegramId: number
): Promise<void> {
  if (!config.telegram.clubChannelId) {
    console.warn('Club channel ID not configured');
    return;
  }

  const chatId = config.telegram.clubChannelId;

  try {
    // Step 1: Ban user (removes from channel)
    await bot.api.banChatMember(chatId, telegramId);

    // Step 2: Immediately unban (removes from blacklist, but doesn't add back)
    // Wait a bit to ensure ban is processed
    await new Promise(resolve => setTimeout(resolve, 2000));
    await bot.api.unbanChatMember(chatId, telegramId);

    console.log(`User ${telegramId} kicked from club channel`);
  } catch (error) {
    console.error(`Error kicking user ${telegramId}:`, error);
    throw error;
  }
}

/**
 * Invite user to club channel with one-time link
 */
export async function inviteUserToClub(
  bot: Bot,
  telegramId: number
): Promise<string> {
  if (!config.telegram.clubChannelId) {
    throw new Error('Club channel ID not configured');
  }

  const chatId = config.telegram.clubChannelId;

  try {
    const inviteLink = await bot.api.createChatInviteLink(chatId, {
      member_limit: 1,
      name: `User ${telegramId} Payment`,
      creates_join_request: false,
    });

    return inviteLink.invite_link;
  } catch (error) {
    console.error(`Error creating invite link for user ${telegramId}:`, error);
    throw error;
  }
}

/**
 * Activate subscription after successful payment
 */
export async function activateSubscription(
  telegramId: number,
  stripeSubscriptionId: string,
  planId: string,
  currentPeriodEnd: Date
): Promise<void> {
  // Find or create user
  let user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });

  if (!user) {
    // This shouldn't happen, but handle gracefully
    throw new Error(`User with telegram_id ${telegramId} not found`);
  }

  // Update or create subscription
  await prisma.subscription.upsert({
    where: { stripeSubscriptionId },
    create: {
      userId: user.id,
      stripeSubscriptionId,
      status: 'ACTIVE',
      currentPeriodEnd,
      planId,
      autoRenew: true,
    },
    update: {
      status: 'ACTIVE',
      currentPeriodEnd,
      planId,
    },
  });

  // Update user status
  await prisma.user.update({
    where: { id: user.id },
    data: {
      crmStatus: 'CUSTOMER',
      updatedAt: new Date(),
    },
  });
}

/**
 * Cancel subscription (called on webhook)
 */
export async function cancelSubscription(stripeSubscriptionId: string): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
    include: { user: true },
  });

  if (!subscription) {
    console.warn(`Subscription ${stripeSubscriptionId} not found`);
    return;
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: 'CANCELED',
    },
  });

  // Update user status
  await prisma.user.update({
    where: { id: subscription.userId },
    data: {
      crmStatus: 'CHURNED',
      updatedAt: new Date(),
    },
  });
}

/**
 * Check for expired subscriptions and kick users
 */
export async function checkExpiredSubscriptions(bot: Bot): Promise<number> {
  const now = new Date();
  const gracePeriodEnd = new Date();
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + config.business.gracePeriodDays);

  // Find subscriptions that expired but are still active
  const expiredSubs = await prisma.subscription.findMany({
    where: {
      status: {
        in: ['ACTIVE', 'PAST_DUE'],
      },
      currentPeriodEnd: {
        lt: now,
      },
    },
    include: {
      user: true,
    },
  });

  let kickedCount = 0;

  for (const sub of expiredSubs) {
    // Check if grace period has passed
    if (sub.currentPeriodEnd < now) {
      const telegramId = Number(sub.user.telegramId);
      
      try {
        await kickUserFromClub(bot, telegramId);
        await cancelSubscription(sub.stripeSubscriptionId);
        kickedCount++;
      } catch (error) {
        console.error(`Error processing expired subscription ${sub.id}:`, error);
      }
    }
  }

  return kickedCount;
}

