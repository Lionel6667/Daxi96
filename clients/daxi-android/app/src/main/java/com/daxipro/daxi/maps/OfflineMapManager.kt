package com.daxipro.daxi.maps



import android.content.Context

import android.util.Log

import com.daxipro.daxi.network.DaxiApiClient

import fi.iki.elonen.NanoHTTPD

import kotlinx.coroutines.Dispatchers

import kotlinx.coroutines.withContext

import org.json.JSONObject

import java.io.File



class OfflineMapManager(

    private val context: Context,

    private val api: DaxiApiClient,

) {

    private val mapsDir: File

        get() = File(context.filesDir, "maps").also { it.mkdirs() }



    @Volatile

    private var tileServer: LocalTileServer? = null



    private val startLock = Any()



    fun getTileBytes(z: Int, x: Int, y: Int): ByteArray? {

        return activeReader?.getTile(z, x, y)

    }



    fun parseTilePath(path: String): Triple<Int, Int, Int>? {

        val parts = path.trim('/').split('/')

        if (parts.size < 4 || parts[0] != "tiles") return null

        val z = parts[1].toIntOrNull() ?: return null

        val x = parts[2].toIntOrNull() ?: return null

        val y = parts[3].substringBefore('.').toIntOrNull() ?: return null

        return Triple(z, x, y)

    }



    @Volatile

    private var activeReader: MbtilesReader? = null



    @Volatile

    private var activePackId: String? = null



    @Volatile

    private var usingInterceptFallback = false



    fun hasOfflineTiles(): Boolean {

        val marker = File(mapsDir, ".active_pack")

        if (!marker.exists()) return false

        val pack = marker.readText().trim()

        return File(mapsDir, "$pack.mbtiles").exists()

    }



    /** Copie le pack Haïti embarqué dans l'APK (premier lancement). */

    fun ensureBundledMapCopied() {

        val target = File(mapsDir, "haiti.mbtiles")

        val marker = File(mapsDir, ".active_pack")

        if (target.exists() && marker.exists()) return

        try {

            context.assets.open("maps/haiti.mbtiles").use { input ->

                target.outputStream().use { output -> input.copyTo(output) }

            }

            File(mapsDir, "haiti.version").writeText("bundled")

            marker.writeText("haiti")

            Log.i(TAG, "[MAP] MBTiles Copied")

        } catch (e: Exception) {

            Log.w(TAG, "[MAP] MBTiles copy failed: ${e.message}")

        }

    }



    fun tileUrlTemplate(): String {

        val port = tileServer?.listeningPort ?: 8765

        return "http://127.0.0.1:$port/tiles/{z}/{x}/{y}.png"

    }



    fun ensureStartedBlocking(): Boolean {

        synchronized(startLock) {

            if (activeReader != null) return true

            ensureBundledMapCopied()

            val marker = File(mapsDir, ".active_pack")

            if (!marker.exists()) return false

            val packId = marker.readText().trim()

            val file = File(mapsDir, "$packId.mbtiles")

            if (!file.exists()) return false

            val reader = MbtilesReader(file)

            if (!reader.open()) return false

            activeReader = reader

            activePackId = packId

            Log.i(TAG, "[MAP] Reader Ready")

            val server = LocalTileServer(reader)

            return try {

                server.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false)

                tileServer = server

                usingInterceptFallback = false

                Log.i(TAG, "[MAP] NanoHTTPD Ready")

                true

            } catch (e: Exception) {

                usingInterceptFallback = true

                Log.w(TAG, "[MAP] Using shouldInterceptRequest fallback (${e.message})")

                true

            }

        }

    }



    suspend fun ensureStarted(): Boolean = withContext(Dispatchers.IO) {

        ensureStartedBlocking()

    }



    suspend fun syncPacksFromBootstrap(bootstrap: JSONObject): Boolean = withContext(Dispatchers.IO) {

        val map = bootstrap.optJSONObject("map") ?: return@withContext false

        val packs = map.optJSONArray("offline_packs") ?: return@withContext false

        var ok = false

        for (i in 0 until packs.length()) {

            val pack = packs.optJSONObject(i) ?: continue

            val id = pack.optString("id")

            val url = pack.optString("url")

            val version = pack.optString("version", "1")

            if (id.isBlank() || url.isBlank()) continue

            val target = File(mapsDir, "$id.mbtiles")

            val versionFile = File(mapsDir, "$id.version")

            if (target.exists() && versionFile.exists() && versionFile.readText() == version) {

                File(mapsDir, ".active_pack").writeText(id)

                ok = true

                continue

            }

            val bytes = api.downloadBytes(url) ?: continue

            target.writeBytes(bytes)

            versionFile.writeText(version)

            File(mapsDir, ".active_pack").writeText(id)

            ok = true

        }

        if (ok) ensureStarted()

        ok

    }



    fun stop() {

        synchronized(startLock) {

            tileServer?.stop()

            tileServer = null

            activePackId = null

            activeReader?.close()

            activeReader = null

            usingInterceptFallback = false

        }

    }



    companion object {

        private const val TAG = "DaxiMap"

    }

}

