import { Context, InlineKeyboard, Bot } from 'grammy';
import { prisma } from '../database/client';
import { config } from '../config';
import { broadcastQueue } from '../services/queue';
import { CrmStatus } from '@prisma/client';
import { inviteUserToClub, kickUserFromClub } from '../services/subscription';

/**
 * Check if user is admin (including super admin from env)
 */
async function isAdmin(telegramId: number): Promise<boolean> {
  // Check super admin from env
  const superAdminId = process.env.SUPER_ADMIN_ID;
  if (superAdminId && telegramId.toString() === superAdminId.toString()) {
    return true;
  }

  // Check in database
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramId) },
  });

  return user?.isAdmin || false;
}

/**
 * Admin menu command: /admin
 */
export async function handleAdmin(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId || !(await isAdmin(telegramId))) {
    await ctx.reply('❌ У вас нет доступа к админским функциям');
    return;
  }

    const menuMessage = `🔐 **АДМИНСКАЯ ПАНЕЛЬ AI Business HUB**

Доступные команды:

📊 /stats - общая статистика и конверсия
👥 /leads [статус] - список лидов по статусам
  Примеры:
  • /leads - все последние лиды
  • /leads NEW - новые лиды
  • /leads QUALIFIED - квалифицированные
  • /leads CUSTOMER - клиенты

🔥 /hot - топ лидов с высокой вероятностью конверсии

💬 /conversation [telegram_id] - просмотр диалога лида
  Пример: /conversation 199140013

👤 /lead [telegram_id] - карточка лида
  Пример: /lead 199140013

📢 /broadcast - рассылка сообщений

🔑 **Управление доступом к клубу:**
➕ /add_access [telegram_id] - предоставить доступ вручную
➖ /remove_access [telegram_id] - удалить доступ
📋 /get_channel_id - получить ID канала для настройки

Статусы для команды /leads:
• NEW - новые
• QUALIFIED - квалифицированные
• WARM - теплые
• CUSTOMER - клиенты
• CHURNED - отписались
• VIP - VIP клиенты`;

  await ctx.reply(menuMessage, { parse_mode: 'Markdown' });
}

/**
 * Admin command: /stats - Dashboard statistics with detailed breakdown
 */
