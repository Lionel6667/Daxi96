package com.daxipro.daxi;

import android.Manifest;
import android.content.Intent;
import android.location.Location;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONException;

@CapacitorPlugin(
    name = "DaxiGps",
    permissions = {
        @Permission(
            strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION },
            alias = DaxiGpsPlugin.LOCATION
        ),
        @Permission(strings = { Manifest.permission.ACCESS_COARSE_LOCATION }, alias = DaxiGpsPlugin.COARSE_LOCATION)
    }
)
public class DaxiGpsPlugin extends Plugin {
    static final String LOCATION = "location";
    static final String COARSE_LOCATION = "coarseLocation";

    private DaxiGpsEngine engine;
    private final Map<String, PluginCall> watchingCalls = new HashMap<>();
    private final List<FreshWaiter> freshWaiters = new ArrayList<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private static final class FreshWaiter {
        final PluginCall call;
        final Runnable expire;

        FreshWaiter(PluginCall call, Runnable expire) {
            this.call = call;
            this.expire = expire;
        }
    }

    @Override
    public void load() {
        engine = new DaxiGpsEngine(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        engine.stop();
        watchingCalls.clear();
        freshWaiters.clear();
    }

    // Do not clear updates on pause. Stock @capacitor/geolocation does, and that
    // drops the GNSS session on every permission dialog / app switch.

    @PluginMethod
    public void isLocationEnabled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", engine.isLocationServicesEnabled());
        call.resolve(ret);
    }

    @PluginMethod
    public void permissionKind(PluginCall call) {
        call.resolve(permissionSnapshot());
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    public void watch(PluginCall call) {
        call.setKeepAlive(true);
        if (getPermissionState(LOCATION) != PermissionState.GRANTED) {
            requestPermissionForAlias(LOCATION, call, "completeWatch");
            return;
        }
        startWatch(call);
    }

    @PermissionCallback
    private void completeWatch(PluginCall call) {
        if (getPermissionState(LOCATION) != PermissionState.GRANTED) {
            call.reject("precise location permission was denied");
            return;
        }
        startWatch(call);
    }

    @PluginMethod
    public void clearWatch(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            call.reject("Watch call id must be provided");
            return;
        }
        PluginCall removed = watchingCalls.remove(id);
        if (removed != null) {
            removed.release(bridge);
        }
        stopEngineIfIdle();
        call.resolve();
    }

    @PluginMethod
    public void getFreshPosition(PluginCall call) {
        if (getPermissionState(LOCATION) != PermissionState.GRANTED) {
            requestPermissionForAlias(LOCATION, call, "completeFresh");
            return;
        }
        waitForFresh(call);
    }

    @PermissionCallback
    private void completeFresh(PluginCall call) {
        if (getPermissionState(LOCATION) != PermissionState.GRANTED) {
            call.reject("precise location permission was denied");
            return;
        }
        waitForFresh(call);
    }

    private void startWatch(PluginCall call) {
        watchingCalls.put(call.getCallbackId(), call);
        ensureEngine();
        Log.i(DaxiGpsEngine.TAG, "watch registered id=" + call.getCallbackId());
    }

    /**
     * Wait for the next fused callback. Never reads getLastLocation() /
     * getLastKnownLocation() — those are the 500 m cold-start cache.
     */
    private void waitForFresh(final PluginCall call) {
        int timeout = call.getInt("timeout", 15000);
        final FreshWaiter[] slot = new FreshWaiter[1];
        Runnable expire = () -> {
            if (freshWaiters.remove(slot[0])) {
                call.reject("timeout waiting for a fresh GPS fix");
                stopEngineIfIdle();
            }
        };
        slot[0] = new FreshWaiter(call, expire);
        freshWaiters.add(slot[0]);
        mainHandler.postDelayed(expire, timeout);
        ensureEngine();
    }

