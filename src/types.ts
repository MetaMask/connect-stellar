import type { RpcMethod } from '@metamask/multichain-api-client';

/**
 * Stellar CAIP-2 network scopes.
 * Based on CAIP-104: https://github.com/ChainAgnostic/namespaces/blob/main/stellar/caip2.md
 *
 * NOTE: Confirm these scope values with the MetaMask Stellar snap team before finalizing.
 */
export enum Scope {
  PUBNET = 'stellar:pubnet',
}

export const STELLAR_SIGNING_METHODS = ['signMessage', 'signTransaction', 'signAuthEntry'] as const;

/**
 * SEP-0043 signing options shared by message, transaction, and auth-entry signing.
 */
export type Sep43SignOptions = {
  networkPassphrase?: string;
  address?: string | null;
};

/**
 * RPC API definition for the Stellar MetaMask snap.
 * Passed to `MultichainApiClient.extendsRpcApi<StellarRpc>()` to obtain a fully typed client
 * that constrains `invokeMethod` calls to the three Stellar signing methods below.
 *
 * Each method follows the SEP-0043 request/response shape.
 */
export type StellarRpc = {
  stellar: {
    methods: {
      /** Signs a transaction envelope XDR and returns the signed XDR together with the signer address. */
      signTransaction: RpcMethod<
        { xdr: string; opts?: Sep43SignOptions },
        { signedTxXdr: string; signerAddress: string }
      >;
      /** Signs a Soroban `SorobanAuthorizationEntry` XDR and returns the signed entry with the signer address. */
      signAuthEntry: RpcMethod<
        { authEntry: string; opts?: Sep43SignOptions },
        { signedAuthEntry: string | null; signerAddress: string }
      >;
      /** Signs an arbitrary UTF-8 message and returns the base64-encoded signature with the signer address. */
      signMessage: RpcMethod<
        { message: string; opts?: Sep43SignOptions },
        { signedMessage: string; signerAddress: string }
      >;
    };
    events: [];
  };
};

/**
 * Official SEP-0043 network passphrases keyed by `Scope`.
 * Used to populate the `networkPassphrase` field in RPC calls and to resolve scopes from passphrases.
 */
export const NETWORK_PASSPHRASE: Record<Scope, string> = {
  [Scope.PUBNET]: 'Public Global Stellar Network ; September 2015',
};

/**
 * Human-readable network names keyed by `Scope`.
 * Matches the values expected by the Stellar Wallets Kit `getNetwork()` contract.
 */
export const NETWORK_NAME: Record<Scope, string> = {
  [Scope.PUBNET]: 'PUBLIC',
};

/** Stable error codes returned by adapter methods. */
export const AdapterErrorCode = {
  GENERIC: -1,
  NOT_CONNECTED: -3,
  UNSUPPORTED_NETWORK: -4,
} as const;

/**
 * Normalised error object returned by all SEP-0043 adapter methods.
 * Mirrors the Stellar Wallets Kit error shape so callers can handle errors uniformly.
 */
export interface StellarAdapterError {
  /** Human-readable description of the error. */
  message: string;
  /** Numeric error code; see {@link AdapterErrorCode}. */
  code: number;
  /** Optional extended error context (e.g. from the MetaMask RPC layer). */
  ext?: string[];
}
