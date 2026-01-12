import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { config } from '../config';

// Lazy initialization to ensure config is loaded
let anthropicInstance: Anthropic | null = null;
let openaiInstance: OpenAI | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicInstance) {
    if (!config.claude.apiKey) {
      throw new Error('Claude API key is not configured');
    }
    anthropicInstance = new Anthropic({
      apiKey: config.claude.apiKey,
      baseURL: config.claude.apiUrl,
    });
    // Verify messages API is available
    if (!anthropicInstance.messages) {
      throw new Error('Anthropic messages API is not available. SDK version may be incorrect.');
    }
  }
  return anthropicInstance;
}

function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    if (!config.openai.apiKey) {
      throw new Error('OpenAI API key is not configured');
    }
    openaiInstance = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }
  return openaiInstance;
}

async function generateWithOpenAI(
  userMessage: string,
  systemPrompt: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  const openai = getOpenAI();
  
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];
  
  // Add conversation history
  for (const msg of conversationHistory) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    });
  }
  
  // Add current message
  messages.push({ role: 'user', content: userMessage });
  
  const response = await openai.chat.completions.create({
    model: config.openai.model,
    messages: messages,
    max_tokens: 1024,
    temperature: 0.7,
  });
  
  return response.choices[0]?.message?.content || 'Извините, не удалось получить ответ.';
}

export interface ClaudeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ClaudeContext {
  stage: string;
  userData?: {
    niche?: string;
    revenue?: string;
    teamSize?: string;
    painPoints?: string[];
  };
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * Generate AI sales response using Claude 3.5 Sonnet
 */
export async function generateSalesResponse(
  userMessage: string,
  context: ClaudeContext
): Promise<string> {
  const systemPrompt = buildSystemPrompt(context);

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    {
      role: 'user',
      content: userMessage,
    },
  ];

