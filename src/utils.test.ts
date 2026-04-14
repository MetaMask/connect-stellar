import { describe, expect, it } from 'vitest';

import { getAddressFromCaipAccountId, isSessionChangedEvent, networkPassphraseToScope } from './utils.js';
import { Scope } from './types.js';

describe('getAddressFromCaipAccountId', () => {
  it('extracts the address from a valid CAIP-10 account ID', () => {
    const address = getAddressFromCaipAccountId('stellar:pubnet:GABC');
    expect(address).toBe('GABC');
  });

  it('throws on an invalid CAIP account ID with no address segment', () => {
    expect(() => getAddressFromCaipAccountId('stellar:pubnet')).toThrow(
      'Invalid CAIP account ID',
    );
  });
});

describe('networkPassphraseToScope', () => {
  it('returns PUBNET scope for the mainnet passphrase', () => {
    const scope = networkPassphraseToScope(
      'Public Global Stellar Network ; September 2015',
    );
    expect(scope).toBe(Scope.PUBNET);
  });

  it('throws for an unknown passphrase', () => {
    expect(() => networkPassphraseToScope('Test SDF Network ; September 2015')).toThrow(
      'Unknown network passphrase',
    );
  });
});

describe('isSessionChangedEvent', () => {
  it('returns true for a wallet_sessionChanged event', () => {
    expect(isSessionChangedEvent({ method: 'wallet_sessionChanged' })).toBe(true);
  });

  it('returns false for other events', () => {
    expect(isSessionChangedEvent({ method: 'wallet_other' })).toBe(false);
  });

  it('returns false for non-object values', () => {
    expect(isSessionChangedEvent(null)).toBe(false);
    expect(isSessionChangedEvent(undefined)).toBe(false);
    expect(isSessionChangedEvent('wallet_sessionChanged')).toBe(false);
  });
});
