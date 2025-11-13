#!/bin/bash

# Verification script for BLE Plugin setup
# Checks if all required files and permissions are in place

echo "🔍 Verifying BLE Plugin Setup..."
echo ""

ERRORS=0
WARNINGS=0

# Check 1: Android platform exists
echo "📱 Checking Android platform..."
if [ -d "android" ]; then
    echo "✅ Android platform exists"
else
    echo "❌ Android platform not found - run: npx cap add android"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Check 2: BleSignalingPlugin.java exists
echo "🔌 Checking BleSignalingPlugin.java..."
if [ -f "android/app/src/main/java/com/motionsignal/app/BleSignalingPlugin.java" ]; then
    echo "✅ BleSignalingPlugin.java found"

    # Check if it has required methods
    if grep -q "startAdvertising" android/app/src/main/java/com/motionsignal/app/BleSignalingPlugin.java && \
       grep -q "notifyTx" android/app/src/main/java/com/motionsignal/app/BleSignalingPlugin.java && \
       grep -q "@CapacitorPlugin" android/app/src/main/java/com/motionsignal/app/BleSignalingPlugin.java; then
        echo "✅ Plugin has required methods and annotations"
    else
        echo "⚠️  Warning: Plugin might be incomplete"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "❌ BleSignalingPlugin.java not found"
    echo "   Expected: android/app/src/main/java/com/motionsignal/app/BleSignalingPlugin.java"

    # Check if source exists
    if [ -f "./app/src/main/java/com/motionsignal/app/BleSignalingPlugin.java" ]; then
        echo "   Found source at: ./app/src/main/java/com/motionsignal/app/BleSignalingPlugin.java"
        echo "   Run: ./setup-lobby.sh to copy it"
    fi
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Check 3: AndroidManifest.xml has BLE permissions
echo "📜 Checking AndroidManifest.xml permissions..."
if [ -f "android/app/src/main/AndroidManifest.xml" ]; then
    MANIFEST="android/app/src/main/AndroidManifest.xml"

    PERMS_OK=true

    # Check Android 12+ permissions
    if grep -q "BLUETOOTH_SCAN" "$MANIFEST"; then
        echo "✅ BLUETOOTH_SCAN permission present"
    else
        echo "❌ Missing BLUETOOTH_SCAN permission"
        PERMS_OK=false
    fi

    if grep -q "BLUETOOTH_CONNECT" "$MANIFEST"; then
        echo "✅ BLUETOOTH_CONNECT permission present"
    else
        echo "❌ Missing BLUETOOTH_CONNECT permission"
        PERMS_OK=false
    fi

    if grep -q "BLUETOOTH_ADVERTISE" "$MANIFEST"; then
        echo "✅ BLUETOOTH_ADVERTISE permission present"
    else
        echo "❌ Missing BLUETOOTH_ADVERTISE permission"
        PERMS_OK=false
    fi

    # Check legacy permissions
    if grep -q "ACCESS_FINE_LOCATION" "$MANIFEST"; then
        echo "✅ ACCESS_FINE_LOCATION permission present (for Android ≤ 11)"
    else
        echo "⚠️  Warning: ACCESS_FINE_LOCATION missing (needed for Android 11 and below)"
        WARNINGS=$((WARNINGS + 1))
    fi

    if [ "$PERMS_OK" = false ]; then
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "❌ AndroidManifest.xml not found"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Check 4: Capacitor config
echo "⚙️  Checking Capacitor configuration..."
if [ -f "capacitor.config.ts" ]; then
    echo "✅ capacitor.config.ts exists"

    if grep -q "appId:" capacitor.config.ts; then
        APP_ID=$(grep "appId:" capacitor.config.ts | sed "s/.*appId: *['\"]\\([^'\"]*\\).*/\\1/")
        echo "   App ID: $APP_ID"
    fi
else
    echo "⚠️  capacitor.config.ts not found"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check 5: TypeScript services
echo "📝 Checking TypeScript services..."
if [ -f "src/services/bluetooth-lobby.service.ts" ]; then
    echo "✅ bluetooth-lobby.service.ts exists"
else
    echo "❌ bluetooth-lobby.service.ts not found"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "src/services/local-lobby.service.ts" ]; then
    echo "✅ local-lobby.service.ts exists"
else
    echo "❌ local-lobby.service.ts not found"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "src/components/lobby-setup/lobby-setup.component.ts" ]; then
    echo "✅ lobby-setup.component.ts exists"
else
    echo "❌ lobby-setup.component.ts not found"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Check 6: Build tools
echo "🔨 Checking build tools..."
if [ -f "android/gradlew" ]; then
    if [ -x "android/gradlew" ]; then
        echo "✅ Gradle wrapper is executable"
    else
        echo "⚠️  Warning: Gradle wrapper exists but is not executable"
        echo "   Run: chmod +x android/gradlew"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "⚠️  Gradle wrapper not found (will be created on first sync)"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✨ All checks passed! Setup looks good."
    echo ""
    echo "📱 Next steps:"
    echo "   1. Run: ./setup-lobby.sh (if not done yet)"
    echo "   2. Build APK: cd android && ./gradlew assembleDebug"
    echo "   3. Install: adb install android/app/build/outputs/apk/debug/app-debug.apk"
elif [ $ERRORS -eq 0 ]; then
    echo "⚠️  Setup complete with $WARNINGS warning(s)"
    echo ""
    echo "The app should work, but you might encounter minor issues."
else
    echo "❌ Found $ERRORS error(s) and $WARNINGS warning(s)"
    echo ""
    echo "🔧 Recommended fixes:"
    if [ ! -d "android" ]; then
        echo "   • Run: npx cap add android"
    fi
    if [ ! -f "android/app/src/main/java/com/motionsignal/app/BleSignalingPlugin.java" ]; then
        echo "   • Run: ./setup-lobby.sh"
    fi
    echo ""
    echo "Then re-run: ./verify-ble-plugin.sh"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exit $ERRORS
