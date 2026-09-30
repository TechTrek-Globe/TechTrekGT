/**
 * Backwards compatibility bridge for debugLogger.js.
 * All logging and subscriber logic is centralized in logger.js.
 */

export {
  DEBUG_STORAGE_KEY,
  CATEGORIES_STORAGE_KEY,
  DEBUG_CATEGORIES,
  CATEGORY_METADATA,
  getDebugEnabled,
  setDebugEnabled,
  getCategoryStates,
  isCategoryEnabled,
  setCategoryEnabled,
  setAllCategories,
  resetCategoryDefaults,
  subscribeToDebugLogs,
  sanitizePayload,
  logDebug,
  logSync,
  logTransaction,
  logMatrix,
  logLedger,
  logState,
  logImport,
  logInfo,
  logWarn,
  logError,
  logStep
} from './logger.js';
