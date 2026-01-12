import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

const anthropic = new Anthropic({
  apiKey: config.claude.apiKey,
});

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
  conversationHistory?: ClaudeMessage[];
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
      if (msg.role !== 'system') {
        messages.unshift({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        });
      }
    }
  }

  try {
    // @ts-ignore - Anthropic SDK types may be outdated
    const response = await anthropic.messages.create({
      model: config.claude.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages,
      temperature: 0.7,
    });

    const content = response.content[0];
    if (content.type === 'text') {
      return content.text;
    }

    throw new Error('Unexpected response format from Claude API');
  } catch (error) {
    console.error('Claude API Error:', error);
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


