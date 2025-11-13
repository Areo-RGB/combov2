#!/bin/bash

# Setup script for Local Lobby with BLE Plugin
# This script initializes the Android project with the BleSignaling plugin

set -e

echo "🚀 Setting up Local Lobby with BLE Plugin..."
echo ""

# Step 1: Build the web app
echo "📦 Step 1/5: Building web app..."
pnpm build
echo "✅ Web app built"
echo ""

# Step 2: Initialize Capacitor (if not already done)
echo "🔧 Step 2/5: Initializing Capacitor..."
if [ ! -d "android" ]; then
    npx cap add android
    echo "✅ Android platform added"
else
    echo "✅ Android platform already exists"
fi
echo ""

# Step 3: Copy BLE plugin files to Android project
echo "📋 Step 3/5: Copying BLE plugin files..."

# Create plugin directory if it doesn't exist
mkdir -p android/app/src/main/java/com/motionsignal/app/

# Copy BleSignalingPlugin.java
if [ -f "./app/src/main/java/com/motionsignal/app/BleSignalingPlugin.java" ]; then
    cp ./app/src/main/java/com/motionsignal/app/BleSignalingPlugin.java \
       android/app/src/main/java/com/motionsignal/app/
    echo "✅ BleSignalingPlugin.java copied"
else
    echo "⚠️  Warning: BleSignalingPlugin.java not found in ./app/"
fi

# Copy MainActivity.java (if custom)
if [ -f "./app/src/main/java/com/motionsignal/app/MainActivity.java" ]; then
    cp ./app/src/main/java/com/motionsignal/app/MainActivity.java \
       android/app/src/main/java/com/motionsignal/app/
    echo "✅ MainActivity.java copied"
fi

# Copy AndroidManifest.xml with BLE permissions
if [ -f "./app/src/main/AndroidManifest.xml" ]; then
    cp ./app/src/main/AndroidManifest.xml \
       android/app/src/main/
    echo "✅ AndroidManifest.xml copied with BLE permissions"
else
    echo "⚠️  Warning: Custom AndroidManifest.xml not found"
fi
echo ""

# Step 4: Sync Capacitor
echo "🔄 Step 4/5: Syncing Capacitor..."
npx cap sync android
echo "✅ Capacitor synced"
echo ""

# Step 5: Make gradlew executable
echo "🔧 Step 5/5: Setting up Gradle..."
if [ -f "android/gradlew" ]; then
    chmod +x android/gradlew
    echo "✅ Gradle wrapper is executable"
fi
echo ""

echo "✨ Setup complete!"
echo ""
echo "📱 Next steps:"
echo "1. Build the APK: cd android && ./gradlew assembleDebug"
echo "2. Or open in Android Studio: npx cap open android"
echo ""
echo "📍 APK will be at: android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
