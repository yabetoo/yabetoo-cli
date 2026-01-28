#!/usr/bin/env bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Usage
usage() {
  echo "Usage: $0 <major|minor|patch> [--dry-run]"
  echo ""
  echo "Arguments:"
  echo "  major     Increment major version (1.0.0 -> 2.0.0)"
  echo "  minor     Increment minor version (1.0.0 -> 1.1.0)"
  echo "  patch     Increment patch version (1.0.0 -> 1.0.1)"
  echo ""
  echo "Options:"
  echo "  --dry-run  Show what would happen without making changes"
  exit 1
}

# Check arguments
if [ -z "$1" ]; then
  usage
fi

BUMP_TYPE=$1
DRY_RUN=false

if [ "$2" = "--dry-run" ]; then
  DRY_RUN=true
fi

# Validate bump type
if [[ ! "$BUMP_TYPE" =~ ^(major|minor|patch)$ ]]; then
  echo -e "${RED}Error: Invalid bump type '$BUMP_TYPE'${NC}"
  usage
fi

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}Error: You have uncommitted changes. Please commit or stash them first.${NC}"
  exit 1
fi

# Check we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo -e "${YELLOW}Warning: You're not on 'main' branch (current: $CURRENT_BRANCH)${NC}"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")

if [ -z "$CURRENT_VERSION" ]; then
  echo -e "${RED}Error: Could not read version from package.json${NC}"
  exit 1
fi

# Parse version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Increment version
case $BUMP_TYPE in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
TAG_NAME="v$NEW_VERSION"

echo ""
echo -e "Current version: ${YELLOW}$CURRENT_VERSION${NC}"
echo -e "New version:     ${GREEN}$NEW_VERSION${NC}"
echo -e "Tag:             ${GREEN}$TAG_NAME${NC}"
echo ""

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}[DRY RUN] No changes made${NC}"
  exit 0
fi

# Confirm
read -p "Proceed with release? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

# Update package.json
echo -e "${GREEN}Updating package.json...${NC}"
node -e "
const fs = require('fs');
const pkg = require('./package.json');
pkg.version = '$NEW_VERSION';
fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Commit version bump
echo -e "${GREEN}Committing version bump...${NC}"
git add package.json
git commit -m "chore(release): bump version to $NEW_VERSION"

# Create tag
echo -e "${GREEN}Creating tag $TAG_NAME...${NC}"
git tag -a "$TAG_NAME" -m "Release $TAG_NAME"

echo ""
echo -e "${GREEN}Release $TAG_NAME created successfully!${NC}"
echo ""
echo "Next steps:"
echo "  1. Push the commit:  git push"
echo "  2. Push the tag:     git push origin $TAG_NAME"
echo ""
echo "Or push both at once:"
echo "  git push && git push origin $TAG_NAME"
