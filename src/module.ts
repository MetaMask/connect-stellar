import { type ModuleInterface, ModuleType } from '@creit.tech/stellar-wallets-kit';
import { MetaMaskStellarAdapter } from './adapter.js';
import { metamaskIcon } from './icon.js';
import { AdapterErrorCode } from './types.js';

/**
 * The unique product ID for the MetaMask module in the Stellar Wallets Kit.
 * @example
 * StellarWalletsKit.setWallet(METAMASK_ID);
 */
export const METAMASK_ID = 'metamask';

/**
 * MetaMask wallet module compatible with the Stellar Wallets Kit ModuleInterface.
 * https://stellarwalletskit.dev/wallets/create-wallet-module.html
 *
 * Wraps MetaMaskStellarAdapter (SEP-0043) and exposes it as a Stellar Wallets Kit module.
 * This class is designed to be imported and re-exported directly by the Stellar Wallets Kit
 * without any additional wrapping or mapping.
 *
 * @example
 * // In Stellar Wallets Kit:
 * export { MetaMaskModule, METAMASK_ID } from "@metamask/connect-stellar";
 *
 * @example
 * // In a dapp using the kit:
 * StellarWalletsKit.init({
 *   modules: [...defaultModules(), new MetaMaskModule()],
 *   selectedWalletId: METAMASK_ID,
 * });
 */
export class MetaMaskModule implements ModuleInterface {
  readonly moduleType = ModuleType.HOT_WALLET;
  readonly productId = METAMASK_ID;
  readonly productName = 'MetaMask';
  readonly productUrl = 'https://metamask.io';
  // readonly productIcon = 'https://raw.githubusercontent.com/MetaMask/brand-resources/main/SVG/svg-512/metamask-fox.svg';
  readonly productIcon = metamaskIcon;

  /** Underlying SEP-0043 adapter instance — shared across all kit method calls. */
  readonly adapter = new MetaMaskStellarAdapter();

  /**
   * Returns `true` if MetaMask is installed in the current browser environment.
   * Must respond in under 1 000 ms to satisfy the Stellar Wallets Kit availability check.
   *
   * @returns `true` when the MetaMask extension is detected, `false` otherwise.
   */
  async isAvailable(): Promise<boolean> {
    return MetaMaskStellarAdapter.isMetaMaskAvailable();
  }

  /**
   * Requests access to the user's Stellar account in MetaMask.
   * Restores an existing session when available, otherwise triggers the MetaMask approval flow.
   *
   * @param params.skipRequestAccess - When `true`, returns the address from an existing session only without prompting MetaMask.
   * @param params.path - Unused by this adapter; accepted for Stellar Wallets Kit interface compatibility.
   * @returns The connected Stellar address.
   * @throws `StellarAdapterError` when access is denied or no session exists and `skipRequestAccess` is `true`.
   */
  async getAddress(params?: { path?: string; skipRequestAccess?: boolean }): Promise<{ address: string }> {
    if (params?.skipRequestAccess === true) {
      const result = await this.adapter.getAddress();
      if (result.error) {
        throw result.error;
      }
      return { address: result.address };
    }

    const result = await this.adapter.requestAccess();
    if (result.error) {
      throw result.error;
    }
    return { address: result.address };
  }

