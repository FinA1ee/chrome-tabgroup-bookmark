#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')).version")"
OUT="dist/chrome-tabgroup-bookmark-${VERSION}.zip"

rm -rf dist
mkdir -p dist

zip -q -r "$OUT" \
  manifest.json \
  background.js \
  popup.html \
  popup.css \
  popup.js \
  lib.js \
  i18n.js \
  icons \
  _locales \
  PRIVACY.md

shasum -a 256 "$OUT"
