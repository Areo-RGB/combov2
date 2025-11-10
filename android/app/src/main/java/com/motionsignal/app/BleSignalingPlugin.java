package com.motionsignal.app;

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
import android.os.ParcelUuid;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@CapacitorPlugin(name = "BleSignaling")
public class BleSignalingPlugin extends Plugin {
    private BluetoothLeAdvertiser advertiser;
    private BluetoothGattServer gattServer;
    private BluetoothDevice connectedDevice;

    private UUID serviceUuid;
    private UUID rxUuid;
    private UUID txUuid;

    private BluetoothGattCharacteristic rxChar;
    private BluetoothGattCharacteristic txChar;

    @PluginMethod
    public void startAdvertising(PluginCall call) {
        String name = call.getString("name");
        String sessionId = call.getString("sessionId");
        String serviceId = call.getString("serviceId");
        String rxId = call.getString("rxId");
        String txId = call.getString("txId");

        if (serviceId == null || rxId == null || txId == null) {
            call.reject("Missing UUIDs");
            return;
        }
        this.serviceUuid = UUID.fromString(serviceId);
        this.rxUuid = UUID.fromString(rxId);
        this.txUuid = UUID.fromString(txId);

        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager.getAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("Bluetooth not available/enabled");
            return;
        }
        adapter.setName(name != null ? name : ("Motion-" + (sessionId != null ? sessionId : "Device")));

        // GATT server
        gattServer = manager.openGattServer(getContext(), new BluetoothGattServerCallback() {
            @Override
            public void onConnectionStateChange(BluetoothDevice device, int status, int newState) {
                if (newState == BluetoothGatt.STATE_CONNECTED) {
                    connectedDevice = device;
                } else {
                    connectedDevice = null;
                }
            }

            @Override
            public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId, BluetoothGattCharacteristic characteristic, boolean preparedWrite, boolean responseNeeded, int offset, byte[] value) {
                if (rxChar != null && characteristic.getUuid().equals(rxUuid)) {
                    JSObject payload = new JSObject();
                    List<Integer> arr = new ArrayList<>();
                    for (byte b : value) arr.add((int) (b & 0xFF));
                    payload.put("value", new JSArray(arr));
                    notifyListeners("rxWritten", payload);
                }
                if (responseNeeded && gattServer != null) {
                    gattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null);
                }
            }
        });

        BluetoothGattService service = new BluetoothGattService(serviceUuid, BluetoothGattService.SERVICE_TYPE_PRIMARY);

        rxChar = new BluetoothGattCharacteristic(
                rxUuid,
                BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
                BluetoothGattCharacteristic.PERMISSION_WRITE
        );

        txChar = new BluetoothGattCharacteristic(
                txUuid,
                BluetoothGattCharacteristic.PROPERTY_READ | BluetoothGattCharacteristic.PROPERTY_NOTIFY,
                BluetoothGattCharacteristic.PERMISSION_READ
        );
        BluetoothGattDescriptor cccd = new BluetoothGattDescriptor(
                UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"),
                BluetoothGattDescriptor.PERMISSION_READ | BluetoothGattDescriptor.PERMISSION_WRITE
        );
        txChar.addDescriptor(cccd);

        service.addCharacteristic(rxChar);
        service.addCharacteristic(txChar);
        gattServer.addService(service);

        // Advertiser
        advertiser = adapter.getBluetoothLeAdvertiser();
        if (advertiser == null) {
            call.reject("Advertiser not available");
            return;
        }
        AdvertiseSettings settings = new AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(true)
                .build();
        AdvertiseData data = new AdvertiseData.Builder()
                .setIncludeDeviceName(true)
                .addServiceUuid(new ParcelUuid(serviceUuid))
                .build();
        advertiser.startAdvertising(settings, data, new AdvertiseCallback(){});
        call.resolve();
    }

    @PluginMethod
    public void stopAdvertising(PluginCall call) {
        if (advertiser != null) {
            advertiser.stopAdvertising(new AdvertiseCallback(){});
            advertiser = null;
        }
        if (gattServer != null) {
            gattServer.close();
            gattServer = null;
        }
        call.resolve();
    }

    @PluginMethod
    public void notifyTx(PluginCall call) {
        if (gattServer == null || txChar == null || connectedDevice == null) {
            call.reject("No connection");
            return;
        }
        JSArray arr = call.getArray("value");
        if (arr == null) {
            call.reject("Missing value");
            return;
        }
        byte[] bytes = new byte[arr.length()];
        for (int i = 0; i < arr.length(); i++) {
            try {
                bytes[i] = (byte) (arr.getInt(i) & 0xFF);
            } catch (Exception e) {
                bytes[i] = 0;
            }
        }
        txChar.setValue(bytes);
        gattServer.notifyCharacteristicChanged(connectedDevice, txChar, false);
        call.resolve();
    }
}


