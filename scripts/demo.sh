#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
  echo ""
  echo "  ❌ No API key found."
  echo ""
  echo "  Set one of these environment variables:"
  echo "    export ANTHROPIC_API_KEY=sk-ant-..."
  echo "    export OPENAI_API_KEY=sk-..."
  echo ""
  exit 1
fi

PROVIDER="anthropic"
if [ -z "$ANTHROPIC_API_KEY" ] && [ -n "$OPENAI_API_KEY" ]; then
  PROVIDER="openai"
fi

echo ""
echo "  🎙️  murmur demo"
echo ""

if [ ! -d "$ROOT_DIR/example/node_modules" ]; then
  echo "  Installing example app dependencies..."
  cd "$ROOT_DIR/example" && npm install --silent
fi

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "  Installing murmur dependencies..."
  cd "$ROOT_DIR" && npm install --silent
fi

cleanup() {
  if [ -n "$EXAMPLE_PID" ]; then
    kill "$EXAMPLE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "  Starting example app on port 3000..."
cd "$ROOT_DIR/example" && npx vite --port 3000 --strictPort &
EXAMPLE_PID=$!

sleep 3

echo ""
cd "$ROOT_DIR" && npx tsx src/index.ts http://localhost:3000 --port 4444 --root "$ROOT_DIR/example" --provider "$PROVIDER"
