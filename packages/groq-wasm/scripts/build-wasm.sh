#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
RUST_DIR="$PACKAGE_DIR/rust"
WASM_DIR="$PACKAGE_DIR/wasm"

echo "Building WASM from Rust sources..."

# Check for wasm-pack
if ! command -v wasm-pack &> /dev/null; then
    echo "Error: wasm-pack is not installed."
    echo "Install it with: cargo install wasm-pack"
    echo "Or via npm: npm install -g wasm-pack"
    exit 1
fi

# Build WASM
cd "$RUST_DIR"
wasm-pack build --target nodejs --out-dir "$WASM_DIR" --release

# Clean up unnecessary files
rm -f "$WASM_DIR/.gitignore"
rm -f "$WASM_DIR/package.json"  # We use our own package.json
rm -f "$WASM_DIR/README.md"

# Rename .js to .cjs for ESM compatibility
# The --target nodejs generates CJS files, but our package uses "type": "module"
# Note: --target nodejs only generates groq_wasm.js (no _bg.js like bundler target)
mv "$WASM_DIR/groq_wasm.js" "$WASM_DIR/groq_wasm.cjs"

echo "WASM build complete! Output in $WASM_DIR"
