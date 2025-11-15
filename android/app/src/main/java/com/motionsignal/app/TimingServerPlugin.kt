package com.motionsignal.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import fi.iki.elonen.NanoHTTPD
import org.json.JSONObject
import java.io.IOException

/**
 * Timing Server Plugin
 *
 * Capacitor plugin that runs an HTTP server using NanoHTTPD to receive
 * timing events from sensor devices over Wi-Fi (local network only).
 */
@CapacitorPlugin(name = "TimingServer")
class TimingServerPlugin : Plugin() {

    private var server: TimingHTTPServer? = null

    /**
     * Start the HTTP server
     */
    @PluginMethod
    fun startServer(call: PluginCall) {
        val port = call.getInt("port", 3000) ?: 3000

        // Stop existing server if running
        server?.let {
            try {
                it.stop()
            } catch (e: Exception) {
                // Ignore errors when stopping
            }
        }

        try {
            server = TimingHTTPServer(port, this)
            server?.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false)

            val result = JSObject()
            result.put("port", port)
            call.resolve(result)
        } catch (e: IOException) {
            call.reject("Failed to start server: ${e.message}", e)
        }
    }

    /**
     * Stop the HTTP server
     */
    @PluginMethod
    fun stopServer(call: PluginCall) {
        server?.let {
            try {
                it.stop()
                server = null
                call.resolve()
            } catch (e: Exception) {
                call.reject("Failed to stop server: ${e.message}", e)
            }
        } ?: call.resolve() // Already stopped
    }

    /**
     * Internal method to notify listeners when a timing event is received
     */
    internal fun notifyTimingEvent(event: JSObject) {
        notifyListeners("timingEvent", event, true)
    }
}

/**
 * NanoHTTPD HTTP Server
 *
 * Lightweight embedded HTTP server that accepts POST requests to /event
 * and forwards them to the JavaScript layer via the plugin.
 */
class TimingHTTPServer(port: Int, private val plugin: TimingServerPlugin) : NanoHTTPD(port) {

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri
        val method = session.method

        // Only accept POST requests to /event
        if (uri != "/event" || method != Method.POST) {
            val error = JSObject()
            error.put("status", "error")
            error.put("message", "Invalid endpoint or method")
            return newFixedLengthResponse(
                Response.Status.NOT_FOUND,
                "application/json",
                error.toString()
            )
        }

        try {
            // Read the request body
            val bodyMap = HashMap<String, String>()
            session.parseBody(bodyMap)

            val postData = bodyMap["postData"] ?: ""

            // Parse JSON
            val jsonObject = JSONObject(postData)

            // Validate required fields
            if (!jsonObject.has("deviceId") || !jsonObject.has("eventType")) {
                val error = JSObject()
                error.put("status", "error")
                error.put("message", "Missing required fields: deviceId, eventType")
                return newFixedLengthResponse(
                    Response.Status.BAD_REQUEST,
                    "application/json",
                    error.toString()
                )
            }

            // Create event payload
            val event = JSObject()
            event.put("deviceId", jsonObject.getString("deviceId"))
            event.put("eventType", jsonObject.getString("eventType"))

            // Optional fields
            if (jsonObject.has("eventId")) {
                event.put("eventId", jsonObject.getString("eventId"))
            }
            if (jsonObject.has("localTimestamp")) {
                event.put("localTimestamp", jsonObject.getLong("localTimestamp"))
            }

            // Add server-side timestamp
            event.put("receivedAt", System.currentTimeMillis())

            // Notify listeners in JavaScript
            plugin.notifyTimingEvent(event)

            // Return success response
            val success = JSObject()
            success.put("status", "ok")
            return newFixedLengthResponse(
                Response.Status.OK,
                "application/json",
                success.toString()
            )

        } catch (e: Exception) {
            val error = JSObject()
            error.put("status", "error")
            error.put("message", e.message ?: "Unknown error")
            return newFixedLengthResponse(
                Response.Status.BAD_REQUEST,
                "application/json",
                error.toString()
            )
        }
    }
}
