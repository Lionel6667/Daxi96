package com.daxipro.daxi.data.local

import androidx.room.TypeConverter

class Converters {
    @TypeConverter
    fun fromStringList(value: String?): List<String> {
        if (value.isNullOrBlank()) return emptyList()
        return value.split('\u001E').filter { it.isNotEmpty() }
    }

    @TypeConverter
    fun toStringList(list: List<String>?): String {
        return list?.joinToString("\u001E") ?: ""
    }
}
