import { Context, InlineKeyboard } from 'grammy';
import { prisma } from '../database/client';
import { getBotState, setBotState, getTempData, setTempData, clearState } from './fsm';
import { BotState } from '@prisma/client';
import { generateSalesResponse } from '../services/claude';
import { createCheckoutSession } from '../services/stripe';
import { config } from '../config';
// inviteUserToClub is used in webhooks, not here

/**
 * Handle /start command
 */
export async function handleStart(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;
  const startParam = ctx.match as string | undefined;

  // Find or create user
  let user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        telegramId: BigInt(telegramId),
        username: ctx.from.username || null,
        firstName: ctx.from.first_name || null,
        lastName: ctx.from.last_name || null,
        crmStatus: 'NEW',
      },
    });
  } else {
    // Update user info
    await prisma.user.update({
      where: { id: user.id },
      data: {
        username: ctx.from.username || null,
        firstName: ctx.from.first_name || null,
        lastName: ctx.from.last_name || null,
      },
    });
  }

  // Handle special start parameters
  if (startParam === 'payment_success') {
    await ctx.reply('✅ Оплата успешно обработана! Проверяю ваш доступ...');
    // Webhook should have already handled this, but we can verify
    return;
  }

  if (startParam === 'payment_cancel') {
    await ctx.reply('Оплата отменена. Если у вас возникли вопросы, напишите мне.');
    return;
  }

  // Track source if from Gamma landing
  if (startParam?.startsWith('gamma_')) {
    // Could store source in user metadata
  }

  // Reset state and start qualification
  await clearState(telegramId);
  await setBotState(telegramId, BotState.QUALIFICATION);

  const welcomeMessage = `Привет! Я ИИ-консультант AI Business HUB.

Расскажу Вам все про AI Business HUB и Помогу подобрать подходящий пакет для вашего бизнеса. Начнем?`;

  await ctx.reply(welcomeMessage);

  // Start qualification
  await handleQualification(ctx);
}

/**
 * Handle qualification stage
 */
async function handleQualification(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const tempData = await getTempData<{
    niche?: string;
    revenue?: string;
    teamSize?: string;
    painPoints?: string[];
  }>(telegramId) || {};

  // Determine which question to ask
  if (!tempData.niche) {
    await ctx.reply('В какой нише работает твой бизнес?');
    return;
  }

  if (!tempData.revenue) {
    await ctx.reply('Какой у тебя месячный оборот? (примерно)');
    return;
  }

  if (!tempData.teamSize) {
    await ctx.reply('Сколько человек в твоей команде?');
    return;
  }

  // All qualification questions answered
  await setBotState(telegramId, BotState.PROBLEM_AMPLIFICATION);

  // Update user in database
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });

  if (user) {
    // Calculate lead score
    let score = 0;
    if (tempData.revenue) {
      const revenue = parseInt(tempData.revenue);
      if (revenue > 50000) score += 30;
      else if (revenue > 10000) score += 20;
      else if (revenue > 5000) score += 10;
    }
    if (tempData.teamSize) {
      const team = parseInt(tempData.teamSize);
      if (team > 10) score += 20;
      else if (team > 3) score += 10;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        leadScore: score,
        crmStatus: score > 30 ? 'QUALIFIED' : 'WARM',
      },
    });
  }

  // Move to problem amplification
  await handleProblemAmplification(ctx);
}

/**
 * Handle problem amplification stage
 */
async function handleProblemAmplification(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const tempData = await getTempData(telegramId) || {};

  const context = {
    stage: 'PROBLEM_AMPLIFICATION',
    userData: tempData,
  };

  const aiResponse = await generateSalesResponse(
    ctx.message?.text || '',
    context
  );

  await ctx.reply(aiResponse);

  // Check if user mentioned pain points
  const message = ctx.message?.text?.toLowerCase() || '';
  if (message.includes('хаос') || message.includes('проблем') || message.includes('трудн')) {
    if (!tempData.painPoints) {
      tempData.painPoints = [];
    }
    tempData.painPoints.push(message);
    await setTempData(telegramId, tempData);

    // Move to solution presentation
    await setBotState(telegramId, BotState.SOLUTION_PRESENTATION);
  }
}

