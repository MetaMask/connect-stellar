import { vi } from 'vitest';

// Mock types for the multichain client
export interface MockMultichainClient {
  getSession: ReturnType<typeof vi.fn>;
  createSession: ReturnType<typeof vi.fn>;
  revokeSession: ReturnType<typeof vi.fn>;
  invokeMethod: ReturnType<typeof vi.fn>;
  onNotification: ReturnType<typeof vi.fn>;
  removeAllListeners?: ReturnType<typeof vi.fn>;
}

// Mock transport - simulate a basic transport interface
export const mockTransport = {
  send: vi.fn().mockResolvedValue(undefined),
  onMessage: vi.fn(),
  removeAllListeners: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockResolvedValue(true),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  postMessage: vi.fn(),
};

// Mock multichain client factory
export const createMockMultichainClient = (): MockMultichainClient => ({
  getSession: vi.fn().mockResolvedValue({}),
  createSession: vi.fn().mockResolvedValue({}),
  revokeSession: vi.fn().mockResolvedValue(undefined),
  invokeMethod: vi.fn().mockResolvedValue({}),
  onNotification: vi.fn().mockReturnValue(vi.fn()), // Return a mock cleanup function
  removeAllListeners: vi.fn(),
});

// Mock the getDefaultTransport function
export const mockGetDefaultTransport = vi.fn(() => mockTransport);

// Mock the getMultichainClient function
export const mockGetMultichainClient = vi.fn(() => createMockMultichainClient());

// Setup function to mock the entire multichain-api-client module
export const setupMultichainApiClientMocks = () => {
  vi.mock('@metamask/multichain-api-client', () => ({
    getDefaultTransport: mockGetDefaultTransport,
    getMultichainClient: vi.fn(() => createMockMultichainClient()),
  }));
};

// Test data constants
export const TEST_ADDRESSES = {
  PUBNET: 'GABC2DEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
};

export const TEST_SCOPES = {
  PUBNET: 'stellar:pubnet',
};

export const TEST_SESSIONS = {
  EMPTY: {},
  PUBNET: {
    sessionScopes: {
      [TEST_SCOPES.PUBNET]: {
        accounts: [`${TEST_SCOPES.PUBNET}:${TEST_ADDRESSES.PUBNET}`],
      },
    },
  },
};

export const TEST_MESSAGES = {
  SIMPLE: 'Hello, World!',
};
