import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NETWORK_NAME, NETWORK_PASSPHRASE, STELLAR_SIGNING_METHODS, Scope } from './types.js';

// --- Mocks ---

const TEST_ADDRESS = 'GABC2DEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV';
const _TEST_CAIP_ACCOUNT = `stellar:pubnet:${TEST_ADDRESS}` as const;

const mockRemoveListener = vi.fn();
const mockClient = {
  getSession: vi.fn(),
  createSession: vi.fn(),
  revokeSession: vi.fn(),
  invokeMethod: vi.fn(),
  onNotification: vi.fn().mockReturnValue(mockRemoveListener),
  extendsRpcApi: vi.fn(),
};
// extendsRpcApi returns the client itself (fluent API)
mockClient.extendsRpcApi.mockReturnValue(mockClient);

vi.mock('@metamask/multichain-api-client', () => ({
  getDefaultTransport: vi.fn(() => ({})),
  getMultichainClient: vi.fn(() => mockClient),
  isMetamaskInstalled: vi.fn().mockResolvedValue(true),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

function pubnetSession(address: string = TEST_ADDRESS) {
  return {
    sessionScopes: {
      [Scope.PUBNET]: {
        accounts: [`stellar:pubnet:${address}`],
        methods: [...STELLAR_SIGNING_METHODS],
        notifications: [],
      },
    },
  };
}

// Dynamic import so mocks are in place before the constructor runs
async function createAdapter() {
  // Clear module cache to get a fresh adapter instance each time
  vi.resetModules();

  // Re-apply mocks after resetModules
  vi.doMock('@metamask/multichain-api-client', () => ({
    getDefaultTransport: vi.fn(() => ({})),
    getMultichainClient: vi.fn(() => mockClient),
    isMetamaskInstalled: vi.fn().mockResolvedValue(true),
  }));

  const { MetaMaskStellarAdapter } = await import('./adapter.js');
  const adapter = new MetaMaskStellarAdapter();
  // Let the constructor's restore promise settle
  await vi.waitFor(() => {
    expect(mockClient.getSession).toHaveBeenCalled();
  });
  return adapter;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
  // Default: no existing session
  mockClient.getSession.mockResolvedValue(null);
  mockClient.createSession.mockResolvedValue(pubnetSession());
  mockClient.revokeSession.mockResolvedValue(undefined);
  mockClient.onNotification.mockReturnValue(mockRemoveListener);
  mockClient.extendsRpcApi.mockReturnValue(mockClient);
});

describe('MetaMaskStellarAdapter', () => {
  describe('constructor', () => {
    it('starts the session listener on construction', async () => {
      await createAdapter();
      expect(mockClient.onNotification).toHaveBeenCalled();
    });

    it('restores session from existing MetaMask session', async () => {
      mockClient.getSession.mockResolvedValue(pubnetSession());
      localStorageMock.setItem('metamaskStellarAdapterScope', Scope.PUBNET);

      const adapter = await createAdapter();
      const { address } = await adapter.getAddress();
      expect(address).toBe(TEST_ADDRESS);
    });
  });

  describe('requestAccess', () => {
    it('creates a session and returns the address', async () => {
      const adapter = await createAdapter();
      const result = await adapter.requestAccess();

      expect(result.address).toBe(TEST_ADDRESS);
      expect(result.error).toBeUndefined();
      expect(mockClient.createSession).toHaveBeenCalledWith({
        optionalScopes: {
          [Scope.PUBNET]: {
            accounts: [],
            methods: [...STELLAR_SIGNING_METHODS],
            notifications: [],
          },
        },
      });
    });

    it('skips createSession if already connected from restore', async () => {
      mockClient.getSession.mockResolvedValue(pubnetSession());
      localStorageMock.setItem('metamaskStellarAdapterScope', Scope.PUBNET);

      const adapter = await createAdapter();
      mockClient.createSession.mockClear();

      const result = await adapter.requestAccess();
      expect(result.address).toBe(TEST_ADDRESS);
      expect(mockClient.createSession).not.toHaveBeenCalled();
    });

    it('returns error when createSession yields no address', async () => {
      mockClient.createSession.mockResolvedValue({ sessionScopes: {} });
      const adapter = await createAdapter();
      const result = await adapter.requestAccess();

      expect(result.address).toBe('');
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe(-1);
    });

    it('emits connect event on success', async () => {
      const adapter = await createAdapter();
      const connectSpy = vi.fn();
      adapter.on('connect', connectSpy);

      await adapter.requestAccess();
      expect(connectSpy).toHaveBeenCalledWith(TEST_ADDRESS);
    });

    it('re-registers session listener after disconnect + reconnect', async () => {
      const adapter = await createAdapter();
      await adapter.requestAccess();
      await adapter.disconnect();

      // Listener was removed during disconnect
      expect(mockRemoveListener).toHaveBeenCalled();

      mockClient.onNotification.mockClear();
      await adapter.requestAccess();

      // Should have re-registered
      expect(mockClient.onNotification).toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('clears state and revokes session', async () => {
      const adapter = await createAdapter();
      await adapter.requestAccess();

      const result = await adapter.disconnect();

      expect(result.error).toBeUndefined();
      expect(mockClient.revokeSession).toHaveBeenCalledWith({ scopes: [Scope.PUBNET] });
      expect(mockRemoveListener).toHaveBeenCalled();

      const { isConnected } = await adapter.isConnected();
      expect(isConnected).toBe(false);
    });

    it('emits disconnect event', async () => {
      const adapter = await createAdapter();
      await adapter.requestAccess();

      const disconnectSpy = vi.fn();
      adapter.on('disconnect', disconnectSpy);

      await adapter.disconnect();
      expect(disconnectSpy).toHaveBeenCalled();
    });

    it('returns error if revokeSession fails', async () => {
      mockClient.revokeSession.mockRejectedValue(new Error('revoke failed'));
      const adapter = await createAdapter();
      await adapter.requestAccess();

      const result = await adapter.disconnect();
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('revoke failed');
    });
  });

  describe('getAddress', () => {
    it('returns error when not connected', async () => {
      const adapter = await createAdapter();
      const result = await adapter.getAddress();

      expect(result.address).toBe('');
      expect(result.error?.code).toBe(-3);
    });

    it('returns address when connected', async () => {
      const adapter = await createAdapter();
      await adapter.requestAccess();

      const result = await adapter.getAddress();
      expect(result.address).toBe(TEST_ADDRESS);
    });
  });

  describe('getNetwork', () => {
    it('returns error when not connected', async () => {
      const adapter = await createAdapter();
      const result = await adapter.getNetwork();

      expect(result.network).toBe('');
      expect(result.error?.code).toBe(-3);
    });

    it('returns network info when connected', async () => {
      const adapter = await createAdapter();
      await adapter.requestAccess();

      const result = await adapter.getNetwork();
      expect(result.network).toBe(NETWORK_NAME[Scope.PUBNET]);
      expect(result.networkPassphrase).toBe(NETWORK_PASSPHRASE[Scope.PUBNET]);
    });
  });

  describe('isAllowed', () => {
    it('returns false when no session exists', async () => {
      const adapter = await createAdapter();
      const result = await adapter.isAllowed();
      expect(result.isAllowed).toBe(false);
    });

    it('returns true when a stellar session exists', async () => {
      const adapter = await createAdapter();
      mockClient.getSession.mockResolvedValue(pubnetSession());

      const result = await adapter.isAllowed();
      expect(result.isAllowed).toBe(true);
    });
  });

  describe('isConnected', () => {
    it('returns false before requestAccess', async () => {
      const adapter = await createAdapter();
      const result = await adapter.isConnected();
      expect(result.isConnected).toBe(false);
    });

    it('returns true after requestAccess', async () => {
      const adapter = await createAdapter();
      await adapter.requestAccess();

      const result = await adapter.isConnected();
      expect(result.isConnected).toBe(true);
    });
  });

  describe('signTransaction', () => {
    it('signs a transaction and returns the result', async () => {
      mockClient.invokeMethod.mockResolvedValue({
        signedTxXdr: 'signed-xdr',
        signerAddress: TEST_ADDRESS,
      });

      const adapter = await createAdapter();
      await adapter.requestAccess();

      const result = await adapter.signTransaction('some-xdr');
      expect(result.signedTxXdr).toBe('signed-xdr');
      expect(result.signerAddress).toBe(TEST_ADDRESS);
      expect(result.error).toBeUndefined();
      expect(mockClient.invokeMethod).toHaveBeenCalledWith({
        scope: Scope.PUBNET,
        request: {
          method: 'signTransaction',
          params: {
            xdr: 'some-xdr',
            opts: {
              networkPassphrase: NETWORK_PASSPHRASE[Scope.PUBNET],
              address: TEST_ADDRESS,
            },
          },
        },
      });
    });

    it('returns error when submit option is provided', async () => {
      const adapter = await createAdapter();
      await adapter.requestAccess();

      const result = await adapter.signTransaction('xdr', { submit: true });
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('submit');
    });

    it('returns error when submitUrl option is provided', async () => {
      const adapter = await createAdapter();
      await adapter.requestAccess();

      const result = await adapter.signTransaction('xdr', { submitUrl: 'http://example.com' });
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('submitUrl');
    });

    it('returns error when not connected', async () => {
      const adapter = await createAdapter();
      const result = await adapter.signTransaction('xdr');
      expect(result.error).toBeDefined();
    });
  });

  describe('signAuthEntry', () => {
    it('signs an auth entry and returns the result', async () => {
      mockClient.invokeMethod.mockResolvedValue({
        signedAuthEntry: 'signed-auth',
        signerAddress: TEST_ADDRESS,
      });

      const adapter = await createAdapter();
      await adapter.requestAccess();

      const result = await adapter.signAuthEntry('auth-entry-xdr');
      expect(result.signedAuthEntry).toBe('signed-auth');
      expect(result.signerAddress).toBe(TEST_ADDRESS);
      expect(mockClient.invokeMethod).toHaveBeenCalledWith({
        scope: Scope.PUBNET,
        request: {
          method: 'signAuthEntry',
          params: {
            authEntry: 'auth-entry-xdr',
            opts: {
              networkPassphrase: NETWORK_PASSPHRASE[Scope.PUBNET],
              address: TEST_ADDRESS,
            },
          },
        },
      });
    });

    it('returns error when not connected', async () => {
      const adapter = await createAdapter();
      const result = await adapter.signAuthEntry('auth-entry-xdr');
      expect(result.error).toBeDefined();
    });
  });

  describe('signMessage', () => {
    it('signs a message and returns the result', async () => {
      mockClient.invokeMethod.mockResolvedValue({
        signedMessage: 'signed-msg',
        signerAddress: TEST_ADDRESS,
      });

      const adapter = await createAdapter();
      await adapter.requestAccess();

      const result = await adapter.signMessage('Hello Stellar');
      expect(result.signedMessage).toBe('signed-msg');
      expect(result.signerAddress).toBe(TEST_ADDRESS);
      expect(mockClient.invokeMethod).toHaveBeenCalledWith({
        scope: Scope.PUBNET,
        request: {
          method: 'signMessage',
          params: {
            message: 'Hello Stellar',
            opts: {
              networkPassphrase: NETWORK_PASSPHRASE[Scope.PUBNET],
              address: TEST_ADDRESS,
            },
          },
        },
      });
    });

    it('returns error when not connected', async () => {
      const adapter = await createAdapter();
      const result = await adapter.signMessage('Hello');
      expect(result.error).toBeDefined();
    });
  });

  describe('on / off', () => {
    it('registers and removes event listeners', async () => {
      const adapter = await createAdapter();
      const spy = vi.fn();

      adapter.on('connect', spy);
      await adapter.requestAccess();
      expect(spy).toHaveBeenCalledWith(TEST_ADDRESS);

      spy.mockClear();
      adapter.off('connect', spy);
      await adapter.disconnect();
      mockClient.createSession.mockResolvedValue(pubnetSession());
      await adapter.requestAccess();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('handleSessionChangedEvent', () => {
    it('updates address when session changes externally', async () => {
      const adapter = await createAdapter();
      await adapter.requestAccess();

      // Get the notification handler that was registered
      const handler = mockClient.onNotification.mock.calls[0]?.[0];
      expect(handler).toBeDefined();

      const newAddress = 'GNEWADDRESS1234567890123456789012345678901234567890123456';
      await handler({
        method: 'wallet_sessionChanged',
        params: {
          sessionScopes: {
            [Scope.PUBNET]: {
              accounts: [`stellar:pubnet:${newAddress}`],
            },
          },
        },
      });

      const { address } = await adapter.getAddress();
      expect(address).toBe(newAddress);
    });

    it('disconnects when session is revoked externally', async () => {
      const adapter = await createAdapter();
      await adapter.requestAccess();

      const handler = mockClient.onNotification.mock.calls[0]?.[0];
      const disconnectSpy = vi.fn();
      adapter.on('disconnect', disconnectSpy);

      await handler({
        method: 'wallet_sessionChanged',
        params: { sessionScopes: {} },
      });

      expect(disconnectSpy).toHaveBeenCalled();
    });

    it('ignores non-sessionChanged events', async () => {
      const adapter = await createAdapter();
      await adapter.requestAccess();

      const handler = mockClient.onNotification.mock.calls[0]?.[0];
      await handler({ method: 'wallet_other', params: {} });

      const { isConnected } = await adapter.isConnected();
      expect(isConnected).toBe(true);
    });
  });

  describe('isMetaMaskAvailable', () => {
    it('delegates to isMetamaskInstalled', async () => {
      vi.resetModules();
      vi.doMock('@metamask/multichain-api-client', () => ({
        getDefaultTransport: vi.fn(() => ({})),
        getMultichainClient: vi.fn(() => mockClient),
        isMetamaskInstalled: vi.fn().mockResolvedValue(false),
      }));

      const { MetaMaskStellarAdapter } = await import('./adapter.js');
      const result = await MetaMaskStellarAdapter.isMetaMaskAvailable();
      expect(result).toBe(false);
    });
  });
});
