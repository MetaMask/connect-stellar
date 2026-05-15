export { MetaMaskStellarAdapter } from './adapter.js';
export { MetaMaskModule, METAMASK_ID } from './module.js';
export { metamaskIcon } from './icon.js';
export { AdapterErrorCode, Scope, NETWORK_PASSPHRASE, NETWORK_NAME } from './types.js';
export type { StellarAdapterError, StellarRpc } from './types.js';
export {
  getAddressFromCaipAccountId,
  networkPassphraseToScope,
  isSessionChangedEvent,
} from './utils.js';
