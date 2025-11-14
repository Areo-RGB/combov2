#!/bin/bash

# Script to restore the Angular version of the app

echo "🔄 Restoring Angular project configuration..."
echo ""

if [ ! -f "package.json.angular.backup" ]; then
  echo "❌ Error: No Angular backup found. Cannot restore."
  echo "The Angular configuration may not have been backed up."
  exit 1
fi

echo "📝 Restoring configuration files..."

# Restore Angular configuration files
cp package.json.angular.backup package.json
echo "✓ Restored package.json"

if [ -f "tsconfig.json.angular.backup" ]; then
  cp tsconfig.json.angular.backup tsconfig.json
  echo "✓ Restored tsconfig.json"
fi

if [ -f "tailwind.config.ts.angular.backup" ]; then
  cp tailwind.config.ts.angular.backup tailwind.config.ts
  echo "✓ Restored tailwind.config.ts"
fi

if [ -f "tailwind.config.js.angular.backup" ]; then
  cp tailwind.config.js.angular.backup tailwind.config.js
  echo "✓ Restored tailwind.config.js"
fi

if [ -f "postcss.config.js.angular.backup" ]; then
  cp postcss.config.js.angular.backup postcss.config.js
  echo "✓ Restored postcss.config.js"
fi

if [ -f "postcss.config.mjs.angular.backup" ]; then
  cp postcss.config.mjs.angular.backup postcss.config.mjs
  echo "✓ Restored postcss.config.mjs"
fi

echo ""
echo "📦 Installing Angular dependencies..."
pnpm install

echo ""
echo "✅ Angular project restored!"
echo ""
echo "Next steps:"
echo "  1. Start development: pnpm dev"
echo "  2. Build for production: pnpm build"
echo ""
echo "To switch back to Next.js, run: ./setup-nextjs.sh"
