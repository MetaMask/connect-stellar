import type { SessionData } from '@metamask/multichain-api-client';
import { NETWORK_PASSPHRASE, type Scope } from './types.js';

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
  if (!address) {
    throw new Error(`Invalid CAIP account ID: ${caipAccountId}`);
  }
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
 * Checks if the given event is a session changed event.
 *
 * @param event - The event to check.
 * @returns True if the event is a session changed event, false otherwise.
 */
export function isSessionChangedEvent(
  event: unknown,
): event is { method: 'wallet_sessionChanged'; params: SessionData } {
  const { method, params } = (event ?? {}) as { method?: string; params?: unknown };
  return method === 'wallet_sessionChanged' && typeof params === 'object' && params !== null;
}
