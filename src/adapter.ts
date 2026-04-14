import {
  type CaipAccountId,
  type SessionData,
  type Transport,
  getDefaultTransport,
  getMultichainClient,
  isMetamaskInstalled,
} from '@metamask/multichain-api-client';
import { metamaskIcon } from './icon.js';
import { NETWORK_NAME, NETWORK_PASSPHRASE, Scope, type StellarAdapterError, type StellarRpc } from './types.js';
import {
  getAddressFromCaipAccountId,
  isSessionChangedEvent,
  networkPassphraseToScope,
} from './utils.js';

import type { MultichainApiClient } from '@metamask/multichain-api-client';

/**
 * Typed MultichainApiClient scoped to Stellar RPC methods only.
 * The unused EVM/Solana/BIP122/Tron namespaces are set to `never` so that
 * `invokeMethod` calls are fully typed for `stellar:*` scopes without
 * leaking unrelated RPC definitions from the default SDK api.
 */
type StellarClient = MultichainApiClient<
  // DefaultRpcApi merged with StellarRpc — required because extendsRpcApi merges generics
  // This gives us typed invokeMethod calls for stellar:* scopes.
  { eip155: never; solana: never; bip122: never; tron: never } & StellarRpc
>;

/**
 * MetaMask adapter for Stellar blockchain implementing SEP-0043.
 * https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0043.md
 */
export class MetaMaskStellarAdapter {
  readonly name = 'MetaMask';
  readonly url = 'https://metamask.io';
  readonly icon = metamaskIcon;

  private _address: string | null = null;
  private _scope: Scope | undefined;
  private _connected = false;
  private _transport: Transport;
  private _client: StellarClient;
  private _removeSessionChangedListener: (() => void) | undefined;
  private _listeners: Map<string, Set<(data: unknown) => void>> = new Map();
  private _restorePromise: Promise<void> | undefined;

  /**
   * Instantiates the adapter, initialises the MetaMask multichain transport and
   * client, then attempts to silently restore any pre-existing Stellar session
   * so callers can skip `requestAccess()` on page reload.
   * The `sessionChanged` listener is started immediately so the adapter stays in
   * sync with MetaMask even before `requestAccess()` is called.
   */
  constructor() {
    this._transport = getDefaultTransport();
    this._client = getMultichainClient({ transport: this._transport }).extendsRpcApi<StellarRpc>();
    this.startSessionListener();
    // Auto-restore session on page load — stored so requestAccess() can await it.
    this._restorePromise = this.tryRestoringSession()
      .then(() => {
        if (this._address) {
          this._connected = true;
          this.emit('connect', this._address);
        }
      })
      .catch((error) => {
        console.warn('Failed to auto-restore Stellar MetaMask session:', error);
      });
  }

  // --- SEP-0043 Interface ---

  /**
   * Requests access to the user's Stellar account via MetaMask.
   * Creates a new session on PUBNET if none exists.
   *
   * @returns The connected Stellar address, or an error if access was denied.
   */
  async requestAccess(): Promise<{ address: string } & { error?: StellarAdapterError }> {
    try {
      // Wait for the constructor's restore attempt to settle before proceeding.
      await this._restorePromise;
      if (!this._address) {
        await this.createSession(Scope.PUBNET);
      }
      if (!this._address) {
        return { address: '', error: { code: -1, message: 'No address selected' } };
      }
      this._connected = true;
      this.startSessionListener();
      this.emit('connect', this._address);
      return { address: this._address };
    } catch (e: unknown) {
      return { address: '', error: toAdapterError(e) };
    }
  }

