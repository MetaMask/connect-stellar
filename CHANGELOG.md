# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- SEP-0043 compliant adapter (`MetaMaskStellarAdapter`) for signing transactions, Soroban auth entries, and messages via MetaMask
- Stellar Wallets Kit integration (`MetaMaskModule`)
- Session management with auto-restore on page reload
- `sessionChanged` event handling for real-time sync with MetaMask
- Exported SEP-0043 primitives (`Scope`, `NETWORK_PASSPHRASE`, `NETWORK_NAME`) for direct multichain API usage

[Unreleased]: https://github.com/MetaMask/connect-stellar/commits/HEAD
