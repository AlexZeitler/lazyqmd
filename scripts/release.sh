#!/usr/bin/env bash
set -euo pipefail

# Read version from package.json
VERSION=$(bun -e "console.log(require('./package.json').version)")

if [ -z "$VERSION" ]; then
  echo "Error: Could not read version from package.json"
  exit 1
fi

TAG="v${VERSION}"

# Check if tag already exists
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: Tag $TAG already exists"
  exit 1
fi

# Check for uncommitted changes (ignore untracked files)
if [ -n "$(git diff --stat HEAD)" ]; then
  echo "Error: Uncommitted changes. Commit first."
  exit 1
fi

# Extract changelog section for this version
NOTES=$(awk "/^## \[${VERSION}\]/{found=1; next} /^## \[/{if(found) exit} found" CHANGELOG.md)

if [ -z "$NOTES" ]; then
  echo "Error: No CHANGELOG.md entry found for version ${VERSION}"
  exit 1
fi

echo "Releasing lazyqmd $TAG"
echo ""
echo "Changelog:"
echo "$NOTES"
echo ""

read -p "Continue? [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

# Create annotated tag
git tag -a "$TAG" -m "Release $TAG"

# Push commit and tag
git push && git push --tags

# Create GitHub release with changelog as body
gh release create "$TAG" --title "$TAG" --notes "$NOTES"

# Publish to npm
npm publish --access public

echo ""
echo "Released lazyqmd $TAG"
