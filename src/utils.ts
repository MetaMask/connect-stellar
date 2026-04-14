import { NETWORK_PASSPHRASE, Scope } from './types.js';

/**
 * Extracts the Stellar address from a CAIP-10 account ID.
 *
 * @param caipAccountId - A CAIP-10 string of the form `stellar:<network>:<address>`.
 * @returns The raw Stellar address (third colon-separated segment).
 * @throws When the string does not contain a third segment.
 *
 * @example
 * getAddressFromCaipAccountId('stellar:pubnet:GABC...')
 * // → 'GABC...'
 */
export function getAddressFromCaipAccountId(caipAccountId: string): string {
  const [, , address] = caipAccountId.split(':');
  if (!address) throw new Error(`Invalid CAIP account ID: ${caipAccountId}`);
  return address;
}

/**
 * Converts a SEP-0043 network passphrase to the corresponding CAIP-2 `Scope`.
 *
 * @param networkPassphrase - The Stellar network passphrase (e.g. `'Public Global Stellar Network ; September 2015'`).
 * @returns The matching `Scope` enum value.
 * @throws When the passphrase does not match any entry in `NETWORK_PASSPHRASE`.
 */
export function networkPassphraseToScope(networkPassphrase: string): Scope {
  const entry = (Object.entries(NETWORK_PASSPHRASE) as [Scope, string][]).find(
    ([, passphrase]) => passphrase === networkPassphrase,
  );
  if (!entry) {
    throw new Error(`Unknown network passphrase: ${networkPassphrase}`);
  }
  return entry[0];
}

/**
 * Returns `true` when the raw MetaMask notification is a `sessionChanged` event.
 * Fired by the multichain API whenever the active session scope or accounts change.
 *
 * @param event - Raw notification payload from `MultichainApiClient.onNotification`.
 * @returns `true` if the payload's `method` field is `wallet_sessionChanged`.
 */
export function isSessionChangedEvent(event: unknown): boolean {
  return (event as { method?: string })?.method === 'wallet_sessionChanged';
}
