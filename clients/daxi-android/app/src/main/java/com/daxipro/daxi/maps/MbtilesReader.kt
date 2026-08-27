package com.daxipro.daxi.maps

import android.database.sqlite.SQLiteDatabase
import java.io.File

/**
 * Lecture minimale MBTiles (SQLite) pour servir les tuiles hors ligne.
 */
class MbtilesReader(private val file: File) {
  private var db: SQLiteDatabase? = null

  fun open(): Boolean {
    if (!file.exists()) return false
    db = SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
    return true
  }

  fun close() {
    db?.close()
    db = null
  }

  fun getTile(z: Int, x: Int, y: Int): ByteArray? {
    val database = db ?: return null
    val tmsY = (1 shl z) - 1 - y
    database.rawQuery(
      "SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ? LIMIT 1",
      arrayOf(z.toString(), x.toString(), tmsY.toString()),
    ).use { cursor ->
      if (!cursor.moveToFirst()) return null
      return cursor.getBlob(0)
    }
  }

  fun metadata(key: String): String? {
    val database = db ?: return null
    database.rawQuery("SELECT value FROM metadata WHERE name = ? LIMIT 1", arrayOf(key)).use { cursor ->
      if (!cursor.moveToFirst()) return null
      return cursor.getString(0)
    }
  }
}