  /**
   * Signs a Stellar transaction XDR via MetaMask.
   *
   * @param xdr - Base64-encoded XDR of the transaction envelope to sign.
   * @param opts.networkPassphrase - Network passphrase identifying the target network (defaults to the active session network).
   * @param opts.address - Stellar address to sign with (defaults to the connected address).
   * @param opts.path - Unused by this adapter; accepted for Stellar Wallets Kit interface compatibility.
   * @returns The signed transaction XDR and the address that produced the signature.
   * @throws `StellarAdapterError` on signing failure or if not connected.
   */
  async signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; address?: string; path?: string },
  ): Promise<{ signedTxXdr: string; signerAddress?: string }> {
    const result = await this.adapter.signTransaction(xdr, opts);
    if (result.error) {
      throw result.error;
    }
    return { signedTxXdr: result.signedTxXdr, signerAddress: result.signerAddress };
  }

  /**
   * Signs a Soroban authorization entry via MetaMask.
   *
   * @param authEntry - Base64-encoded XDR of the `SorobanAuthorizationEntry` to sign.
   * @param opts.networkPassphrase - Network passphrase identifying the target network (defaults to the active session network).
   * @param opts.address - Stellar address to sign with (defaults to the connected address).
   * @param opts.path - Unused by this adapter; accepted for Stellar Wallets Kit interface compatibility.
   * @returns The signed auth entry XDR and the signer address.
   * @throws `StellarAdapterError` on signing failure, if not connected, or if MetaMask returns a null entry.
   */
  async signAuthEntry(
    authEntry: string,
    opts?: { networkPassphrase?: string; address?: string; path?: string },
  ): Promise<{ signedAuthEntry: string; signerAddress?: string }> {
    const result = await this.adapter.signAuthEntry(authEntry, opts);
    if (result.error) {
      throw result.error;
    }
    if (!result.signedAuthEntry) {
      throw { code: AdapterErrorCode.NOT_CONNECTED, message: 'MetaMask did not return a signed auth entry.' };
    }
    return { signedAuthEntry: result.signedAuthEntry, signerAddress: result.signerAddress };
  }

  /**
   * Signs an arbitrary message string via MetaMask.
   *
   * @param message - UTF-8 plain-text message to sign.
   * @param opts.networkPassphrase - Network passphrase identifying the target network (defaults to the active session network).
   * @param opts.address - Stellar address to sign with (defaults to the connected address).
   * @param opts.path - Unused by this adapter; accepted for Stellar Wallets Kit interface compatibility.
   * @returns The base64-encoded signed message and the signer address.
   * @throws `StellarAdapterError` on signing failure or if not connected.
   */
  async signMessage(
    message: string,
    opts?: { networkPassphrase?: string; address?: string; path?: string },
  ): Promise<{ signedMessage: string; signerAddress?: string }> {
    const result = await this.adapter.signMessage(message, opts);
    if (result.error) {
      throw result.error;
    }
    return { signedMessage: result.signedMessage, signerAddress: result.signerAddress };
  }

  /**
   * Returns the current Stellar network name and passphrase from the active MetaMask session.
   *
   * @returns The human-readable network name and its SEP-0043 passphrase.
   * @throws `StellarAdapterError` when not connected.
   */
  async getNetwork(): Promise<{ network: string; networkPassphrase: string }> {
    const result = await this.adapter.getNetwork();
    if (result.error) {
      throw result.error;
    }
    return { network: result.network, networkPassphrase: result.networkPassphrase };
  }

  /**
   * Disconnects from MetaMask and revokes all Stellar session scopes.
   *
   * @throws `StellarAdapterError` when the underlying revoke call fails.
   */
  async disconnect(): Promise<void> {
    const result = await this.adapter.disconnect();
    if (result.error) {
      throw result.error;
    }
  }

  /**
   * Registers a callback invoked whenever the connected account or active network changes.
   * Internally subscribes to the adapter's `accountsChanged` event and enriches the payload
   * with the current network info before forwarding it to the caller.
   *
   * @param callback - Function called with the new address, network name, and network passphrase on each change.
   */
  onChange(
    callback: (event: {
      address: string;
      network: string;
      networkPassphrase: string;
      error?: { code: number; message: string };
    }) => void,
  ): void {
    this.adapter.on('accountsChanged', (data) => {
      const address = data as string;
      this.adapter
        .getNetwork()
        .then(({ network, networkPassphrase }) => callback({ address, network, networkPassphrase }))
        .catch((error) =>
          callback({
            address: '',
            network: '',
            networkPassphrase: '',
            error: { code: AdapterErrorCode.GENERIC, message: error.message },
          }),
        );
    });
  }
}