  /**
   * Disconnects from MetaMask and revokes all Stellar scopes.
   * Stops the `sessionChanged` listener before revoking so the revocation event
   * does not trigger a redundant disconnect loop.
   *
   * @returns An empty object on success, or an error descriptor on failure.
   */
  async disconnect(): Promise<{ error?: StellarAdapterError }> {
    try {
      this._address = null;
      this._scope = undefined;
      this._connected = false;
      this.emit('disconnect', undefined);
      // Stop the listener before revoking to avoid handling the resulting sessionChanged event.
      this._removeSessionChangedListener?.();
      this._removeSessionChangedListener = undefined;
      await this._client.revokeSession({ scopes: [Scope.PUBNET] });
      return {};
    } catch (e: unknown) {
      return { error: toAdapterError(e) };
    }
  }

  /**
   * Returns the currently connected Stellar address.
   * Requires `requestAccess()` to have been called first.
   *
   * @returns The active Stellar address, or an error with code `-3` if not connected.
   */
  async getAddress(): Promise<{ address: string } & { error?: StellarAdapterError }> {
    if (!this._address) {
      return {
        address: '',
        error: { code: -3, message: 'Not connected. Call requestAccess() first.' },
      };
    }
    return { address: this._address };
  }

  /**
   * Returns the current network name and passphrase.
   * Requires `requestAccess()` to have been called first.
   *
   * @returns The human-readable network name and its SEP-0043 passphrase, or an error with code `-3` if not connected.
   */
  async getNetwork(): Promise<
    { network: string; networkPassphrase: string } & { error?: StellarAdapterError }
  > {
    if (!this._scope) {
      return {
        network: '',
        networkPassphrase: '',
        error: { code: -3, message: 'Not connected. Call requestAccess() first.' },
      };
    }
    return {
      network: NETWORK_NAME[this._scope],
      networkPassphrase: NETWORK_PASSPHRASE[this._scope],
    };
  }

  /**
   * Returns whether the dapp is allowed to interact with the user's Stellar account.
   * Queries MetaMask for an active session with at least one `stellar:*` scope.
   *
   * @returns `{ isAllowed: true }` when a valid session exists, `false` otherwise.
   */
  async isAllowed(): Promise<{ isAllowed: boolean } & { error?: StellarAdapterError }> {
    try {
      const session = await this._client.getSession();
      const isAllowed = !!(
        session &&
        Object.keys(session.sessionScopes).some((scope) => scope.startsWith('stellar:'))
      );
      return { isAllowed };
    } catch (e: unknown) {
      return { isAllowed: false, error: toAdapterError(e) };
    }
  }

  /**
   * Returns whether the adapter currently has an active connection with an address.
   * Purely local check — does not query MetaMask.
   *
   * @returns `{ isConnected: true }` when both the internal connected flag and address are set.
   */
  async isConnected(): Promise<{ isConnected: boolean } & { error?: StellarAdapterError }> {
    return { isConnected: this._connected && !!this._address };
  }

