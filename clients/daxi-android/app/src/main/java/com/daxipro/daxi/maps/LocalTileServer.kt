package com.daxipro.daxi.maps

import android.util.Log
import fi.iki.elonen.NanoHTTPD
import java.io.ByteArrayInputStream

class LocalTileServer(
  private val reader: MbtilesReader,
  port: Int = 8765,
) : NanoHTTPD(port) {

  override fun serve(session: IHTTPSession): Response {
    val uri = session.uri ?: return notFound()
    val parts = uri.trim('/').split('/')
    if (parts.size < 4 || parts[0] != "tiles") return notFound()
    val z = parts[1].toIntOrNull() ?: return notFound()
    val x = parts[2].toIntOrNull() ?: return notFound()
    val yRaw = parts[3].substringBefore('.')
    val y = yRaw.toIntOrNull() ?: return notFound()
    val bytes = reader.getTile(z, x, y) ?: return notFound()
    Log.d("DaxiMap", "[MAP] Tile $z/$x/$y loaded")
    val mime = if (parts[3].endsWith(".png")) "image/png" else "image/jpeg"
    return newFixedLengthResponse(Response.Status.OK, mime, ByteArrayInputStream(bytes), bytes.size.toLong())
  }

  private fun notFound(): Response {
    return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "not found")
  }
}