  // Add conversation history if available
  if (context.conversationHistory && context.conversationHistory.length > 0) {
    // Include last 10 messages for context (to avoid token limits)
    const recentHistory = context.conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      messages.unshift({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  try {
    // Try OpenAI if configured as fallback
    if (config.openai.useAsFallback && config.openai.apiKey) {
      console.log('Using OpenAI as fallback...');
      return await generateWithOpenAI(userMessage, systemPrompt, context.conversationHistory || []);
    }
    
    // Try Claude API
    const anthropic = getAnthropic();
    
    // Try the configured model first
    let modelToUse = config.claude.model;
    let response;
    
    try {
      response = await anthropic.messages.create({
        model: modelToUse,
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages,
        temperature: 0.7,
      });
    } catch (firstError: any) {
      // If 404, try alternative model names
      if (firstError?.statusCode === 404 || (firstError?.error?.type === 'not_found_error')) {
        console.log(`Model ${modelToUse} not found, trying alternatives...`);
        
        // Try claude-3-5-sonnet-20241022 (latest)
        const alternatives = [
          'claude-3-5-sonnet-20241022',
          'claude-3-5-sonnet-20240620',
          'claude-3-sonnet-20240229',
        ];
        
        let lastError = firstError;
        for (const altModel of alternatives) {
          if (altModel === modelToUse) continue;
          try {
            console.log(`Trying model: ${altModel}`);
            response = await anthropic.messages.create({
              model: altModel,
              max_tokens: 1024,
              system: systemPrompt,
              messages: messages,
              temperature: 0.7,
            });
            console.log(`✅ Success with model: ${altModel}`);
            break;
          } catch (altError: any) {
            lastError = altError;
            continue;
          }
        }
        
        if (!response) {
          // If all Claude models failed and OpenAI is available, use it as fallback
          if (config.openai.apiKey) {
            console.log('All Claude models failed, falling back to OpenAI...');
            return await generateWithOpenAI(userMessage, systemPrompt, context.conversationHistory || []);
          }
          throw lastError;
        }
      } else {
        // If non-404 error and OpenAI available, try fallback
        if (config.openai.apiKey) {
          console.log('Claude API error, falling back to OpenAI...');
          return await generateWithOpenAI(userMessage, systemPrompt, context.conversationHistory || []);
        }
        throw firstError;
      }
    }

    const content = response.content[0];
    if (content.type === 'text') {
      return content.text;
    }

    throw new Error('Unexpected response format from Claude API');
  } catch (error: any) {
    console.error('Claude API Error:', error);
    
    // If OpenAI is available, use it as final fallback
    if (config.openai.apiKey) {
      console.log('Using OpenAI as final fallback...');
      try {
        return await generateWithOpenAI(userMessage, systemPrompt, context.conversationHistory || []);
      } catch (openaiError) {
        console.error('OpenAI fallback also failed:', openaiError);
        throw new Error('Both Claude and OpenAI APIs failed. Please check your API keys.');
      }
    }
    
    // Check if it's an authentication error
    if (error?.statusCode === 401 || error?.statusCode === 403) {
      throw new Error('Claude API authentication failed. Please check your API key.');
    }
    
    // If it's a 404 model not found error, provide helpful message
    if (error?.statusCode === 404 || (error?.error?.type === 'not_found_error')) {
      const errorMsg = error?.error?.message || error?.message || '';
      console.error(`Model not found: ${config.claude.model}. Error: ${errorMsg}`);
      throw new Error(`Claude model "${config.claude.model}" not found. Please check the model name and API key permissions. Original error: ${errorMsg}`);
    }
    
    throw error;
  }
}

/**
 * Build system prompt based on current sales stage
 */
function buildSystemPrompt(context: ClaudeContext): string {
  const { stage, userData } = context;

  return `Ты — AI HUB Sales, бизнес-консультант и продавец экосистемы Soroka FES.

<system_role>
Твоя цель: не "помочь", а довести клиента до осознанного решения о покупке.
Твой тон: уверенный, профессиональный, лаконичный. Ты не используешь клише ("Рад помочь", "Отличный выбор").
</system_role>

<methodology>
Используй метод SPIN. Сначала задай Ситуационные вопросы. Затем Проблемные.
Никогда не предлагай цену, пока не выявлена боль.
Если клиент говорит о хаосе, используй технику "Challenger": покажи, сколько денег он теряет из-за хаоса.
</methodology>

<pricing_rules>
Основной продукт: Premium Club. Цена £17/мес (вместо £57) только с кодом PREMIUM17.
Даунсейл: Test-Drive. Цена £9/мес (вместо £13) только с кодом SOROKA.
</pricing_rules>

<current_stage>
${getStageInstructions(stage, userData)}
</current_stage>

<protocol>
Перед ответом проанализируй:
1. На каком этапе воронки клиент?
2. Какое возражение скрыто в его словах?
3. Сформулируй ответ, который продвигает к следующему этапу.
</protocol>

${userData ? `<user_context>
Ниша: ${userData.niche || 'не указана'}
Оборот: ${userData.revenue || 'не указан'}
Команда: ${userData.teamSize || 'не указана'}
Боли: ${userData.painPoints?.join(', ') || 'не выявлены'}
</user_context>` : ''}`;
}

function getStageInstructions(stage: string, userData?: ClaudeContext['userData']): string {
  switch (stage) {
    case 'QUALIFICATION':
      return `Ты на этапе КВАЛИФИКАЦИИ. Задавай вопросы о бизнесе:
- В какой нише работает клиент?
- Какой оборот компании?
- Сколько человек в команде?
- Какие основные проблемы/боли?

НЕ предлагай продукт на этом этапе. Твоя задача — понять "Точку А" клиента.`;

    case 'PROBLEM_AMPLIFICATION':
      return `Ты на этапе УСИЛЕНИЯ БОЛИ. Клиент уже упомянул проблемы (${userData?.painPoints?.join(', ') || 'хаос'}).
Экологично фрустрируй клиента, показывая последствия бездействия. Используй технику Challenger.
НЕ предлагай решение сразу — сначала усиль боль.`;

    case 'SOLUTION_PRESENTATION':
      const isQualified = (userData?.revenue && parseInt(userData.revenue) > 10000) || 
                         (userData?.teamSize && parseInt(userData.teamSize) > 3);
      
      if (isQualified) {
        return `Ты на этапе ПРЕЗЕНТАЦИИ РЕШЕНИЯ. Клиент квалифицирован как готовый к внедрению.
Предложи Premium Club за £17/мес с промокодом PREMIUM17.`;
      } else {
        return `Ты на этапе ПРЕЗЕНТАЦИИ РЕШЕНИЯ. Клиент еще сомневается.
Предложи Test-Drive за £9/мес с промокодом SOROKA как первый шаг.`;
      }

    case 'CLOSING':
      return `Ты на этапе ЗАКРЫТИЯ. Клиент готов к покупке.
Подтверди выбор и направь на оплату. Будь уверенным и поддерживающим.`;

    default:
      return `Ты начинаешь диалог. Поприветствуй клиента и начни квалификацию.`;
  }
}


