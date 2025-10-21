// =============================================================================
// LOGGING UTILITY
// =============================================================================
// Simple logging utility to control console output verbosity
// =============================================================================

/**
 * Log levels configuration
 * Set LOG_LEVEL environment variable to control what gets logged:
 * - 'silent' : No logs at all
 * - 'error'  : Only errors
 * - 'warn'   : Errors and warnings
 * - 'info'   : Errors, warnings, and info (default)
 * - 'debug'  : Everything including debug messages
 * 
 * Interest logs (🚀, ✅, 💰, 📊, 🏁, 💵, ❌) are always shown unless LOG_LEVEL='silent'
 */

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const SUPPRESS_GENERAL_LOGS = process.env.SUPPRESS_GENERAL_LOGS === '1';

const levels = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
};

const currentLevel = levels[LOG_LEVEL] || levels.info;

/**
 * Check if a message is an interest-related log
 * Interest logs contain specific emojis
 */
const isInterestLog = (message) => {
  const interestEmojis = ['🚀', '✅', '💰', '📊', '🏁', '💵', '❌', '⏰', '⚠️'];
  return interestEmojis.some(emoji => String(message).includes(emoji));
};

/**
 * Logger object with methods for different log levels
 */
const logger = {
  error: (...args) => {
    if (currentLevel >= levels.error) {
      console.error(...args);
    }
  },

  warn: (...args) => {
    // Always show interest-related warnings
    if (isInterestLog(args[0]) || currentLevel >= levels.warn) {
      console.warn(...args);
    }
  },

  info: (...args) => {
    // Always show interest-related info logs, suppress others if configured
    if (isInterestLog(args[0])) {
      console.log(...args);
    } else if (!SUPPRESS_GENERAL_LOGS && currentLevel >= levels.info) {
      console.log(...args);
    }
  },

  debug: (...args) => {
    if (currentLevel >= levels.debug) {
      console.log(...args);
    }
  },

  // Special method for interest logs - always shown unless silent
  interest: (...args) => {
    if (currentLevel > levels.silent) {
      console.log(...args);
    }
  }
};

/**
 * Suppress morgan logs if SUPPRESS_GENERAL_LOGS is enabled
 * Returns appropriate morgan format based on settings
 */
const getMorganFormat = () => {
  if (SUPPRESS_GENERAL_LOGS) {
    return 'combined'; // Less verbose
  }
  return 'dev'; // More verbose with colors
};

/**
 * Override console.log for non-interest logs when suppression is enabled
 * This helps catch any direct console.log calls
 */
const setupConsoleOverride = () => {
  if (SUPPRESS_GENERAL_LOGS) {
    const originalLog = console.log;
    console.log = (...args) => {
      // Always allow interest logs
      if (isInterestLog(args[0])) {
        originalLog(...args);
      }
      // Suppress other logs
    };
  }
};

module.exports = {
  logger,
  getMorganFormat,
  setupConsoleOverride,
  isInterestLog
};
