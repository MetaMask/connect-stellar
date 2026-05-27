# Socket Security (supply-chain review)

This repo pins dev tooling to avoid Socket **network access** false positives from npm-cli stacks introduced by newer transitive versions:

- `@lavamoat/allow-scripts@3.3.2` (not `3.4.x` → avoids `glob@13` via `@npmcli/package-json`)
- `node-gyp@11.2.0` via Yarn `resolutions` (not `12.x` → avoids `undici@6`)

If Socket still blocks after a lockfile regen, prefer restoring these pins before using PR ignores.

If a pin is not possible and the alert is a known false positive for MetaMask dev tooling, post **one PR comment** (first line must be the command; contributor only):

```
@SocketSecurity ignore npm/glob@13.0.6 npm/undici@6.26.0
```

**Review notes (copy into PR if ignoring):**

- `npm/glob@13.x` — transitive via `@lavamoat/allow-scripts` → `@npmcli/package-json` (npm metadata/git helpers). Dev-only; lifecycle scripts disabled via LavaMoat. No runtime use in published `@metamask/connect-stellar` bundle.
- `npm/undici@6.x` — transitive via `node-gyp` (native build tooling under dev deps). Dev-only; not shipped in package `files` (`dist/` only).

Do **not** use `@SocketSecurity ignore-all`.
