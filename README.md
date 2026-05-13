# MetaMask Connect Stellar

MetaMask adapter for Stellar, implementing the [SEP-0043](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0043.md) wallet interface.

Lets dapps sign Stellar transactions, Soroban auth entries, and arbitrary messages through MetaMask via the multichain API.

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
  networkPassphraseToScope,
} from '@metamask/connect-stellar';
import { getDefaultTransport, getMultichainClient } from '@metamask/multichain-api-client';
import type { StellarRpc } from '@metamask/connect-stellar';

const transport = getDefaultTransport();
const client = getMultichainClient({ transport }).extendsRpcApi<StellarRpc>();

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
