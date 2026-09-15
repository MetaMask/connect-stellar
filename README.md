# MetaMask Connect Stellar

MetaMask adapter for Stellar, implementing the [SEP-0043](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0043.md) wallet interface.

Lets dapps sign Stellar transactions, Soroban auth entries, and arbitrary messages through MetaMask via the multichain API sdk.

## Installation

`yarn add @metamask/connect-stellar`

or

`npm install @metamask/connect-stellar`

or

`bun add @metamask/connect-stellar`


## Usage

### Standalone adapter (SEP-0043 compatible)

`MetaMaskStellarAdapter` implements the full [SEP-0043](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0043.md) wallet interface — it can be used anywhere a SEP-0043 adapter is expected.

```typescript
import { MetaMaskStellarAdapter } from '@metamask/connect-stellar';

const adapter = new MetaMaskStellarAdapter();

// Connect
const { address, error } = await adapter.requestAccess();

// Sign a transaction
const { signedTxXdr } = await adapter.signTransaction(xdr);

// Sign a Soroban auth entry
const { signedAuthEntry } = await adapter.signAuthEntry(authEntryXdr);

// Sign a message
const { signedMessage } = await adapter.signMessage('Hello Stellar');

// Disconnect
await adapter.disconnect();
```

### Direct SEP-0043 usage

If you need full control over the multichain session, you can skip the adapter and use the exported SEP-0043 primitives directly with `@metamask/multichain-api-client`:

```typescript
import {
  Scope,
  NETWORK_PASSPHRASE,
  NETWORK_NAME,
  getAddressFromCaipAccountId,
} from '@metamask/connect-stellar';
import { getDefaultTransport, getMultichainClient } from '@metamask/multichain-api-client';

const transport = getDefaultTransport();
const client = getMultichainClient({ transport })();

// Create a session on PUBNET
const session = await client.createSession({
  optionalScopes: {
    [Scope.PUBNET]: {
      accounts: [],
      methods: ['signMessage', 'signTransaction', 'signAuthEntry'],
      notifications: [],
    },
  },
});

// Extract the address from the session
const accounts = session.sessionScopes[Scope.PUBNET]?.accounts ?? [];
const address = getAddressFromCaipAccountId(accounts[0]);

// Sign a transaction
const result = await client.invokeMethod({
  scope: Scope.PUBNET,
  request: {
    method: 'signTransaction',
    params: {
      xdr,
      opts: {
        networkPassphrase: NETWORK_PASSPHRASE[Scope.PUBNET],
        address,
      },
    },
  },
});
```

### With Stellar Wallets Kit

```typescript
import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit';
import { MetaMaskModule, METAMASK_ID } from '@metamask/connect-stellar';

const kit = new StellarWalletsKit({
  modules: [new MetaMaskModule()],
  selectedWalletId: METAMASK_ID,
});
```

### Keep the dapp address in sync

Stellar Wallets Kit 2.1 does not forward the selected module's optional
`onChange` callback. A dapp that needs to react immediately when the user
changes accounts must subscribe to the currently selected module itself.

Subscribe after every `WALLET_SELECTED` event. The callback is available on
`MetaMaskModule`; modules that do not support account-change notifications do
not expose `onChange` and are simply skipped.

```typescript
import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit/sdk';
import { KitEventType, type ModuleInterface } from '@creit-tech/stellar-wallets-kit/types';

const modulesListeningForChanges = new WeakSet<ModuleInterface>();

function subscribeToSelectedWalletChanges(
  setAddress: (address: string) => void,
): void {
  let selectedModule: ModuleInterface;

  try {
    selectedModule = StellarWalletsKit.selectedModule;
  } catch {
    // No wallet has been selected yet.
    return;
  }

  if (!selectedModule.onChange || modulesListeningForChanges.has(selectedModule)) return;

  modulesListeningForChanges.add(selectedModule);
  selectedModule.onChange((event) => {
    // onChange cannot be unsubscribed, so ignore events from old selections.
    if (StellarWalletsKit.selectedModule !== selectedModule) return;
    if (event.error || !event.address) return;

    setAddress(event.address);
  });
}

StellarWalletsKit.on(KitEventType.WALLET_SELECTED, () => {
  subscribeToSelectedWalletChanges(setAddress);
});

// Also call it once after init if a wallet was already selected.
subscribeToSelectedWalletChanges(setAddress);
```

The `onChange` event contains `address`, `network`, `networkPassphrase`, and an
optional `error`. Account changes should update the dapp's active address; the
dapp-selected network should remain unchanged. The kit's `onChange` API does
not currently provide an unsubscribe function, so subscribe each module at
most once and ignore events from modules that are no longer selected.

## Supported network

**Mainnet (PUBNET) only.** Passing a testnet or futurenet `networkPassphrase` to any signing method will throw an error.

## Unsupported options

The `submit` and `submitUrl` options on `signTransaction` are **not supported** and will throw if provided. The adapter only signs transactions — submission is the dapp's responsibility.

## Events

```typescript
adapter.on('connect', (address: string) => {});
adapter.on('disconnect', () => {});
adapter.on('accountsChanged', (address: string) => {});
adapter.on('networkChanged', ({ network, networkPassphrase }) => {});
```

## API

### `MetaMaskStellarAdapter`

| Method                                         | Description                                 |
| ---------------------------------------------- | ------------------------------------------- |
| `requestAccess()`                              | Connect and get the user's Stellar address  |
| `disconnect()`                                 | Revoke the session                          |
| `getAddress()`                                 | Get the current address (must be connected) |
| `getNetwork()`                                 | Get the current network name and passphrase |
| `isAllowed()`                                  | Check if a session exists                   |
| `isConnected()`                                | Check local connection state                |
| `signTransaction(xdr, opts?)`                  | Sign a transaction envelope XDR             |
| `signAuthEntry(authEntry, opts?)`              | Sign a Soroban authorization entry          |
| `signMessage(message, opts?)`                  | Sign an arbitrary UTF-8 message             |
| `on(event, listener)`                          | Subscribe to an event                       |
| `off(event, listener)`                         | Unsubscribe from an event                   |
| `MetaMaskStellarAdapter.isMetaMaskAvailable()` | Check if MetaMask is installed              |

### `MetaMaskModule`

Stellar Wallets Kit-compatible wrapper. Exposes `getAddress`, `signTransaction`, `signAuthEntry`, `signMessage`, `getNetwork`, `disconnect`, and `onChange`.

## License

ISC
