package com.daxipro.daxi.network

import android.util.Log

/** Logs réseau horodatés pour diagnostiquer la chaîne WebView ↔ Android ↔ Django. */
object DaxiNetLog {
    const val TAG = "DAXI_NET"

    fun i(stage: String, msg: String) {
        Log.i(TAG, "[$stage] $msg")
    }

    fun w(stage: String, msg: String) {
        Log.w(TAG, "[$stage] $msg")
    }

    fun e(stage: String, msg: String, t: Throwable? = null) {
        if (t != null) Log.e(TAG, "[$stage] $msg", t)
        else Log.e(TAG, "[$stage] $msg")
    }
}
