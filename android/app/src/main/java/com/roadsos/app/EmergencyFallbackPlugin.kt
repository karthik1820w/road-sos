package com.roadsos.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.PhoneStateListener
import android.telephony.SmsManager
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "EmergencyFallback",
    permissions = [
        Permission(
            alias = "sms",
            strings = [Manifest.permission.SEND_SMS]
        ),
        Permission(
            alias = "call",
            strings = [
                Manifest.permission.CALL_PHONE,
                Manifest.permission.READ_PHONE_STATE
            ]
        )
    ]
)
class EmergencyFallbackPlugin : Plugin() {

    @PluginMethod
    fun sendEmergencySms(call: PluginCall) {
        if (getPermissionState("sms") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "smsPermsCallback")
            return
        }
        executeSendSms(call)
    }

    @PermissionCallback
    private fun smsPermsCallback(call: PluginCall) {
        if (getPermissionState("sms") == com.getcapacitor.PermissionState.GRANTED) {
            executeSendSms(call)
        } else {
            call.reject("permission denied")
        }
    }

    private fun executeSendSms(call: PluginCall) {
        val contacts = call.getArray("contacts")
        val body = call.getString("body")

        if (contacts == null || body == null) {
            call.reject("Must provide contacts and body")
            return
        }

        val sent = JSArray()
        val failed = JSArray()

        val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(SmsManager::class.java)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getDefault()
        }

        for (i in 0 until contacts.length()) {
            var rawNumber = ""
            try {
                rawNumber = contacts.getString(i)
                val sanitizedNumber = rawNumber.replace(Regex("[^0-9+]"), "")
                if (sanitizedNumber.isNotEmpty()) {
                    val parts = smsManager.divideMessage(body)
                    smsManager.sendMultipartTextMessage(sanitizedNumber, null, parts, null, null)
                    sent.put(rawNumber)
                } else {
                    failed.put(rawNumber)
                }
            } catch (e: Exception) {
                failed.put(rawNumber)
                Log.e("EmergencyFallback", "Failed to send SMS to $rawNumber", e)
            }
        }

        val result = JSObject()
        result.put("sent", sent)
        result.put("failed", failed)
        call.resolve(result)
    }

    private var sequenceCall: PluginCall? = null
    private var numbersToCall = mutableListOf<String>()
    private var perCallTimeoutMs: Long = 15000
    private var attemptedNumbers = JSArray()
    private var isCalling = false
    private var callStartTime: Long = 0
    private var currentNumber: String? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var watchdogRunnable: Runnable? = null

    @PluginMethod
    fun dialEmergencySequence(call: PluginCall) {
        if (getPermissionState("call") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("call", call, "callPermsCallback")
            return
        }
        executeDialSequence(call)
    }

    @PermissionCallback
    private fun callPermsCallback(call: PluginCall) {
        if (getPermissionState("call") == com.getcapacitor.PermissionState.GRANTED) {
            executeDialSequence(call)
        } else {
            call.reject("permission denied")
        }
    }

    private fun executeDialSequence(call: PluginCall) {
        if (isCalling) {
            call.reject("Already calling")
            return
        }
        val numbersArray = call.getArray("numbers")
        if (numbersArray == null || numbersArray.length() == 0) {
            val result = JSObject()
            result.put("reached", null)
            result.put("attempted", JSArray())
            call.resolve(result)
            return
        }

        perCallTimeoutMs = call.getInt("perCallTimeoutMs", 15000).toLong()
        numbersToCall.clear()
        for (i in 0 until numbersArray.length()) {
            numbersToCall.add(numbersArray.getString(i))
        }

        sequenceCall = call
        attemptedNumbers = JSArray()

        startNextCall()
    }

    private fun startNextCall() {
        cancelWatchdog()

        if (numbersToCall.isEmpty()) {
            finishSequence(null)
            return
        }

        currentNumber = numbersToCall.removeAt(0)
        attemptedNumbers.put(currentNumber)

        val raw = currentNumber ?: ""
        val sanitized = raw.replace(Regex("[^0-9+]"), "")
        if (sanitized.isEmpty()) {
            // Invalid number, advance to next
            startNextCall()
            return
        }

        val intent = Intent(Intent.ACTION_CALL)
        intent.data = Uri.parse("tel:$sanitized")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        try {
            isCalling = true
            wasOffhook = false
            callStartTime = System.currentTimeMillis()
            registerCallStateListener()

            // Arm a watchdog timer in case Telephony callbacks are delayed or dropped
            watchdogRunnable = Runnable {
                Log.w("EmergencyFallback", "Watchdog expired for $currentNumber without final state")
                if (isCalling) {
                    isCalling = false
                    unregisterCallStateListener()
                    startNextCall()
                }
            }
            mainHandler.postDelayed(watchdogRunnable!!, perCallTimeoutMs + 5000)

            context.startActivity(intent)
        } catch (e: SecurityException) {
            Log.e("EmergencyFallback", "Security exception placing call", e)
            cancelWatchdog()
            finishSequence(null)
        } catch (e: Exception) {
            Log.e("EmergencyFallback", "Failed to place call", e)
            cancelWatchdog()
            unregisterCallStateListener()
            isCalling = false
            startNextCall()
        }
    }

    private fun cancelWatchdog() {
        watchdogRunnable?.let { mainHandler.removeCallbacks(it) }
        watchdogRunnable = null
    }

    private fun finishSequence(reachedNumber: String?) {
        cancelWatchdog()
        isCalling = false
        unregisterCallStateListener()

        val call = sequenceCall
        if (call != null) {
            val result = JSObject()
            result.put("reached", reachedNumber)
            result.put("attempted", attemptedNumbers)
            call.resolve(result)
            sequenceCall = null
        }
    }

    private var telephonyManager: TelephonyManager? = null
    private var telephonyCallback: Any? = null
    private var phoneStateListener: PhoneStateListener? = null
    private var wasOffhook = false

    private fun registerCallStateListener() {
        telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            telephonyCallback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) {
                    handleCallStateChange(state)
                }
            }
            telephonyManager?.registerTelephonyCallback(
                context.mainExecutor,
                telephonyCallback as TelephonyCallback
            )
        } else {
            @Suppress("DEPRECATION")
            phoneStateListener = object : PhoneStateListener() {
                @Deprecated("Deprecated in Java")
                override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                    handleCallStateChange(state)
                }
            }
            @Suppress("DEPRECATION")
            telephonyManager?.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE)
        }
    }

    private fun unregisterCallStateListener() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            telephonyCallback?.let {
                telephonyManager?.unregisterTelephonyCallback(it as TelephonyCallback)
                telephonyCallback = null
            }
        } else {
            phoneStateListener?.let {
                @Suppress("DEPRECATION")
                telephonyManager?.listen(it, PhoneStateListener.LISTEN_NONE)
                phoneStateListener = null
            }
        }
    }

    /**
     * TELEPHONY CALL-STATE HEURISTIC:
     * 
     * Trade-off Explanation:
     * 1. CALL_STATE_OFFHOOK: Indicates the call went off-hook (either actively dialing or answered).
     * 2. CALL_STATE_IDLE: Indicates the call ended.
     * 
     * Heuristic:
     * - If wasOffhook == true AND (callDuration > perCallTimeoutMs):
     *   We treat this as "Connected / Human or Voicemail reached". The sequence stops here.
     *   (Trade-off: A long ringing phase before carrier disconnect may look like a long connected call,
     *   but avoiding endless dialing loops during a live conversation takes priority).
     * 
     * - If wasOffhook == true AND (callDuration <= perCallTimeoutMs):
     *   We treat this as "Quick reject, line busy, or rapid disconnect". We advance to the next contact.
     * 
     * - If wasOffhook == false:
     *   The call was rejected/declined before offhook, or failed immediately. We advance to the next contact.
     */
    private fun handleCallStateChange(state: Int) {
        when (state) {
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                wasOffhook = true
            }
            TelephonyManager.CALL_STATE_IDLE -> {
                if (isCalling) {
                    val duration = System.currentTimeMillis() - callStartTime
                    val wasConnected = wasOffhook && (duration > perCallTimeoutMs)
                    wasOffhook = false
                    cancelWatchdog()

                    if (wasConnected) {
                        finishSequence(currentNumber)
                    } else {
                        isCalling = false
                        unregisterCallStateListener()
                        startNextCall()
                    }
                }
            }
        }
    }

    override fun handleOnDestroy() {
        cancelWatchdog()
        unregisterCallStateListener()
        super.handleOnDestroy()
    }
}
