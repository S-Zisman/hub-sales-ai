import Stripe from 'stripe';
import { config } from '../config';

export const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

export interface CreateCheckoutParams {
  telegramId: number;
  priceId: string;
  promoCode?: string;
  productType: 'premium' | 'test_drive';
}

/**
 * Create Stripe Checkout Session with dynamic pricing
 * Falls back to static links if configured
 */
export async function createCheckoutSession(params: CreateCheckoutParams): Promise<string> {
  const { telegramId, priceId, promoCode, productType } = params;

  // Если используются статические ссылки, вернуть их
  if (config.stripe.useStaticLinks) {
    if (productType === 'premium' && config.stripe.staticPremiumLink) {
      return config.stripe.staticPremiumLink;
    }
    if (productType === 'test_drive' && config.stripe.staticTestDriveLink) {
      return config.stripe.staticTestDriveLink;
    }
  }

  // Если нет secretKey, нельзя создать сессию
  if (!config.stripe.secretKey || !priceId) {
    throw new Error('Stripe secret key or price ID not configured');
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `https://t.me/${config.telegram.username}?start=payment_success`,
    cancel_url: `https://t.me/${config.telegram.username}?start=payment_cancel`,
    client_reference_id: telegramId.toString(),
    metadata: {
      telegram_id: telegramId.toString(),
      product_type: productType,
      promo_code: promoCode || '',
    },
    subscription_data: {
      metadata: {
        telegram_id: telegramId.toString(),
        product_type: productType,
      },
    },
  };

  // Apply promo code if provided
  if (promoCode) {
    // First, find the promotion code by code string
    const promoCodes = await stripe.promotionCodes.list({
      code: promoCode,
      active: true,
      limit: 1,
    });

    if (promoCodes.data.length > 0) {
      sessionParams.discounts = [
        {
          promotion_code: promoCodes.data[0].id,
        },
      ];
    }
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  if (!session.url) {
    throw new Error('Failed to create checkout session URL');
  }

  return session.url;
}

/**
 * Get customer by Telegram ID
 */
export async function getCustomerByTelegramId(telegramId: number): Promise<Stripe.Customer | null> {
  // Search customers by metadata using search API
  const searchResult = await stripe.customers.search({
    query: `metadata['telegram_id']:'${telegramId.toString()}'`,
    limit: 1,
  });

  return searchResult.data[0] || null;
}

/**
 * Create or get Stripe customer for Telegram user
 */
export async function getOrCreateCustomer(
  telegramId: number,
  email?: string,
  name?: string
): Promise<Stripe.Customer> {
  let customer = await getCustomerByTelegramId(telegramId);

  if (!customer) {
    customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        telegram_id: telegramId.toString(),
      },
    });
  }

  return customer;
}


