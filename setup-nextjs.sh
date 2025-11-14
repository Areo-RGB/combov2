#!/bin/bash

# Setup script to configure the Next.js version of the app

echo "🚀 Setting up Next.js + React + Capacitor project..."
echo ""

# Backup existing files
echo "📦 Backing up existing configuration files..."
if [ -f "package.json" ]; then
  cp package.json package.json.angular.backup
  echo "✓ Backed up package.json → package.json.angular.backup"
fi

if [ -f "tsconfig.json" ]; then
  cp tsconfig.json tsconfig.json.angular.backup
  echo "✓ Backed up tsconfig.json → tsconfig.json.angular.backup"
fi

if [ -f "tailwind.config.ts" ] || [ -f "tailwind.config.js" ]; then
  [ -f "tailwind.config.ts" ] && cp tailwind.config.ts tailwind.config.ts.angular.backup
  [ -f "tailwind.config.js" ] && cp tailwind.config.js tailwind.config.js.angular.backup
  echo "✓ Backed up tailwind config"
fi

if [ -f "postcss.config.js" ] || [ -f "postcss.config.mjs" ]; then
  [ -f "postcss.config.js" ] && cp postcss.config.js postcss.config.js.angular.backup
  [ -f "postcss.config.mjs" ] && cp postcss.config.mjs postcss.config.mjs.angular.backup
  echo "✓ Backed up postcss config"
fi

echo ""
echo "📝 Setting up Next.js configuration files..."

# Copy Next.js configuration files
cp next-package.json package.json
echo "✓ Copied next-package.json → package.json"

cp tsconfig.next.json tsconfig.json
echo "✓ Copied tsconfig.next.json → tsconfig.json"

cp tailwind.next.config.ts tailwind.config.ts
echo "✓ Copied tailwind.next.config.ts → tailwind.config.ts"

cp postcss.next.config.mjs postcss.config.mjs
echo "✓ Copied postcss.next.config.mjs → postcss.config.mjs"

cp .gitignore.next .gitignore
echo "✓ Copied .gitignore.next → .gitignore"

echo ""
echo "📦 Installing dependencies..."
pnpm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start development: pnpm dev"
echo "  2. Build for production: pnpm build"
echo "  3. For Android: pnpm build:android"
echo ""
echo "📖 Read NEXTJS-README.md for full documentation"
echo ""
echo "To restore Angular version, run: ./restore-angular.sh"
