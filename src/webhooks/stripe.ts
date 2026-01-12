import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import { config } from '../config';
import { stripe } from '../services/stripe';
import { activateSubscription, cancelSubscription, inviteUserToClub } from '../services/subscription';
import { Bot } from 'grammy';
import { prisma } from '../database/client';

const router = express.Router();

/**
 * Initialize bot instance for webhook handlers
 * This will be set from main app
 */
let botInstance: Bot | null = null;

export function setBotInstance(bot: Bot): void {
  botInstance = bot;
}

/**
 * Stripe webhook handler
 */
router.post('/stripe', express.raw({ type: 'application/json' }), async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    res.status(400).send('Missing stripe-signature header');
    return;
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      config.stripe.webhookSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    res.status(400).send(`Webhook Error: ${err}`);
    return;
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
        break;
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Handle successful checkout
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const telegramId = session.client_reference_id;
  if (!telegramId) {
    console.error('No client_reference_id in checkout session');
    return;
  }

  const telegramIdNum = parseInt(telegramId);
  const subscriptionId = session.subscription as string;

  if (!subscriptionId) {
    console.error('No subscription ID in checkout session');
    return;
  }

  // Get subscription details from Stripe
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const productType = session.metadata?.product_type || 'premium';

  // Determine plan ID
  const planId = productType === 'premium' ? 'premium_hub' : 'test_drive';

  // Activate subscription
  await activateSubscription(
    telegramIdNum,
    subscriptionId,
    planId,
    new Date(subscription.current_period_end * 1000)
  );

  // Get or create Stripe customer
  const customerId = subscription.customer as string;
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramIdNum) },
  });

  if (user && !user.stripeCustomerId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  // Send invite link to club channel
  if (botInstance) {
    try {
      const inviteLink = await inviteUserToClub(botInstance, telegramIdNum);

      await botInstance.api.sendMessage(
        telegramIdNum,
        `✅ Оплата успешно обработана!\n\n` +
        `Добро пожаловать в AI Business HUB!\n\n` +
        `Используй эту ссылку для входа в закрытый канал:\n${inviteLink}\n\n` +
        `Ссылка одноразовая и действительна 24 часа.`
      );
    } catch (error) {
      console.error('Error sending invite link:', error);
    }
  }
}

/**
 * Handle subscription update
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const telegramId = subscription.metadata?.telegram_id;
  if (!telegramId) return;

  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: mapStripeStatus(subscription.status),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });
}

/**
 * Handle subscription deletion (cancellation)
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const telegramId = subscription.metadata?.telegram_id;
  if (!telegramId) return;

  const telegramIdNum = parseInt(telegramId);

  // Cancel subscription in database
  await cancelSubscription(subscription.id);

  // Kick user from club channel
  if (botInstance) {
    try {
      const { kickUserFromClub } = await import('../services/subscription');
      await kickUserFromClub(botInstance, telegramIdNum);

      await botInstance.api.sendMessage(
        telegramIdNum,
        `⚠️ Ваша подписка истекла, доступ к AI Business HUB приостановлен.\n\n` +
        `Чтобы вернуться и сохранить доступ к AI-менторам, оформите подписку заново.\n\n` +
        `Используйте команду /start для начала.`
      );
    } catch (error) {
      console.error('Error kicking user:', error);
    }
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const telegramId = subscription.metadata?.telegram_id;
  if (!telegramId) return;

  const telegramIdNum = parseInt(telegramId);

  // Update subscription status
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subscriptionId },
    data: {
      status: 'PAST_DUE',
    },
  });

  // Notify user
  if (botInstance) {
    try {
      await botInstance.api.sendMessage(
        telegramIdNum,
        `⚠️ Не удалось продлить подписку.\n\n` +
        `Пожалуйста, обновите карту в Stripe, иначе доступ будет закрыт через ${config.business.gracePeriodDays} дня.\n\n` +
        `Используйте команду /start для обновления платежной информации.`
      );
    } catch (error) {
      console.error('Error notifying user about failed payment:', error);
    }
  }
}

/**
 * Handle successful payment (renewal)
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const telegramId = subscription.metadata?.telegram_id;
  if (!telegramId) return;

  // Update subscription period
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subscriptionId },
    data: {
      status: 'ACTIVE',
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });
}

/**
 * Map Stripe subscription status to our enum
 */
function mapStripeStatus(status: Stripe.Subscription.Status): 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE' | 'TRIALING' {
  switch (status) {
    case 'active':
      return 'ACTIVE';
    case 'past_due':
      return 'PAST_DUE';
    case 'canceled':
    case 'unpaid':
      return 'CANCELED';
    case 'incomplete':
    case 'incomplete_expired':
      return 'INCOMPLETE';
    case 'trialing':
      return 'TRIALING';
    default:
      return 'INCOMPLETE';
  }
}

export default router;

