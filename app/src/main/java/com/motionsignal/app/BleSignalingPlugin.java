package com.motionsignal.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.ParcelUuid;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@CapacitorPlugin(name = "BleSignaling")
public class BleSignalingPlugin extends Plugin {
    private static final String TAG = "BleSignalingPlugin";
    private BluetoothLeAdvertiser advertiser;
    private BluetoothGattServer gattServer;
    private BluetoothDevice connectedDevice;
    private AdvertiseCallback advertiseCallback;

    private UUID serviceUuid;
    private UUID rxUuid;
    private UUID txUuid;

    private BluetoothGattCharacteristic rxChar;
    private BluetoothGattCharacteristic txChar;

    @PluginMethod
    public void startAdvertising(PluginCall call) {
        Log.d(TAG, "startAdvertising called");

        String name = call.getString("name");
        String sessionId = call.getString("sessionId");
        String serviceId = call.getString("serviceId");
        String rxId = call.getString("rxId");
        String txId = call.getString("txId");

        if (serviceId == null || rxId == null || txId == null) {
            Log.e(TAG, "Missing UUIDs");
            call.reject("Missing UUIDs");
            return;
        }

        try {
            this.serviceUuid = UUID.fromString(serviceId);
            this.rxUuid = UUID.fromString(rxId);
            this.txUuid = UUID.fromString(txId);
        } catch (IllegalArgumentException e) {
            Log.e(TAG, "Invalid UUID format: " + e.getMessage());
            call.reject("Invalid UUID format: " + e.getMessage());
            return;
        }

        // Check runtime permissions (Android 12+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_ADVERTISE) != PackageManager.PERMISSION_GRANTED) {
                Log.e(TAG, "Missing BLUETOOTH_ADVERTISE permission");
                call.reject("Missing BLUETOOTH_ADVERTISE permission");
                return;
            }
            if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                Log.e(TAG, "Missing BLUETOOTH_CONNECT permission");
                call.reject("Missing BLUETOOTH_CONNECT permission");
                return;
            }
        }

        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        if (manager == null) {
            Log.e(TAG, "BluetoothManager is null");
            call.reject("BluetoothManager not available");
            return;
        }

        BluetoothAdapter adapter = manager.getAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            Log.e(TAG, "Bluetooth not available or not enabled");
            call.reject("Bluetooth not available/enabled");
            return;
        }

        // Set device name
        String deviceName = name != null ? name : ("Motion-" + (sessionId != null ? sessionId : "Device"));
        try {
            adapter.setName(deviceName);
            Log.d(TAG, "Device name set to: " + deviceName);
        } catch (SecurityException e) {
            Log.w(TAG, "Could not set device name: " + e.getMessage());
        }

        // Create GATT server
        Log.d(TAG, "Creating GATT server...");
        gattServer = manager.openGattServer(getContext(), new BluetoothGattServerCallback() {
            @Override
            public void onConnectionStateChange(BluetoothDevice device, int status, int newState) {
                super.onConnectionStateChange(device, status, newState);
                if (newState == BluetoothGatt.STATE_CONNECTED) {
                    Log.d(TAG, "GATT Client connected: " + device.getAddress());
                    connectedDevice = device;

                    JSObject event = new JSObject();
                    event.put("connected", true);
                    event.put("deviceAddress", device.getAddress());
                    notifyListeners("connectionStateChange", event);
                } else if (newState == BluetoothGatt.STATE_DISCONNECTED) {
                    Log.d(TAG, "GATT Client disconnected: " + (device != null ? device.getAddress() : "unknown"));
                    connectedDevice = null;

                    JSObject event = new JSObject();
                    event.put("connected", false);
                    notifyListeners("connectionStateChange", event);
                }
            }

            @Override
            public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId,
                    BluetoothGattCharacteristic characteristic, boolean preparedWrite,
                    boolean responseNeeded, int offset, byte[] value) {
                super.onCharacteristicWriteRequest(device, requestId, characteristic, preparedWrite, responseNeeded, offset, value);

                Log.d(TAG, "onCharacteristicWriteRequest: " + characteristic.getUuid() +
                      ", length: " + (value != null ? value.length : 0));

                if (rxChar != null && characteristic.getUuid().equals(rxUuid) && value != null) {
                    JSObject payload = new JSObject();
                    List<Integer> arr = new ArrayList<>();
                    for (byte b : value) {
                        arr.add((int) (b & 0xFF));
                    }
                    payload.put("value", new JSArray(arr));
                    notifyListeners("rxWritten", payload);
                    Log.d(TAG, "Notified rxWritten with " + value.length + " bytes");
                }

                if (responseNeeded && gattServer != null) {
                    gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value);
                    Log.d(TAG, "Sent GATT response");
                }
            }

            @Override
            public void onDescriptorWriteRequest(BluetoothDevice device, int requestId,
                    BluetoothGattDescriptor descriptor, boolean preparedWrite,
                    boolean responseNeeded, int offset, byte[] value) {
                super.onDescriptorWriteRequest(device, requestId, descriptor, preparedWrite, responseNeeded, offset, value);

                Log.d(TAG, "onDescriptorWriteRequest: " + descriptor.getUuid() +
                      ", value: " + (value != null ? Arrays.toString(value) : "null"));

                // Handle CCCD (Client Characteristic Configuration Descriptor) writes
                // This enables/disables notifications
                if (responseNeeded && gattServer != null) {
                    gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value);
                    Log.d(TAG, "Sent descriptor write response");
                }
            }

            @Override
            public void onServiceAdded(int status, BluetoothGattService service) {
                super.onServiceAdded(status, service);
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    Log.d(TAG, "GATT Service added successfully: " + service.getUuid());
                } else {
                    Log.e(TAG, "Failed to add GATT service, status: " + status);
                }
            }
        });

        if (gattServer == null) {
            Log.e(TAG, "Failed to create GATT server");
            call.reject("Failed to create GATT server");
            return;
        }

        // Create GATT service with characteristics
        Log.d(TAG, "Creating GATT service with UUID: " + serviceUuid);
        BluetoothGattService service = new BluetoothGattService(serviceUuid, BluetoothGattService.SERVICE_TYPE_PRIMARY);

        // RX characteristic (client writes to this)
        rxChar = new BluetoothGattCharacteristic(
                rxUuid,
                BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
                BluetoothGattCharacteristic.PERMISSION_WRITE
        );
        Log.d(TAG, "Created RX characteristic: " + rxUuid);

        // TX characteristic (server notifies on this)
        txChar = new BluetoothGattCharacteristic(
                txUuid,
                BluetoothGattCharacteristic.PROPERTY_READ | BluetoothGattCharacteristic.PROPERTY_NOTIFY,
                BluetoothGattCharacteristic.PERMISSION_READ
        );

        // Add CCCD descriptor to TX characteristic (required for notifications)
        UUID cccdUuid = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
        BluetoothGattDescriptor cccd = new BluetoothGattDescriptor(
                cccdUuid,
                BluetoothGattDescriptor.PERMISSION_READ | BluetoothGattDescriptor.PERMISSION_WRITE
        );
        txChar.addDescriptor(cccd);
        Log.d(TAG, "Created TX characteristic with CCCD: " + txUuid);

        service.addCharacteristic(rxChar);
        service.addCharacteristic(txChar);

        boolean serviceAdded = gattServer.addService(service);
        if (!serviceAdded) {
            Log.e(TAG, "Failed to add service to GATT server");
            call.reject("Failed to add service to GATT server");
            gattServer.close();
            gattServer = null;
            return;
        }
        Log.d(TAG, "Service added to GATT server");

        // Start BLE advertising
        advertiser = adapter.getBluetoothLeAdvertiser();
        if (advertiser == null) {
            Log.e(TAG, "BLE Advertiser not available on this device");
            call.reject("Advertiser not available");
            gattServer.close();
            gattServer = null;
            return;
        }

        AdvertiseSettings settings = new AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(true)
                .setTimeout(0) // Advertise indefinitely
                .build();

        AdvertiseData data = new AdvertiseData.Builder()
                .setIncludeDeviceName(true)
                .addServiceUuid(new ParcelUuid(serviceUuid))
                .setIncludeTxPowerLevel(false)
                .build();

        // Create callback with proper error handling
        advertiseCallback = new AdvertiseCallback() {
            @Override
            public void onStartSuccess(AdvertiseSettings settingsInEffect) {
                super.onStartSuccess(settingsInEffect);
                Log.d(TAG, "✅ BLE Advertising started successfully!");
                Log.d(TAG, "   Device name: " + deviceName);
                Log.d(TAG, "   Service UUID: " + serviceUuid);
                Log.d(TAG, "   Mode: " + settingsInEffect.getMode());
                Log.d(TAG, "   TX Power: " + settingsInEffect.getTxPowerLevel());

                JSObject result = new JSObject();
                result.put("success", true);
                result.put("deviceName", deviceName);
                result.put("serviceUuid", serviceUuid.toString());
                call.resolve(result);
            }

            @Override
            public void onStartFailure(int errorCode) {
                super.onStartFailure(errorCode);
                String errorMsg = "Unknown error";
                switch (errorCode) {
                    case ADVERTISE_FAILED_DATA_TOO_LARGE:
                        errorMsg = "Data too large";
                        break;
                    case ADVERTISE_FAILED_TOO_MANY_ADVERTISERS:
                        errorMsg = "Too many advertisers";
                        break;
                    case ADVERTISE_FAILED_ALREADY_STARTED:
                        errorMsg = "Already started";
                        break;
                    case ADVERTISE_FAILED_INTERNAL_ERROR:
                        errorMsg = "Internal error";
                        break;
                    case ADVERTISE_FAILED_FEATURE_UNSUPPORTED:
                        errorMsg = "Feature unsupported";
                        break;
                }
                Log.e(TAG, "❌ BLE Advertising failed: " + errorMsg + " (code: " + errorCode + ")");
                call.reject("Advertising failed: " + errorMsg);

                // Cleanup
                if (gattServer != null) {
                    gattServer.close();
                    gattServer = null;
                }
            }
        };

        Log.d(TAG, "Starting BLE advertising...");
        try {
            advertiser.startAdvertising(settings, data, advertiseCallback);
        } catch (SecurityException e) {
            Log.e(TAG, "SecurityException starting advertising: " + e.getMessage());
            call.reject("Permission denied: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Exception starting advertising: " + e.getMessage());
            call.reject("Failed to start advertising: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopAdvertising(PluginCall call) {
        Log.d(TAG, "stopAdvertising called");

        if (advertiser != null && advertiseCallback != null) {
            try {
                advertiser.stopAdvertising(advertiseCallback);
                Log.d(TAG, "Advertising stopped");
            } catch (Exception e) {
                Log.e(TAG, "Error stopping advertising: " + e.getMessage());
            }
            advertiser = null;
            advertiseCallback = null;
        }

        if (gattServer != null) {
            try {
                gattServer.close();
                Log.d(TAG, "GATT server closed");
            } catch (Exception e) {
                Log.e(TAG, "Error closing GATT server: " + e.getMessage());
            }
            gattServer = null;
        }

        connectedDevice = null;
        call.resolve();
    }

    @PluginMethod
    public void notifyTx(PluginCall call) {
        if (gattServer == null || txChar == null) {
            Log.e(TAG, "notifyTx: GATT server or TX characteristic is null");
            call.reject("No GATT server");
            return;
        }

        if (connectedDevice == null) {
            Log.e(TAG, "notifyTx: No connected device");
            call.reject("No connection");
            return;
        }

        JSArray arr = call.getArray("value");
        if (arr == null) {
            Log.e(TAG, "notifyTx: Missing value");
            call.reject("Missing value");
            return;
        }

        try {
            byte[] bytes = new byte[arr.length()];
            for (int i = 0; i < arr.length(); i++) {
                bytes[i] = (byte) (arr.getInt(i) & 0xFF);
            }

            txChar.setValue(bytes);
            boolean success = gattServer.notifyCharacteristicChanged(connectedDevice, txChar, false);

            if (success) {
                Log.d(TAG, "Notification sent: " + bytes.length + " bytes to " + connectedDevice.getAddress());
                call.resolve();
            } else {
                Log.e(TAG, "Failed to send notification");
                call.reject("Failed to send notification");
            }
        } catch (Exception e) {
            Log.e(TAG, "Exception in notifyTx: " + e.getMessage());
            call.reject("Error: " + e.getMessage());
        }
    }
}

