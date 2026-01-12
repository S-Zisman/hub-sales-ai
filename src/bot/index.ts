import { Bot } from 'grammy';
import { config } from '../config';
import { handleStart, handleMessage } from './handlers';
import { handleChannelMessage, handleChannelPost } from './channel';
import { 
  handleAdmin, 
  handleStats, 
  handleLead, 
  handleBroadcast,
  handleLeads,
  handleHot,
  handleConversation,
  handleAddAccess,
  handleRemoveAccess,
  handleGetChannelId,
} from './admin';

export function createBot(): Bot {
  const bot = new Bot(config.telegram.token);

  // Log all updates for debugging
  bot.use(async (ctx, next) => {
    // Log channel_post updates
    if (ctx.update.channel_post) {
      const chatId = ctx.chat && 'id' in ctx.chat ? ctx.chat.id : 'unknown';
      console.log('[UPDATE] Channel post received:', {
        updateType: 'channel_post',
        chatId: chatId,
        text: ctx.channelPost?.text?.substring(0, 50),
        entities: ctx.channelPost?.entities?.map(e => e.type),
      });
    }
    // Log message updates from groups/channels (comments)
    if (ctx.update.message && ctx.message?.chat) {
      const chat = ctx.message.chat;
      if (chat.type === 'supergroup' || (chat.type === 'group' && 'id' in chat && chat.id < 0)) {
        console.log('[UPDATE] Message in group/channel:', {
          updateType: 'message',
          chatId: 'id' in chat ? chat.id : 'unknown',
          chatType: chat.type,
          text: ctx.message.text?.substring(0, 50),
          fromId: ctx.from?.id,
        });
      }
    }
    return next();
  });

  // Register commands
  bot.command('start', handleStart);
  
  // Admin commands
  bot.command('admin', handleAdmin);
  bot.command('stats', handleStats);
  bot.command('hot', handleHot);
  bot.command('broadcast', handleBroadcast);
  bot.command('get_channel_id', handleGetChannelId);
  
  // Commands with parameters (using regex)
  bot.hears(/^\/leads(?:\s+(.+))?$/, handleLeads);
  bot.hears(/^\/conversation\s+(.+)$/, handleConversation);
  bot.hears(/^\/lead(?:\s+(.+))?$/, handleLead);
  
  // Commands that need bot instance
  bot.hears(/^\/add_access(?:\s+(.+))?$/, (ctx) => handleAddAccess(ctx, bot));
  bot.hears(/^\/remove_access(?:\s+(.+))?$/, (ctx) => handleRemoveAccess(ctx, bot));

  // Handle channel posts (messages in channels)
  bot.on('channel_post:text', async (ctx) => {
    console.log('Channel post received:', ctx.channelPost?.text?.substring(0, 50));
    await handleChannelPost(ctx);
  });

  // Handle messages from groups/supergroups (when bot is mentioned)
  bot.on('message:text', async (ctx) => {
    const chat = ctx.chat;
    const message = ctx.message;
    
    if (!chat || !message) {
      await handleMessage(ctx);
      return;
    }
    
    // Check if message is from a group or supergroup (including channel comments)
    const chatType = chat.type;
    const chatId = 'id' in chat ? chat.id : undefined;
    const isClubChannel = chatId === config.telegram.clubChannelId;
    
    // Handle messages from groups/supergroups (including channel comments)
    if (chatType === 'supergroup' || chatType === 'group' || isClubChannel) {
      // Check if bot is mentioned
      const botUsername = config.telegram.username.toLowerCase();
      const text = message.text?.toLowerCase() || '';
      const entities = message.entities || [];
      
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
      
      // Check if it's a reply to bot's message
      const isReplyToBot = message.reply_to_message?.from?.is_bot && 
                          message.reply_to_message?.from?.username?.toLowerCase() === botUsername;
      
      if (isMentioned || isReplyToBot) {
        // Handle as channel message
        await handleChannelMessage(ctx);
        return;
      }
      
      // Ignore other messages in groups
      return;
    }
    
    // Handle private messages
    await handleMessage(ctx);
  });

  // Error handling
  bot.catch((err) => {
    console.error('Bot error:', err.error);
  });

  return bot;
}

