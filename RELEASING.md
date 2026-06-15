# Releasing

`toad-compiler` and `toad-runtime` are published to npm by the
[`release.yml`](.github/workflows/release.yml) workflow, which runs on any
`vX.Y.Z` tag. The `.agent` format is versioned separately in [`SPEC.md`](./SPEC.md).

## One-time setup

The publish step needs an **`NPM_TOKEN`** repository secret — an npm
[granular access token](https://www.npmjs.com/settings) with read/write on
`toad-compiler` and `toad-runtime` (or a classic Automation token, which also
bypasses 2FA in CI).

```bash
# Settings → Secrets and variables → Actions → New repository secret: NPM_TOKEN
printf '%s' "<token>" | gh secret set NPM_TOKEN --repo ZubeidHendricks/toad
```

## Cutting a release

1. **Bump the version** in both packages and the exported constants — keep them in sync:
   - `packages/compiler/package.json` and `packages/runtime/package.json`
   - `COMPILER_VERSION` (compiler `src/index.ts`) and `RUNTIME_VERSION` (runtime `src/index.ts`)
   - their version tests (`src/index.test.ts` in each)
2. If the `.agent` format changed, bump **`SPEC.md`** (header + the §9 self-reference).
3. Add a **`CHANGELOG.md`** section for the version.
4. Make sure the gate is green: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.
5. Commit, then tag and push **the tag** — that's what triggers publishing:
   ```bash
   git commit -am "Release vX.Y.Z"
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin main && git push origin vX.Y.Z
   ```
6. (Optional) cut a GitHub Release: `gh release create vX.Y.Z --title vX.Y.Z --notes "…"`.

`pnpm -r publish` skips any version already on the registry, so re-running a
failed release is safe. If a run fails (e.g. the secret wasn't set yet), fix the
cause and re-run it: `gh run rerun <run-id>`.

## The tag is a snapshot — mind what lands after it

The published artifact is built from **the tagged commit**, not from `main`.
Anything merged to `main` *after* the tag is **unreleased** until the next
version. Don't move a published tag; cut a new version instead. (This is why
features added after `v0.3.0` shipped as `v0.4.0`.)

## Verifying a release

```bash
npm view toad-compiler version   # should equal the tag
npm view toad-runtime version
# smoke test from a clean dir:
mkdir /tmp/toad-smoke && cd /tmp/toad-smoke && npm init -y
npm i toad-compiler@latest toad-runtime@latest
npx toac --version && npx toac cost some.agent
```