/**
 * Handle solution presentation stage
 */
async function handleSolutionPresentation(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const tempData = await getTempData(telegramId) || {};

  const context = {
    stage: 'SOLUTION_PRESENTATION',
    userData: tempData,
  };

  const aiResponse = await generateSalesResponse(
    ctx.message?.text || '',
    context
  );

  await ctx.reply(aiResponse);

  // Determine which product to offer
  const isQualified = (tempData.revenue && parseInt(tempData.revenue) > 10000) ||
                     (tempData.teamSize && parseInt(tempData.teamSize) > 3);

  if (isQualified) {
    // Offer Premium
    await offerPremium(ctx);
  } else {
    // Offer Test-Drive
    await offerTestDrive(ctx);
  }
}

/**
 * Offer Premium subscription
 */
async function offerPremium(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const checkoutUrl = await createCheckoutSession({
    telegramId,
    priceId: config.stripe.premiumPriceId,
    promoCode: config.stripe.premiumPromoCode,
    productType: 'premium',
  });

  const keyboard = new InlineKeyboard()
    .url('💳 Оплатить и вступить', checkoutUrl);

  await ctx.reply(
    `🎯 Premium Club — полный доступ к AI Business HUB

💰 Цена: £57/мес (со скидкой £17/мес с промокодом PREMIUM17)

✅ Что включено:
• Доступ к закрытому каналу с AI-менторами
• Еженедельные мастер-классы
• Приоритетная поддержка
• Все материалы и ресурсы

Нажми кнопку ниже, чтобы оформить подписку:`,
    { reply_markup: keyboard }
  );
}

/**
 * Offer Test-Drive subscription
 */
async function offerTestDrive(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const checkoutUrl = await createCheckoutSession({
    telegramId,
    priceId: config.stripe.testDrivePriceId,
    promoCode: config.stripe.testDrivePromoCode,
    productType: 'test_drive',
  });

  const keyboard = new InlineKeyboard()
    .url('🚀 Начать тест-драйв', checkoutUrl);

  await ctx.reply(
    `🎯 Test-Drive — попробуй экосистему за £13/мес

💰 Цена: £13/мес (со скидкой £9/мес с промокодом SOROKA)

✅ Что включено:
• Ограниченный доступ к материалам
• Базовые AI-консультации
• Возможность апгрейда до Premium

Нажми кнопку ниже, чтобы начать:`,
    { reply_markup: keyboard }
  );
}

/**
 * Handle regular messages (AI conversation)
 */
export async function handleMessage(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId || !ctx.message?.text) return;

  const state = await getBotState(telegramId);
  const tempData = await getTempData(telegramId) || {};

  // Save conversation to log
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });

  if (user) {
    await prisma.conversationLog.create({
      data: {
        userId: user.id,
        role: 'USER',
        content: ctx.message.text,
      },
    });
  }

  // Route based on state
  switch (state) {
    case BotState.IDLE:
      await handleStart(ctx);
      break;

    case BotState.QUALIFICATION:
      // Store answer and move to next question
      const message = ctx.message.text;
      if (!tempData.niche) {
        tempData.niche = message;
        await setTempData(telegramId, tempData);
        await handleQualification(ctx);
      } else if (!tempData.revenue) {
        tempData.revenue = message;
        await setTempData(telegramId, tempData);
        await handleQualification(ctx);
      } else if (!tempData.teamSize) {
        tempData.teamSize = message;
        await setTempData(telegramId, tempData);
        await handleQualification(ctx);
      }
      break;

    case BotState.PROBLEM_AMPLIFICATION:
      await handleProblemAmplification(ctx);
      break;

    case BotState.SOLUTION_PRESENTATION:
      await handleSolutionPresentation(ctx);
      break;

    case BotState.CLOSING:
      // Handle closing stage
      const messageText = ctx.message.text;
      const closingContext = {
        stage: 'CLOSING',
        userData: tempData,
      };
      const aiResponse = await generateSalesResponse(messageText, closingContext);
      await ctx.reply(aiResponse);
      break;

    default:
      await ctx.reply('Начни с команды /start');
  }
}

