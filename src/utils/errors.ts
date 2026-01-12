/**
 * Custom error classes for better error handling
 */

export class BotError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'BotError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class StripeError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'StripeError';
  }
}

export class ClaudeError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'ClaudeError';
  }
}


