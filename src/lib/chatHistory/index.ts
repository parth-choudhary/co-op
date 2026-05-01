// Public surface for the chat-history layer.
// Callers should only need this file; internals stay private to the directory.

export {
  fetchChatHistoryShared,
  fetchCardHistoryShared,
  formatHistoryForAgent,
  type SharedFetchResult,
} from './build';

export type { PriorMessage, FetchedHistory, RawTurn, SenderRef } from './types';
export { HISTORY_CONFIG } from './types';
export type { SelfIdentity } from './format';