  /**
   * Signs a Stellar transaction XDR via MetaMask.
   *
   * @param xdr - Base64-encoded XDR of the transaction envelope to sign.
   * @param opts.networkPassphrase - Network passphrase identifying the target network (defaults to the current session network).
   * @param opts.address - Stellar address to sign with (defaults to the connected address).
   * @returns The signed transaction XDR and the address that produced the signature, or an error descriptor.
   * @throws When `submit` or `submitUrl` options are provided — automatic submission is not supported.
   */
  async signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string; address?: string; submit?: boolean; submitUrl?: string },
  ): Promise<{ signedTxXdr: string; signerAddress: string } & { error?: StellarAdapterError }> {
    try {
      if (opts?.submit !== undefined) {
        throw new Error('The "submit" option is not supported. Submit the transaction yourself after signing.');
      }
      if (opts?.submitUrl !== undefined) {
        throw new Error('The "submitUrl" option is not supported. Submit the transaction yourself after signing.');
      }

      const scope = this.resolveScopeForCall(opts?.networkPassphrase);
      await this.ensureScopeInSession(scope);

      const result = await this._client.invokeMethod({
        scope,
        request: {
          method: 'signTransaction',
          params: {
            xdr,
            networkPassphrase: opts?.networkPassphrase ?? NETWORK_PASSPHRASE[scope],
            address: opts?.address ?? this._address,
          },
        },
      });

      return {
        signedTxXdr: result.signedTxXdr as string,
        signerAddress: result.signerAddress as string,
      };
    } catch (e: unknown) {
      return { signedTxXdr: '', signerAddress: '', error: toAdapterError(e) };
    }
  }

  /**
   * Signs a Soroban authorization entry via MetaMask.
   *
   * @param authEntry - Base64-encoded XDR of the `SorobanAuthorizationEntry` to sign.
   * @param opts.networkPassphrase - Network passphrase identifying the target network (defaults to the current session network).
   * @param opts.address - Stellar address to sign with (defaults to the connected address).
   * @returns The signed auth entry XDR and the signer address, or an error descriptor.
   */
  async signAuthEntry(
    authEntry: string,
    opts?: { networkPassphrase?: string; address?: string },
  ): Promise<
    { signedAuthEntry: string | null; signerAddress: string } & { error?: StellarAdapterError }
  > {
    try {
      const scope = this.resolveScopeForCall(opts?.networkPassphrase);
      await this.ensureScopeInSession(scope);

      const result = await this._client.invokeMethod({
        scope,
        request: {
          method: 'signAuthEntry',
          params: {
            authEntry,
            networkPassphrase: opts?.networkPassphrase ?? NETWORK_PASSPHRASE[scope],
            address: opts?.address ?? this._address,
          },
        },
      });

      return {
        signedAuthEntry: result.signedAuthEntry as string,
        signerAddress: result.signerAddress as string,
      };
    } catch (e: unknown) {
      return { signedAuthEntry: null, signerAddress: '', error: toAdapterError(e) };
    }
  }

  /**
   * Signs an arbitrary message via MetaMask.
   *
   * @param message - UTF-8 message string to sign.
   * @param opts.networkPassphrase - Network passphrase identifying the target network (defaults to the current session network).
   * @param opts.address - Stellar address to sign with (defaults to the connected address).
   * @returns The base64-encoded signed message and the signer address, or an error descriptor.
   */
  async signMessage(
    message: string,
    opts?: { networkPassphrase?: string; address?: string },
  ): Promise<
    { signedMessage: string; signerAddress: string } & { error?: StellarAdapterError }
  > {
    try {
      const scope = this.resolveScopeForCall(opts?.networkPassphrase);
      await this.ensureScopeInSession(scope);

      const result = await this._client.invokeMethod({
        scope,
        request: {
          method: 'signMessage',
          params: {
            message,
            networkPassphrase: opts?.networkPassphrase ?? NETWORK_PASSPHRASE[scope],
            address: opts?.address ?? this._address,
          },
        },
      });

      return {
        signedMessage: result.signedMessage as string,
        signerAddress: result.signerAddress as string,
      };
    } catch (e: unknown) {
      return { signedMessage: '', signerAddress: '', error: toAdapterError(e) };
    }
  }

  /**
   * Convenience method equivalent to `requestAccess()` but returns `void`.
   * Provided for compatibility with connect-style wallet adapters that do not
   * expect a return value.
   */
  async connect(): Promise<void> {
    await this.requestAccess();
  }

  /**
   * Registers a listener for adapter events.
   *
   * Supported events:
   * - `connect` — fired after a successful `requestAccess()`, payload is the Stellar address.
   * - `disconnect` — fired after `disconnect()`, payload is `undefined`.
   * - `accountsChanged` — fired when the user switches account in MetaMask, payload is the new address.
   * - `networkChanged` — fired when the active network scope changes, payload is `{ network, networkPassphrase }`.
   *
   * @param event - Event name to subscribe to.
   * @param listener - Callback invoked with the event payload.
   */
  on(event: string, listener: (data: unknown) => void): void {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event)!.add(listener);
  }

  /**
   * Removes a previously registered listener for an adapter event.
   *
   * @param event - Event name the listener was registered under.
   * @param listener - The exact callback reference passed to `on()`.
   */
  off(event: string, listener: (data: unknown) => void): void {
    this._listeners.get(event)?.delete(listener);
  }

  /**
   * Emits an adapter event to all registered listeners for that event.
   *
   * @param event - The event name to emit.
   * @param data - Arbitrary payload forwarded to each listener.
   */
  private emit(event: string, data: unknown): void {
    this._listeners.get(event)?.forEach((listener) => listener(data));
  }

  /**
   * Returns whether MetaMask is installed in the current browser environment.
   *
   * @returns `true` when the MetaMask extension is detected, `false` otherwise.
   */
  static async isMetaMaskAvailable(): Promise<boolean> {
    return isMetamaskInstalled();
  }

  /**
   * Starts the `sessionChanged` notification listener if one is not already active.
   * Called from the constructor and from `requestAccess()` to re-establish the
   * listener after a `disconnect()` cycle.
   */
  private startSessionListener(): void {
    if (this._removeSessionChangedListener) return;
    this._removeSessionChangedListener = this._client.onNotification(
      this.handleSessionChangedEvent.bind(this),
    );
  }

  /**
   * Resolves the Stellar scope for a signing call.
   * Uses the passphrase if provided, otherwise falls back to the current session scope.
   *
   * @param networkPassphrase - Optional SEP-0043 network passphrase to derive the scope from.
   * @returns The resolved `Scope` enum value.
   * @throws When no passphrase is given and the adapter is not connected.
   */
  private resolveScopeForCall(networkPassphrase?: string): Scope {
    if (networkPassphrase) {
      return networkPassphraseToScope(networkPassphrase);
    }
    if (!this._scope) {
      throw new Error('Not connected. Call requestAccess() first.');
    }
    return this._scope;
  }

  /**
   * Ensures the given scope (and optionally the current address) is present in the active session.
   * Creates a new MetaMask session for that scope when the check fails.
   *
   * @param scope - The Stellar scope that must be present in the session.
   */
  private async ensureScopeInSession(scope: Scope): Promise<void> {
    const session = await this._client.getSession();
    const hasScope =
      this._address &&
      session?.sessionScopes[scope]?.accounts?.some((acc) =>
        acc.includes(this._address as string),
      );
    if (!hasScope) {
      await this.createSession(scope, this._address ? [this._address] : undefined);
    }
  }

  /**
   * Attempts to restore an existing MetaMask session for Stellar on page load.
   * Silently no-ops if no active session exists, and logs a warning on unexpected errors.
   */
  private async tryRestoringSession(): Promise<void> {
    try {
      const existingSession = await this._client.getSession();
      if (!existingSession) return;
      const scope = this.restoreScope();
      this.updateSession(existingSession, scope);
    } catch (error) {
      console.warn('Failed to restore Stellar MetaMask session:', error);
    }
  }

  /**
   * Creates a new MetaMask session for the given Stellar scope.
   * The selected address is derived directly from the session response via `updateSession`;
   * no `accountsChanged` event is awaited (deprecated).
   *
   * @param scope - The Stellar network scope to request access for.
   * @param addresses - Optional list of Stellar addresses to pre-populate as CAIP account hints.
   */
  private async createSession(scope: Scope, addresses?: string[]): Promise<void> {
    const session = await this._client.createSession({
      optionalScopes: {
        [scope]: {
          accounts: (
            addresses ? addresses.map((addr) => `${scope}:${addr}` as CaipAccountId) : []
          ),
          methods: [],
          notifications: [],
        },
      },
    });

    this.updateSession(session);
  }

  /**
   * Updates the adapter's internal state from a MetaMask `SessionData` object.
   * Resolves the address by preferring the previously connected address, falling back to the
   * first account in the PUBNET scope.
   *
   * @param session - The MetaMask session data to synchronise from.
   * @param selectedScope - Unused, kept for internal call-site compatibility.
   */
  private updateSession(session: SessionData, selectedScope?: Scope): void {
    const scope = this.selectScopeWithPriority(session, selectedScope);
    if (!scope) {
      this._address = null;
      return;
    }

    const scopeAccounts = session?.sessionScopes[scope]?.accounts;
    if (!scopeAccounts?.[0]) {
      this._address = null;
      return;
    }

    let addressToConnect: string;
    if (
      this._address &&
      scopeAccounts.includes(`${scope}:${this._address}` as CaipAccountId)
    ) {
      addressToConnect = this._address;
    } else {
      addressToConnect = getAddressFromCaipAccountId(scopeAccounts[0]);
    }

    this.setAddress(addressToConnect);
    this.setScope(scope);
  }

  /**
   * Returns `Scope.PUBNET` if present in the session, `undefined` otherwise.
   * Only mainnet is supported.
   *
   * @param session - The MetaMask session to inspect for available scopes.
   * @returns `Scope.PUBNET` when present in the session, or `undefined`.
   */
  private selectScopeWithPriority(
    session: SessionData,
    _preferredScope?: Scope,
  ): Scope | undefined {
    const available = new Set(Object.keys(session?.sessionScopes ?? {}));
    return available.has(Scope.PUBNET) ? Scope.PUBNET : undefined;
  }

  /**
   * Sets the active address and emits `accountsChanged` if the value changed.
   * Also updates the internal `_connected` flag accordingly.
   *
   * @param address - New Stellar address to activate, or `null` to clear the connection.
   */
  private setAddress(address: string | null): void {
    if (this._address !== address) {
      this._connected = !!address;
      this._address = address;
      if (address) this.emit('accountsChanged', address);
    }
  }

  /**
   * Sets the active scope, persists it to `localStorage`, and emits `networkChanged` if the value changed.
   *
   * @param scope - The Stellar network scope to activate.
   */
  private setScope(scope: Scope): void {
    if (this._scope !== scope) {
      try {
        localStorage.setItem('metamaskStellarAdapterScope', scope);
      } catch {
        // localStorage unavailable (SSR, service worker, etc.) — skip persistence.
      }
      this._scope = scope;
      this.emit('networkChanged', {
        network: NETWORK_NAME[scope],
        networkPassphrase: NETWORK_PASSPHRASE[scope],
      });
    }
  }

  /**
   * Restores the previously persisted Stellar scope from `localStorage`.
   *
   * @returns The persisted `Scope`, or `undefined` if nothing was saved.
   */
  private restoreScope(): Scope | undefined {
    try {
      const saved = localStorage.getItem('metamaskStellarAdapterScope');
      return saved ? (saved as Scope) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Handles incoming `wallet_sessionChanged` notifications from MetaMask.
   * Keeps adapter state in sync when the session scope or accounts change externally.
   * Calls `disconnect()` when the session is empty or revoked.
   *
   * @param data - Raw notification payload from the MetaMask multichain client.
   */
  private async handleSessionChangedEvent(data: unknown): Promise<void> {
    if (!isSessionChangedEvent(data)) return;

    const session = (data as { params?: SessionData })?.params;
    if (!session) {
      await this.disconnect();
      return;
    }
    const scope = this.selectScopeWithPriority(session, this._scope);
    if (!scope) {
      await this.disconnect();
      return;
    }
    const isEmpty = !((session?.sessionScopes?.[scope]?.accounts?.length ?? 0) > 0);
    if (isEmpty) {
      await this.disconnect();
      return;
    }
    this.updateSession(session, scope);
  }
}

/**
 * Converts an unknown thrown value into a `StellarAdapterError`.
 * Preserves the numeric `code` field when the thrown object exposes one.
 *
 * @param e - The value caught in a `catch` block.
 * @returns A normalised `StellarAdapterError` with a numeric code and message string.
 */
function toAdapterError(e: unknown): StellarAdapterError {
  if (e instanceof Error) return { code: -1, message: e.message };
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const obj = e as Record<string, unknown>;
    const code = typeof obj['code'] === 'number' ? (obj['code'] as number) : -1;
    return { code, message: String(obj['message']) };
  }
  return { code: -1, message: String(e) };
}
