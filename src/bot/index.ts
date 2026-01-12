import { Bot } from 'grammy';
import { config } from '../config';
import { handleStart, handleMessage } from './handlers';
import { 
  handleAdmin, 
  handleStats, 
  handleLead, 
  handleBroadcast,
  handleLeads,
  handleHot,
  handleConversation,
} from './admin';

export function createBot(): Bot {
  const bot = new Bot(config.telegram.token);

  // Register commands
  bot.command('start', handleStart);
  
  // Admin commands
  bot.command('admin', handleAdmin);
  bot.command('stats', handleStats);
  bot.command('hot', handleHot);
  bot.command('broadcast', handleBroadcast);
  
  // Commands with parameters (using regex)
  bot.hears(/^\/leads(?:\s+(.+))?$/, handleLeads);
  bot.hears(/^\/conversation\s+(.+)$/, handleConversation);
  bot.hears(/^\/lead(?:\s+(.+))?$/, handleLead);

  // Register message handler
  bot.on('message:text', handleMessage);

  // Error handling
  bot.catch((err) => {
    console.error('Bot error:', err.error);
  });

  return bot;
}

