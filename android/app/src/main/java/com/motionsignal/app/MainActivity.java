package com.motionsignal.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BleSignalingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