export async function handleStats(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId || !(await isAdmin(telegramId))) {
    await ctx.reply('❌ У вас нет доступа к этой команде.');
    return;
  }

  try {
    await ctx.replyWithChatAction('typing');

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);

    // Get statistics
    const [
      totalUsers,
      newLeadsToday,
      newLeadsWeek,
      activeSubscriptions,
      totalCustomers,
      todaySales,
      weekSales,
      statusStats,
    ] = await Promise.all([
      // Total users
      prisma.user.count(),
      // New leads today
      prisma.user.count({
        where: {
          createdAt: { gte: todayStart },
          crmStatus: { in: ['NEW', 'QUALIFIED', 'WARM'] },
        },
      }),
      // New leads this week
      prisma.user.count({
        where: {
          createdAt: { gte: weekStart },
          crmStatus: { in: ['NEW', 'QUALIFIED', 'WARM'] },
        },
      }),
      // Active subscriptions
      prisma.subscription.count({
        where: {
          status: 'ACTIVE',
          currentPeriodEnd: { gt: new Date() },
        },
      }),
      // Total customers
      prisma.user.count({
        where: { crmStatus: 'CUSTOMER' },
      }),
      // Sales today (subscriptions created today)
      prisma.subscription.count({
        where: {
          createdAt: { gte: todayStart },
          status: 'ACTIVE',
        },
      }),
      // Sales this week
      prisma.subscription.count({
        where: {
          createdAt: { gte: weekStart },
          status: 'ACTIVE',
        },
      }),
      // Status breakdown
      prisma.user.groupBy({
        by: ['crmStatus'],
        _count: true,
      }),
    ]);

    // Calculate MRR (Monthly Recurring Revenue)
    const activeSubs = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        currentPeriodEnd: { gt: new Date() },
      },
      include: { user: true },
    });

    let mrr = 0;
    let premiumCount = 0;
    let testDriveCount = 0;
    for (const sub of activeSubs) {
      if (sub.planId === 'premium_hub') {
        mrr += config.business.premiumPrice;
        premiumCount++;
      } else if (sub.planId === 'test_drive') {
        mrr += config.business.testDrivePrice;
        testDriveCount++;
      }
    }

    const conversionRate = totalUsers > 0 
      ? ((totalCustomers / totalUsers) * 100).toFixed(1) 
      : '0';

    const statusEmojis: Record<CrmStatus, string> = {
      NEW: '🆕',
      QUALIFIED: '✅',
      WARM: '🔥',
      CUSTOMER: '💰',
      CHURNED: '❌',
      VIP: '⭐',
    };

    const statusNames: Record<CrmStatus, string> = {
      NEW: 'Новые',
      QUALIFIED: 'Квалифицированы',
      WARM: 'Теплые',
      CUSTOMER: 'Клиенты',
      CHURNED: 'Отписались',
      VIP: 'VIP',
    };

    let statsMessage = `📊 **СТАТИСТИКА AI Business HUB**\n\n`;
    statsMessage += `👥 Всего пользователей: *${totalUsers}*\n`;
    statsMessage += `💰 Клиентов: *${totalCustomers}*\n`;
    statsMessage += `📈 Конверсия: *${conversionRate}%*\n\n`;

    statsMessage += `📅 **СЕГОДНЯ:**\n`;
    statsMessage += `🆕 Новых лидов: ${newLeadsToday}\n`;
    statsMessage += `💰 Продаж: ${todaySales}\n\n`;

    statsMessage += `📅 **ЗА НЕДЕЛЮ:**\n`;
    statsMessage += `🆕 Новых лидов: ${newLeadsWeek}\n`;
    statsMessage += `💰 Продаж: ${weekSales}\n\n`;

    statsMessage += `👥 **ПОДПИСКИ:**\n`;
    statsMessage += `• Активных: ${activeSubscriptions}\n`;
    statsMessage += `• Premium: ${premiumCount}\n`;
    statsMessage += `• Test-Drive: ${testDriveCount}\n\n`;

    statsMessage += `💵 **MRR (месячный доход):**\n`;
    statsMessage += `£${mrr.toFixed(2)}/мес\n\n`;

    statsMessage += `📍 **ПО СТАТУСАМ:**\n`;
    for (const stat of statusStats) {
      const emoji = statusEmojis[stat.crmStatus] || '•';
      const name = statusNames[stat.crmStatus] || stat.crmStatus;
      const percentage = totalUsers > 0 
        ? ((stat._count / totalUsers) * 100).toFixed(1) 
        : '0';
      statsMessage += `${emoji} ${name}: ${stat._count} (${percentage}%)\n`;
    }

    statsMessage += `\n📅 Обновлено: ${new Date().toLocaleString('ru-RU')}`;

    // Create inline keyboard for status filters
    const keyboard = new InlineKeyboard();
    const statuses: CrmStatus[] = ['NEW', 'QUALIFIED', 'WARM', 'CUSTOMER', 'CHURNED', 'VIP'];
    
    // Add buttons in rows of 2
    for (let i = 0; i < statuses.length; i += 2) {
      const row: any[] = [];
      row.push({
        text: `${statusEmojis[statuses[i]]} ${statuses[i]} (${statusStats.find(s => s.crmStatus === statuses[i])?._count || 0})`,
        callback_data: `leads_${statuses[i]}`,
      });
      
      if (i + 1 < statuses.length) {
        row.push({
          text: `${statusEmojis[statuses[i + 1]]} ${statuses[i + 1]} (${statusStats.find(s => s.crmStatus === statuses[i + 1])?._count || 0})`,
          callback_data: `leads_${statuses[i + 1]}`,
        });
      }
      
      keyboard.row(...row);
    }

    await ctx.reply(statsMessage, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });

  } catch (error) {
    console.error('Error in handleStats:', error);
    await ctx.reply('❌ Ошибка при получении статистики');
  }
}

