# Releasing CoolModFiles

This document describes how to cut a tagged release. Releases are
triggered by pushing an annotated, GPG-signed `vX.Y.Z` tag to `main`,
which fires the `Release` workflow (`.github/workflows/release.yml`).

The workflow:

1. Verifies that `package.json` `"version"` matches the tag.
2. Runs `make verify` (lint + typecheck + audit + build).
3. Builds and pushes a multi-arch (`linux/amd64`, `linux/arm64`) image
   to `ghcr.io/no42-org/coolmodfiles`.
4. Signs the image (and its per-platform child manifests) with cosign
   keyless OIDC.
5. Creates a draft GitHub release with auto-generated notes.

The release notes draft is then curated by hand and published.

---

## Versioning

We use [SemVer](https://semver.org). Tags are formatted `vX.Y.Z` (no
pre-release or build metadata).

Three places carry the version. Two are derived from the tag at build
time; one is committed in the source tree and **must be bumped manually
before tagging**:

| Source                          | How it's set                                | Authoritative? |
| ------------------------------- | ------------------------------------------- | -------------- |
| Git tag (`vX.Y.Z`)              | `git tag -s` by the releaser                | yes            |
| Container image tags            | `docker/metadata-action` from the git tag   | derived        |
| `APP_VERSION` env in the image  | `--build-arg APP_VERSION=${{ github.ref_name }}` | derived   |
| `package.json` `"version"`      | committed source — **bump before tagging**  | source-of-truth in npm tooling |

The release workflow enforces the alignment with a guard step
("Verify package.json version matches tag"). Pushing a tag whose number
disagrees with `package.json` aborts the release before anything is
built or signed.

---

## Cutting a release

### 1. Confirm `main` is green

```sh
git checkout main
git pull --ff-only
gh run list --branch main --limit 5
```

The latest CI run on `main` must be `success`.

### 2. Bump `package.json`

```sh
# Drops the version into package.json and package-lock.json without
# creating a tag or commit. We commit and tag explicitly below.
npm version X.Y.Z --no-git-tag-version
```

Verify the diff is exactly the two version fields (one in
`package.json`, one in `package-lock.json` at the root `"version"`
key):

```sh
git diff package.json package-lock.json
```

### 3. Commit the bump

Use a `chore(release):` conventional-commit. The commit must include the
`Assisted-by:` trailer if AI tooling was used.

```sh
git add package.json package-lock.json
git commit -m "chore(release): bump version to X.Y.Z"
git push origin main
```

If branch protection requires a PR, open one and merge it before
proceeding to the tag step.

### 4. Create the signed tag

The tag must point at the bump commit so the guard step sees the new
version:

```sh
git pull --ff-only
git tag -s vX.Y.Z -m "$(cat <<'EOF'
vX.Y.Z

Highlights:
- <one bullet per notable change>
EOF
)"
git tag -v vX.Y.Z   # confirm signature
```

The tag must be GPG-signed (`-s`). Lightweight or unsigned tags will
not be accepted by downstream consumers that pin on the cosign identity
plus a verified tag.

### 5. Push the tag

```sh
git push origin vX.Y.Z
```

This kicks off the `Release` workflow. Watch it:

```sh
gh run watch --workflow release.yml --exit-status
```

If the version-guard step fails: the tag is on the wrong commit (a
commit that does not have the bumped `package.json`). Delete the
local and remote tag, fix the commit history, re-tag.

```sh
git push origin --delete vX.Y.Z
git tag -d vX.Y.Z
```

### 6. Curate and publish the release notes

The workflow leaves a **draft** GitHub release with auto-generated
notes. Edit it to a curated summary (see `v0.4.0` for shape: highlights
on top, then sections for Supply chain, Security, Dependencies, Chore,
and a Container image block).

```sh
gh release edit vX.Y.Z --notes-file path/to/notes.md --draft=false --latest
```

### 7. Verify the published image

```sh
cosign verify ghcr.io/no42-org/coolmodfiles:vX.Y.Z \
  --certificate-identity-regexp '^https://github\.com/no42-org/CoolModFiles/\.github/workflows/release\.yml@refs/tags/v.*$' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

A successful verification returns one or more signature payloads and
prints "The cosign claims were validated".

---

## Hot-fix releases (`vX.Y.Z+1`)

Same procedure, branched off the affected tag rather than `main`:

```sh
git checkout -b hotfix/X.Y.(Z+1) vX.Y.Z
# ...fix...
npm version X.Y.(Z+1) --no-git-tag-version
git commit -am "chore(release): bump version to X.Y.(Z+1)"
# Open a PR back to main, get it merged, then tag the merge commit
# (or the rebased equivalent) and push as in §4–§5 above.
```

Never tag a hot-fix on a branch that isn't reachable from `main` —
downstream `latest` tracking would silently rewind.

---

## Why each step exists

- **Signed tag** — the release identity in the cosign certificate is
  the workflow path, but the artefact a human can locally re-verify is
  the tag. Signing it prevents a stolen GitHub token from publishing a
  release that survives local `git tag -v` checks.
- **`package.json` bump committed before tagging** — the npm-side
  identifier is the only version source that lives in the working tree.
  Without a manual bump, `npm view`, registry mirrors, SBOM tooling,
  and any downstream `package-lock.json` snapshot would all carry a
  stale version even after the release is cut.
- **Guard step in CI** — protects against forgetting step 2. Fails
  fast (before the build) so a malformed release doesn't burn cosign
  signatures or push container tags that have to be torn down.
