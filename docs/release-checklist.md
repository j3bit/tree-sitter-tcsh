# Stable 0.1.0 Release Checklist

This checklist is the operator procedure for the first stable C-only release.
The repository workflows verify and package an artifact; they do not publish to
npm automatically.

## Pinned inputs

- Package and tag version: `0.1.0` / `v0.1.0`
- Tree-sitter CLI and C runtime: `0.26.8`
- Tree-sitter runtime commit:
  `cd5b087cd9f45ca6d93ab1954f6b7c8534f324d2`
- tcsh reference tag: `TCSH6_24_16`
- tcsh reference commit: `f773aba56aa128a38712987b1b8bdbc393d1e4d0`
- Declared platforms: Linux/GCC and macOS/Clang
- Distribution: C library, canonical C header, pkg-config metadata, and editor
  queries; no Node `require()` API

## One-time repository settings

- Protect the release branch and require all release CI jobs:
  `Release gate (ubuntu-latest)`, `Release gate (macos-latest)`, and
  `Pinned tcsh samples`.
- Confirm the npm package name and maintainer access before creating the tag:

  ```sh
  npm view tree-sitter-tcsh name version maintainers
  npm whoami
  ```

- Configure registry credentials, provenance, and any environment approval in a
  separate reviewed change before enabling real publication. The committed tag
  workflow intentionally contains only `npm publish --dry-run`.

## Pre-tag validation

Start from the intended release commit with the pinned Tree-sitter runtime
installed and discoverable through pkg-config. Use an absolute path to a clean
tcsh checkout at the pinned commit.

```sh
git status --short
git rev-parse HEAD
node_modules/.bin/tree-sitter --version
pkg-config --modversion tree-sitter
npm ci
npm run check
npm run check:release
npm run check:upstream -- --upstream-root /absolute/path/to/tcsh-6.24.16
node scripts/check-release-metadata.js --tag v0.1.0
npm publish --dry-run --cache /tmp/tree-sitter-tcsh-npm-cache
git diff --check
git status --short
```

Expected results:

- Tree-sitter CLI and runtime report `0.26.8`.
- All corpus, scanner, query, recovery, stress, included-range, and installed C
  consumer checks pass.
- The coverage matrix reports zero `implemented` rows and only documented
  runtime-only exclusions.
- The upstream audit reports 9 of 9 files clean with no unexpected `ERROR` or
  `MISSING` nodes.
- The npm dry run contains the parser, scanner, C build/install metadata,
  canonical header, queries, license, README, and consumer documentation. It
  contains no tests, caches, Node build metadata, temporary files, or local plan
  documents.
- Both `git status --short` invocations are empty.

## Tag verification

1. Push the release commit and wait for all required CI jobs to pass.
2. Create and push the annotated tag only from that verified commit:

   ```sh
   git tag -a v0.1.0 -m "tree-sitter-tcsh 0.1.0"
   git push origin v0.1.0
   ```

3. Wait for the `Release verification` workflow.
4. Download `tree-sitter-tcsh-v0.1.0` and confirm it contains one
   `tree-sitter-tcsh-0.1.0.tgz` artifact.
5. Compare the artifact contents with the workflow log and retain the successful
   run URL with the release record.

## Manual publication decision

Publication requires explicit maintainer approval after artifact inspection.
When credentials and provenance policy are configured, publish the exact
downloaded tarball rather than rebuilding from a different checkout:

```sh
npm publish tree-sitter-tcsh-0.1.0.tgz
```

After publication, install the registry artifact into a clean temporary prefix,
compile a C consumer through `pkg-config tree-sitter-tcsh`, and record the npm
package URL and verification result in the GitHub release notes.