/**
 * Admin command: /leads [status] - Get leads by status
 */
export async function handleLeads(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId || !(await isAdmin(telegramId))) {
    await ctx.reply('❌ У вас нет доступа к этой команде.');
    return;
  }

  try {
    await ctx.replyWithChatAction('typing');

    // Extract status from command text
    const text = ctx.message?.text || '';
    const match = text.match(/^\/leads(?:\s+(.+))?$/);
    const statusParam = match?.[1]?.trim();
    const status = statusParam?.toUpperCase() as CrmStatus | undefined;

    const leads = await prisma.user.findMany({
      where: status ? { crmStatus: status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        subscriptions: {
          where: { status: 'ACTIVE' },
          take: 1,
        },
      },
    });

    if (leads.length === 0) {
      await ctx.reply(`📋 *СПИСОК ЛИДОВ*\n\nНет лидов${status ? ` со статусом ${status}` : ''}`);
      return;
    }

    const title = status 
      ? `ЛИДЫ СО СТАТУСОМ: ${status}` 
      : 'ПОСЛЕДНИЕ ЛИДЫ';

    let message = `📋 *${title}*\n\n`;

    leads.forEach((lead, index) => {
      const lastInteraction = lead.updatedAt.toLocaleDateString('ru-RU');
      const activeSub = lead.subscriptions[0];
      
      message += `${index + 1}. *${lead.firstName || 'Без имени'}* (@${lead.username || 'нет'})\n`;
      message += `   Статус: ${lead.crmStatus}\n`;
      message += `   Lead Score: ${lead.leadScore}\n`;
      if (activeSub) {
        message += `   Подписка: ${activeSub.planId} (до ${activeSub.currentPeriodEnd.toLocaleDateString('ru-RU')})\n`;
      }
      message += `   Последний контакт: ${lastInteraction}\n`;
      message += `   ID: \`${lead.telegramId}\`\n\n`;
    });

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error in handleLeads:', error);
    await ctx.reply('❌ Ошибка при получении лидов');
  }
}

/**
 * Admin command: /hot - Get hot leads (high lead score)
 */
export async function handleHot(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId || !(await isAdmin(telegramId))) {
    await ctx.reply('❌ У вас нет доступа к этой команде.');
    return;
  }

  try {
    await ctx.replyWithChatAction('typing');

    const leads = await prisma.user.findMany({
      where: {
        crmStatus: { not: 'CUSTOMER' },
        leadScore: { gt: 0 },
      },
      orderBy: [
        { leadScore: 'desc' },
        { updatedAt: 'desc' },
      ],
      take: 10,
      include: {
        subscriptions: {
          where: { status: 'ACTIVE' },
          take: 1,
        },
      },
    });

    if (leads.length === 0) {
      await ctx.reply('🔥 *ГОРЯЧИЕ ЛИДЫ*\n\nНет лидов с высокой вероятностью конверсии');
      return;
    }

    let message = `🔥 *ГОРЯЧИЕ ЛИДЫ (высокая вероятность конверсии)*\n\n`;

    leads.forEach((lead, index) => {
      const lastInteraction = lead.updatedAt.toLocaleDateString('ru-RU');
      
      message += `${index + 1}. *${lead.firstName || 'Без имени'}* (@${lead.username || 'нет'})\n`;
      message += `   Статус: ${lead.crmStatus}\n`;
      message += `   Lead Score: ${lead.leadScore}\n`;
      message += `   Последний контакт: ${lastInteraction}\n`;
      message += `   ID: \`${lead.telegramId}\`\n\n`;
    });

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error in handleHot:', error);
    await ctx.reply('❌ Ошибка при получении горячих лидов');
  }
}