    private void ensureEngine() {
        if (engine.isRunning()) {
            return;
        }
        engine.start(new DaxiGpsEngine.FixListener() {
            @Override
            public void onFix(Location location) {
                dispatchFix(location);
            }

            @Override
            public void onError(String message) {
                Log.w(DaxiGpsEngine.TAG, "engine error: " + message);
                for (PluginCall watch : watchingCalls.values()) {
                    watch.reject(message);
                }
                failFreshWaiters(message);
            }
        });
    }

    private void stopEngineIfIdle() {
        if (watchingCalls.isEmpty() && freshWaiters.isEmpty()) {
            engine.stop();
            Log.i(DaxiGpsEngine.TAG, "watch stopped");
        }
    }

    private void failFreshWaiters(String message) {
        List<FreshWaiter> copy = new ArrayList<>(freshWaiters);
        freshWaiters.clear();
        for (FreshWaiter waiter : copy) {
            mainHandler.removeCallbacks(waiter.expire);
            waiter.call.reject(message);
        }
    }

    private void dispatchFix(Location location) {
        long ageMs = ageMsOf(location);
        JSObject payload = toJs(location, ageMs);
        Log.i(
            DaxiGpsEngine.TAG,
            "fix acc=" + location.getAccuracy()
                + " ageMs=" + ageMs
                + " provider=" + location.getProvider()
                + " sats=" + engine.satellitesUsed() + "/" + engine.satellitesInView()
                + " precise=" + hasFinePermission()
        );
        for (PluginCall watch : watchingCalls.values()) {
            watch.resolve(cloneJs(payload));
        }
        if (freshWaiters.isEmpty()) {
            return;
        }
        List<FreshWaiter> copy = new ArrayList<>(freshWaiters);
        freshWaiters.clear();
        for (FreshWaiter waiter : copy) {
            mainHandler.removeCallbacks(waiter.expire);
            waiter.call.resolve(cloneJs(payload));
        }
        stopEngineIfIdle();
    }

    private static long ageMsOf(Location location) {
        return Math.max(
            0L,
            (SystemClock.elapsedRealtimeNanos() - location.getElapsedRealtimeNanos()) / 1_000_000L
        );
    }

    private JSObject toJs(Location location, long ageMs) {
        JSObject ret = new JSObject();
        ret.put("lat", location.getLatitude());
        ret.put("lng", location.getLongitude());
        ret.put("accuracy", location.getAccuracy());
        ret.put("altitude", location.getAltitude());
        if (location.hasSpeed()) {
            ret.put("speed", location.getSpeed());
        }
        if (location.hasBearing()) {
            ret.put("heading", location.getBearing());
        }
        ret.put("timestamp", location.getTime());
        ret.put("elapsedRealtimeNanos", location.getElapsedRealtimeNanos());
        ret.put("ageMs", ageMs);
        ret.put("provider", location.getProvider() == null ? "" : location.getProvider());
        ret.put("precise", hasFinePermission());
        ret.put("satellitesUsed", engine.satellitesUsed());
        ret.put("satellitesInView", engine.satellitesInView());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ret.put("altitudeAccuracy", location.getVerticalAccuracyMeters());
        }
        return ret;
    }

    private JSObject permissionSnapshot() {
        boolean fine = hasFinePermission();
        boolean coarse = getPermissionState(COARSE_LOCATION) == PermissionState.GRANTED;
        JSObject ret = new JSObject();
        ret.put("kind", fine ? "fine" : (coarse ? "coarse" : "denied"));
        ret.put("precise", fine);
        ret.put("location", fine ? "granted" : "denied");
        ret.put("coarseLocation", coarse || fine ? "granted" : "denied");
        ret.put("locationEnabled", engine.isLocationServicesEnabled());
        return ret;
    }

    private boolean hasFinePermission() {
        return getPermissionState(LOCATION) == PermissionState.GRANTED;
    }

    private static JSObject cloneJs(JSObject src) {
        try {
            return JSObject.fromJSONObject(src);
        } catch (JSONException e) {
            return src;
        }
    }
}
