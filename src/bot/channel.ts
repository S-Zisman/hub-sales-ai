import { Context } from 'grammy';
import { config } from '../config';
import { prisma } from '../database/client';
import { generateSalesResponse } from '../services/claude';

/**
 * Handle channel posts (messages posted in channels)
 */
export async function handleChannelPost(ctx: Context): Promise<void> {
  const channelPost = ctx.channelPost;
  const chat = ctx.chat;
  
  const chatId = chat && 'id' in chat ? chat.id : undefined;
  console.log('[CHANNEL_POST] Received update:', {
    hasChannelPost: !!channelPost,
    hasText: !!channelPost?.text,
    chatId: chatId,
    expectedChannelId: config.telegram.clubChannelId,
    isClubChannel: chatId === config.telegram.clubChannelId,
    chatType: chat?.type,
    text: channelPost?.text?.substring(0, 100),
  });
  
  if (!channelPost || !channelPost.text || !chat) {
    console.log('[CHANNEL_POST] Missing data, ignoring');
    return;
  }
  
  console.log('[CHANNEL_POST] Processing from chat:', chatId, 'Text:', channelPost.text.substring(0, 50));
  
  const isClubChannel = chatId === config.telegram.clubChannelId;
  
  if (!isClubChannel) {
    console.log('Not club channel, ignoring');
    return;
  }
  
  // Check if bot is mentioned
  const botUsername = config.telegram.username.toLowerCase();
  const text = channelPost.text?.toLowerCase() || '';
  const entities = channelPost.entities || [];
  
  // Check for mention (@bot_username)
  let isMentioned = false;
  for (const entity of entities) {
    if (entity.type === 'mention') {
      const mentionText = text.substring(entity.offset, entity.offset + entity.length);
      if (mentionText === `@${botUsername}`) {
        isMentioned = true;
        break;
      }
    }
  }
  
  // Also check if text contains mention
  if (!isMentioned && text.includes(`@${botUsername}`)) {
    isMentioned = true;
  }
  
  if (!isMentioned) {
    console.log('Bot not mentioned, ignoring channel post');
    return;
  }
  
  // Extract question (remove mention if present)
  let question = channelPost.text;
  question = question.replace(new RegExp(`@${botUsername}\\s*`, 'gi'), '').trim();
  question = question.replace(new RegExp(`\\s*@${botUsername}`, 'gi'), '').trim();
  
  if (!question || question.length < 2) {
    await ctx.api.sendMessage(
      chatId!,
      '👋 Привет! Я AI-консультант AI Business HUB.\n\n' +
      'Задайте мне вопрос, и я помогу вам!',
      { reply_to_message_id: channelPost.message_id }
    );
    return;
  }
  
  // Show typing indicator
  if (chatId) {
    await ctx.api.sendChatAction(chatId, 'typing');
  }
  
  try {
    // For channel posts, we don't have user info, so we'll respond as general AI consultant
    const response = await generateSalesResponse(question, {
      stage: 'CLOSING',
      userData: undefined,
      conversationHistory: [],
    });
    
    // Reply in channel
    await ctx.api.sendMessage(
      chatId!,
      response,
      {
        reply_to_message_id: channelPost.message_id,
        parse_mode: 'Markdown',
      }
    );
    
    console.log('Channel post replied successfully');
    
  } catch (error) {
    console.error('Error handling channel post:', error);
    await ctx.api.sendMessage(
      chatId!,
      'Извините, произошла ошибка при обработке вашего вопроса. Попробуйте позже.',
      { reply_to_message_id: channelPost.message_id }
    );
  }
}

/**
 * Handle messages from channel/group
 * Bot responds when:
 * 1. Bot is mentioned (@bot_username)
 * 2. User replies to bot's message
 */
export async function handleChannelMessage(ctx: Context): Promise<void> {
  const chat = ctx.chat;
  const message = ctx.message;
  const from = ctx.from;
  
  if (!from || !message || !message.text || !chat) return;
  
  // Get chat ID
  const chatId = 'id' in chat ? chat.id : undefined;
  
  // Check if user has access (is a customer)
  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(from.id) },
    include: {
      subscriptions: {
        where: {
          status: 'ACTIVE',
          currentPeriodEnd: { gt: new Date() },
        },
      },
    },
  });
  
  // Check if it's club channel and user has access
  const isClubChannel = chatId === config.telegram.clubChannelId;
  const hasAccess = (user?.subscriptions && user.subscriptions.length > 0) || user?.isAdmin;
  
  if (isClubChannel && !hasAccess) {
    await ctx.reply(
      '❌ У вас нет доступа к этому каналу.\n\n' +
      'Для получения доступа оформите подписку через бота в личных сообщениях.\n' +
      'Напишите /start боту @HUBSalesAI_bot',
      { reply_to_message_id: message.message_id }
    );
    return;
  }
  
  // Extract question (remove mention if present)
  let question = message.text;
  const botUsername = config.telegram.username;
  // Remove mention from text
  question = question.replace(new RegExp(`@${botUsername}\\s*`, 'gi'), '').trim();
  // Also remove if mention is at the end
  question = question.replace(new RegExp(`\\s*@${botUsername}`, 'gi'), '').trim();
  
  if (!question || question.length < 2) {
    await ctx.reply(
      '👋 Привет! Я AI-консультант AI Business HUB.\n\n' +
      'Задайте мне вопрос, и я помогу вам!\n\n' +
      'Например:\n' +
      '• "Как увеличить продажи?"\n' +
      '• "Какие инструменты для автоматизации?"\n' +
      '• "Как работать с командой эффективнее?"',
      { reply_to_message_id: message.message_id }
    );
    return;
  }
  
  // Show typing indicator
  if (chatId) {
    await ctx.api.sendChatAction(chatId, 'typing');
  }
  
  try {
    // Get conversation history for context
    const conversationLogs = await prisma.conversationLog.findMany({
      where: { userId: user?.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    
    // Prepare conversation history
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = conversationLogs
      .reverse()
      .map(log => ({
        role: log.role === 'USER' ? 'user' : 'assistant' as 'user' | 'assistant',
        content: log.content,
      }));
    
    // Generate AI response
    const response = await generateSalesResponse(question, {
      stage: 'CLOSING', // In channel, assume user is already a customer
      userData: user ? {
        niche: undefined, // Could be stored in user metadata
        revenue: undefined,
        teamSize: undefined,
        painPoints: undefined,
      } : undefined,
      conversationHistory: history,
    });
    
    // Save to conversation log if user exists
    if (user) {
      await prisma.conversationLog.create({
        data: {
          userId: user.id,
          role: 'USER',
          content: question,
        },
      });
      
      await prisma.conversationLog.create({
        data: {
          userId: user.id,
          role: 'ASSISTANT',
          content: response,
        },
      });
    }
    
    // Reply in channel
    await ctx.reply(response, {
      reply_to_message_id: message.message_id,
      parse_mode: 'Markdown',
    });
    
  } catch (error) {
    console.error('Error handling channel message:', error);
    await ctx.reply(
      'Извините, произошла ошибка при обработке вашего вопроса. Попробуйте позже.',
      { reply_to_message_id: message.message_id }
    );
  }
}

