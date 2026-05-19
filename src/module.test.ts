import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdapterErrorCode, NETWORK_NAME, NETWORK_PASSPHRASE, Scope } from './types.js';

const TEST_ADDRESS = 'GABC2DEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV';

// Mock the adapter that MetaMaskModule wraps
const mockAdapter = {
  requestAccess: vi.fn(),
  disconnect: vi.fn(),
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
  signTransaction: vi.fn(),
  signAuthEntry: vi.fn(),
  signMessage: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('./adapter.js', () => ({
  MetaMaskStellarAdapter: vi.fn(() => mockAdapter),
}));

// Need to mock multichain for the static method
vi.mock('@metamask/multichain-api-client', () => ({
  getDefaultTransport: vi.fn(() => ({})),
  getMultichainClient: vi.fn(() => ({
    extendsRpcApi: vi.fn().mockReturnThis(),
    getSession: vi.fn().mockResolvedValue(null),
    onNotification: vi.fn().mockReturnValue(vi.fn()),
  })),
  isMetamaskInstalled: vi.fn().mockResolvedValue(true),
}));

// Mock localStorage
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
});

import { METAMASK_ID, MetaMaskModule } from './module.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockAdapter.requestAccess.mockResolvedValue({ address: TEST_ADDRESS });
  mockAdapter.getAddress.mockResolvedValue({ address: TEST_ADDRESS });
  mockAdapter.getNetwork.mockResolvedValue({
    network: NETWORK_NAME[Scope.PUBNET],
    networkPassphrase: NETWORK_PASSPHRASE[Scope.PUBNET],
  });
  mockAdapter.disconnect.mockResolvedValue({});
  mockAdapter.signTransaction.mockResolvedValue({
    signedTxXdr: 'signed-xdr',
    signerAddress: TEST_ADDRESS,
  });
  mockAdapter.signAuthEntry.mockResolvedValue({
    signedAuthEntry: 'signed-auth',
    signerAddress: TEST_ADDRESS,
  });
  mockAdapter.signMessage.mockResolvedValue({
    signedMessage: 'signed-msg',
    signerAddress: TEST_ADDRESS,
  });
});

describe('MetaMaskModule', () => {
  it('exposes the correct product metadata', () => {
    const mod = new MetaMaskModule();
    expect(mod.productId).toBe(METAMASK_ID);
    expect(mod.productName).toBe('MetaMask');
    expect(mod.moduleType).toBe('HOT_WALLET');
  });

  describe('getAddress', () => {
    it('calls requestAccess and returns address', async () => {
      const mod = new MetaMaskModule();
      const result = await mod.getAddress();

      expect(result.address).toBe(TEST_ADDRESS);
      expect(mockAdapter.requestAccess).toHaveBeenCalled();
    });

    it('skips requestAccess when skipRequestAccess is true', async () => {
      const mod = new MetaMaskModule();
      const result = await mod.getAddress({ skipRequestAccess: true });

      expect(result.address).toBe(TEST_ADDRESS);
      expect(mockAdapter.getAddress).toHaveBeenCalled();
      expect(mockAdapter.requestAccess).not.toHaveBeenCalled();
    });

    it('throws when adapter returns an error', async () => {
      mockAdapter.requestAccess.mockResolvedValue({
        address: '',
        error: { code: -1, message: 'denied' },
      });

      const mod = new MetaMaskModule();
      await expect(mod.getAddress()).rejects.toEqual({ code: -1, message: 'denied' });
    });
  });

  describe('signTransaction', () => {
    it('signs and returns the result', async () => {
      const mod = new MetaMaskModule();
      const result = await mod.signTransaction('some-xdr');

      expect(result.signedTxXdr).toBe('signed-xdr');
      expect(result.signerAddress).toBe(TEST_ADDRESS);
    });

    it('throws on adapter error', async () => {
      mockAdapter.signTransaction.mockResolvedValue({
        signedTxXdr: '',
        signerAddress: '',
        error: { code: -1, message: 'sign failed' },
      });

      const mod = new MetaMaskModule();
      await expect(mod.signTransaction('xdr')).rejects.toEqual({
        code: -1,
        message: 'sign failed',
      });
    });
  });

  describe('signAuthEntry', () => {
    it('signs and returns the result', async () => {
      const mod = new MetaMaskModule();
      const result = await mod.signAuthEntry('auth-xdr');

      expect(result.signedAuthEntry).toBe('signed-auth');
      expect(result.signerAddress).toBe(TEST_ADDRESS);
    });

    it('throws when signedAuthEntry is null', async () => {
      mockAdapter.signAuthEntry.mockResolvedValue({
        signedAuthEntry: null,
        signerAddress: TEST_ADDRESS,
      });

      const mod = new MetaMaskModule();
      await expect(mod.signAuthEntry('auth-xdr')).rejects.toEqual({
        code: AdapterErrorCode.NOT_CONNECTED,
        message: 'MetaMask did not return a signed auth entry.',
      });
    });
  });

  describe('signMessage', () => {
    it('signs and returns the result', async () => {
      const mod = new MetaMaskModule();
      const result = await mod.signMessage('Hello');

      expect(result.signedMessage).toBe('signed-msg');
      expect(result.signerAddress).toBe(TEST_ADDRESS);
    });
  });

  describe('getNetwork', () => {
    it('returns network info', async () => {
      const mod = new MetaMaskModule();
      const result = await mod.getNetwork();

      expect(result.network).toBe('PUBLIC');
      expect(result.networkPassphrase).toBe(NETWORK_PASSPHRASE[Scope.PUBNET]);
    });
  });

  describe('disconnect', () => {
    it('calls adapter disconnect', async () => {
      const mod = new MetaMaskModule();
      await mod.disconnect();
      expect(mockAdapter.disconnect).toHaveBeenCalled();
    });

    it('throws on adapter error', async () => {
      mockAdapter.disconnect.mockResolvedValue({
        error: { code: -1, message: 'disconnect failed' },
      });

      const mod = new MetaMaskModule();
      await expect(mod.disconnect()).rejects.toEqual({
        code: -1,
        message: 'disconnect failed',
      });
    });
  });

  describe('onChange', () => {
    it('registers an accountsChanged listener on the adapter', () => {
      const mod = new MetaMaskModule();
      const callback = vi.fn();
      mod.onChange(callback);

      expect(mockAdapter.on).toHaveBeenCalledWith('accountsChanged', expect.any(Function));
    });

    it('invokes callback with address and network when account changes', async () => {
      const mod = new MetaMaskModule();
      const callback = vi.fn();
      mod.onChange(callback);

      const listener = mockAdapter.on.mock.calls.find(([event]) => event === 'accountsChanged')?.[1] as
        | ((data: unknown) => void)
        | undefined;
      expect(listener).toBeDefined();

      listener?.(TEST_ADDRESS);

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledWith({
          address: TEST_ADDRESS,
          network: NETWORK_NAME[Scope.PUBNET],
          networkPassphrase: NETWORK_PASSPHRASE[Scope.PUBNET],
        });
      });
    });

    it('invokes callback with error when getNetwork rejects', async () => {
      mockAdapter.getNetwork.mockRejectedValue(new Error('network unavailable'));

      const mod = new MetaMaskModule();
      const callback = vi.fn();
      mod.onChange(callback);

      const listener = mockAdapter.on.mock.calls.find(([event]) => event === 'accountsChanged')?.[1] as
        | ((data: unknown) => void)
        | undefined;

      listener?.(TEST_ADDRESS);

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledWith({
          address: '',
          network: '',
          networkPassphrase: '',
          error: { code: -1, message: 'network unavailable' },
        });
      });
    });
  });
});