/**
 * Admin command: /conversation [telegram_id] - Get conversation history
 */
export async function handleConversation(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId || !(await isAdmin(telegramId))) {
    await ctx.reply('❌ У вас нет доступа к этой команде.');
    return;
  }

  try {
    await ctx.replyWithChatAction('typing');

    // Extract telegram_id from command text
    const text = ctx.message?.text || '';
    const match = text.match(/^\/conversation\s+(.+)$/);
    const telegramIdParam = match?.[1]?.trim();
    
    if (!telegramIdParam) {
      await ctx.reply('Использование: /conversation [telegram_id]');
      return;
    }

    const targetTelegramId = BigInt(telegramIdParam);
    const user = await prisma.user.findUnique({
      where: { telegramId: targetTelegramId },
      include: {
        subscriptions: true,
        conversationLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!user) {
      await ctx.reply(`❌ Пользователь с ID ${match} не найден.`);
      return;
    }

    const activeSub = user.subscriptions.find(s => s.status === 'ACTIVE');

    let message = `💬 *ДИАЛОГ С ЛИДОМ*\n\n`;
    message += `👤 *Имя:* ${user.firstName || 'Не указано'} ${user.lastName || ''}\n`;
    message += `📱 *Username:* @${user.username || 'нет'}\n`;
    message += `📍 *Статус:* ${user.crmStatus}\n`;
    message += `🎯 *Lead Score:* ${user.leadScore}\n\n`;

    if (activeSub) {
      message += `💳 *Подписка:*\n`;
      message += `• Статус: ${activeSub.status}\n`;
      message += `• План: ${activeSub.planId}\n`;
      message += `• До: ${activeSub.currentPeriodEnd.toLocaleDateString('ru-RU')}\n\n`;
    }

    message += `📝 *ИСТОРИЯ (последние 10 сообщений):*\n\n`;

    if (user.conversationLogs.length === 0) {
      message += 'Нет записей в истории диалога';
    } else {
      const recentMessages = user.conversationLogs.reverse(); // Show in chronological order
      recentMessages.forEach((msg) => {
        const role = msg.role === 'USER' ? '👤 Клиент' : msg.role === 'ASSISTANT' ? '🤖 Агент' : '📝 Система';
        const content = msg.content.length > 200
          ? msg.content.substring(0, 200) + '...'
          : msg.content;
        const time = new Date(msg.createdAt).toLocaleString('ru-RU');
        message += `${role} (${time}):\n${content}\n\n`;
      });
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error in handleConversation:', error);
    await ctx.reply('❌ Ошибка при получении диалога');
  }
}

/**
 * Admin command: /lead [telegram_id] - Get lead information
 */
export async function handleLead(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId || !(await isAdmin(telegramId))) {
    await ctx.reply('❌ У вас нет доступа к этой команде.');
    return;
  }

  // Extract telegram_id from command text
  const text = ctx.message?.text || '';
  const match = text.match(/^\/lead(?:\s+(.+))?$/);
  const telegramIdParam = match?.[1]?.trim();
  
  if (!telegramIdParam) {
    await ctx.reply('Использование: /lead [telegram_id]');
    return;
  }

  try {
    await ctx.replyWithChatAction('typing');

    const targetTelegramId = BigInt(telegramIdParam);
    const user = await prisma.user.findUnique({
      where: { telegramId: targetTelegramId },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
        },
        conversationLogs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!user) {
      await ctx.reply(`❌ Пользователь с ID ${match} не найден.`);
      return;
    }

    const activeSub = user.subscriptions.find(s => s.status === 'ACTIVE');

    const leadMessage = `👤 **Карточка лида**

**ID:** ${user.telegramId}
**Имя:** ${user.firstName || 'Не указано'} ${user.lastName || ''}
**Username:** @${user.username || 'не указан'}

**Статус:** ${user.crmStatus}
**Lead Score:** ${user.leadScore}

**Подписка:**
${activeSub
  ? `• Статус: ${activeSub.status}\n• План: ${activeSub.planId}\n• До: ${activeSub.currentPeriodEnd.toLocaleDateString('ru-RU')}`
  : '• Нет активной подписки'}

**Stripe Customer:** ${user.stripeCustomerId || 'Не создан'}

**Создан:** ${user.createdAt.toLocaleDateString('ru-RU')}
**Обновлен:** ${user.updatedAt.toLocaleDateString('ru-RU')}

**Последние сообщения:** ${user.conversationLogs.length} записей`;

    await ctx.reply(leadMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error in handleLead:', error);
    await ctx.reply('❌ Ошибка при получении информации о лиде');
  }
}

/**
 * Admin command: /broadcast - Send message to users
 */
export async function handleBroadcast(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId || !(await isAdmin(telegramId))) {
    await ctx.reply('❌ У вас нет доступа к этой команде.');
    return;
  }

  await ctx.reply(
    '📢 **РАССЫЛКА СООБЩЕНИЙ**\n\n' +
    'Кому отправить рассылку?\n\n' +
    '1️⃣ Всем пользователям\n' +
    '2️⃣ Тем, кто не купил\n' +
    '3️⃣ Членам клуба (активные подписки)\n\n' +
    'Отправь номер (1, 2 или 3) и затем текст сообщения через новую строку.',
    { parse_mode: 'Markdown' }
  );

  // Set state to wait for broadcast details
  // This would require a conversation handler - simplified for now
}

/**
 * Process broadcast (internal function)
 */
export async function processBroadcast(
  segment: 'all' | 'non_customers' | 'customers',
  message: string
): Promise<void> {
  let users;

  switch (segment) {
    case 'all':
      users = await prisma.user.findMany({
        select: { telegramId: true },
      });
      break;

    case 'non_customers':
      users = await prisma.user.findMany({
        where: {
          crmStatus: { not: 'CUSTOMER' },
        },
        select: { telegramId: true },
      });
      break;

    case 'customers':
      users = await prisma.user.findMany({
        where: {
          crmStatus: 'CUSTOMER',
          subscriptions: {
            some: {
              status: 'ACTIVE',
              currentPeriodEnd: { gt: new Date() },
            },
          },
        },
        select: { telegramId: true },
      });
      break;
  }

  if (!users || users.length === 0) {
    return;
  }

  // Add jobs to queue (rate limited to 25 msg/sec)
  for (const user of users) {
    await broadcastQueue.add('send-message', {
      telegramId: Number(user.telegramId),
      message,
    });
  }
}

/**
 * Admin command: /add_access [telegram_id] - Manually add user to club
 * Note: bot instance should be passed from bot/index.ts
 */
export async function handleAddAccess(ctx: Context, bot: Bot): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId || !(await isAdmin(telegramId))) {
    await ctx.reply('❌ У вас нет доступа к этой команде.');
    return;
  }

  // Extract telegram_id from command text
  const text = ctx.message?.text || '';
  const match = text.match(/^\/add_access(?:\s+(.+))?$/);
  const targetTelegramIdParam = match?.[1]?.trim();
  
  if (!targetTelegramIdParam) {
    await ctx.reply('Использование: /add_access [telegram_id]');
    return;
  }

  try {
    await ctx.replyWithChatAction('typing');

    const targetTelegramId = parseInt(targetTelegramIdParam);
    
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(targetTelegramId) },
    });

    if (!user) {
      await ctx.reply(`❌ Пользователь с ID ${targetTelegramIdParam} не найден в базе.`);
      return;
    }

    // Create or activate subscription manually
    const existingSub = await prisma.subscription.findFirst({
      where: { userId: user.id },
    });

    if (existingSub) {
      await prisma.subscription.update({
        where: { id: existingSub.id },
        data: {
          status: 'ACTIVE',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });
    } else {
      await prisma.subscription.create({
        data: {
          userId: user.id,
          stripeSubscriptionId: `manual_${Date.now()}`,
          status: 'ACTIVE',
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          planId: 'premium_hub',
          autoRenew: false,
        },
      });
    }

    // Update user status
    await prisma.user.update({
      where: { id: user.id },
      data: {
        crmStatus: 'CUSTOMER',
        updatedAt: new Date(),
      },
    });

    // Send invite link
    const inviteLink = await inviteUserToClub(bot, targetTelegramId);
    
    await bot.api.sendMessage(
      targetTelegramId,
      `✅ Вам предоставлен доступ к AI Business HUB!\n\n` +
      `Используйте эту ссылку для входа в закрытый канал:\n${inviteLink}\n\n` +
      `Ссылка одноразовая и действительна 24 часа.`
    );

    await ctx.reply(
      `✅ Доступ предоставлен пользователю ${targetTelegramIdParam}\n\n` +
      `Пригласительная ссылка отправлена.`
    );

  } catch (error) {
    console.error('Error in handleAddAccess:', error);
    await ctx.reply(`❌ Ошибка: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Admin command: /remove_access [telegram_id] - Manually remove user from club
 */
export async function handleRemoveAccess(ctx: Context, bot: Bot): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId || !(await isAdmin(telegramId))) {
    await ctx.reply('❌ У вас нет доступа к этой команде.');
    return;
  }

  // Extract telegram_id from command text
  const text = ctx.message?.text || '';
  const match = text.match(/^\/remove_access(?:\s+(.+))?$/);
  const targetTelegramIdParam = match?.[1]?.trim();
  
  if (!targetTelegramIdParam) {
    await ctx.reply('Использование: /remove_access [telegram_id]');
    return;
  }

  try {
    await ctx.replyWithChatAction('typing');

    const targetTelegramId = parseInt(targetTelegramIdParam);
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(targetTelegramId) },
      include: { subscriptions: true },
    });

    if (!user) {
      await ctx.reply(`❌ Пользователь с ID ${targetTelegramIdParam} не найден.`);
      return;
    }

    // Cancel all subscriptions
    await prisma.subscription.updateMany({
      where: { userId: user.id },
      data: { status: 'CANCELED' },
    });

    // Update user status
    await prisma.user.update({
      where: { id: user.id },
      data: {
        crmStatus: 'CHURNED',
        updatedAt: new Date(),
      },
    });

    // Kick from channel
    await kickUserFromClub(bot, targetTelegramId);

    await bot.api.sendMessage(
      targetTelegramId,
      `⚠️ Ваш доступ к AI Business HUB был приостановлен администратором.\n\n` +
      `Если у вас есть вопросы, обратитесь в поддержку.`
    );

    await ctx.reply(
      `✅ Доступ удален для пользователя ${targetTelegramIdParam}\n\n` +
      `Пользователь удален из канала.`
    );

  } catch (error) {
    console.error('Error in handleRemoveAccess:', error);
    await ctx.reply(`❌ Ошибка: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Admin command: /get_channel_id - Get channel ID for configuration
 */
export async function handleGetChannelId(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId || !(await isAdmin(telegramId))) {
    await ctx.reply('❌ У вас нет доступа к этой команде.');
    return;
  }

  if (!config.telegram.clubChannelId) {
    await ctx.reply(
      `📋 **Как получить ID канала:**\n\n` +
      `1. Добавьте бота @userinfobot в канал\n` +
      `2. Или перешлите любое сообщение из канала боту @getidsbot\n` +
      `3. ID канала начинается с "-100" (например: -1001234567890)\n\n` +
      `После получения ID добавьте в .env:\n` +
      `CLUB_CHANNEL_ID=-1001234567890`,
      { parse_mode: 'Markdown' }
    );
  } else {
    await ctx.reply(
      `✅ ID канала настроен: \`${config.telegram.clubChannelId}\`\n\n` +
      `Если нужно изменить, обновите CLUB_CHANNEL_ID в .env`,
      { parse_mode: 'Markdown' }
    );
  }
}
