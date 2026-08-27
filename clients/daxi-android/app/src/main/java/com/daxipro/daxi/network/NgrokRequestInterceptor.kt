package com.daxipro.daxi.network



import android.webkit.WebResourceRequest

import android.webkit.WebResourceResponse

import okhttp3.OkHttpClient

import okhttp3.Request

import java.io.ByteArrayInputStream

import java.util.concurrent.TimeUnit



/**

 * Contourne la page d'avertissement ngrok (ERR_NGROK_6024) sur toutes les requêtes GET.

 */

object NgrokRequestInterceptor {



    private val client = OkHttpClient.Builder()

        .followRedirects(true)

        .connectTimeout(25, TimeUnit.SECONDS)

        .readTimeout(60, TimeUnit.SECONDS)

        .build()



    fun isNgrokHost(host: String): Boolean {

        return host.contains("ngrok-free.dev") ||

            host.contains("ngrok-free.app") ||

            host.contains("ngrok.io")

    }



    fun intercept(request: WebResourceRequest): WebResourceResponse? {

        if (request.method != "GET") return null

        val host = request.url.host ?: return null

        if (!isNgrokHost(host)) return null



        return try {

            val httpRequest = Request.Builder()

                .url(request.url.toString())

                .get()

                .header("ngrok-skip-browser-warning", "true")

                .header("Accept", request.requestHeaders["Accept"] ?: "*/*")

                .header("User-Agent", request.requestHeaders["User-Agent"] ?: "DaxiAndroid")

                .build()

            val response = client.newCall(httpRequest).execute()

            val body = response.body ?: return null

            val bytes = body.bytes()

            val contentType = response.header("Content-Type") ?: guessMime(request.url.path ?: "")

            val mime = contentType.substringBefore(";").trim()

            val encoding = if (isTextMime(mime)) "utf-8" else null

            val headers = response.headers.toMultimap().mapValues { it.value.firstOrNull() ?: "" }

            WebResourceResponse(

                mime,

                encoding,

                response.code,

                response.message.ifBlank { "OK" },

                headers,

                ByteArrayInputStream(bytes),

            )

        } catch (_: Exception) {

            null

        }

    }



    private fun isTextMime(mime: String): Boolean {

        return mime.startsWith("text/") ||

            mime.contains("json") ||

            mime.contains("javascript") ||

            mime.contains("xml")

    }



    private fun guessMime(path: String): String = when {

        path.endsWith(".js") -> "application/javascript"

        path.endsWith(".css") -> "text/css"

        path.endsWith(".json") -> "application/json"

        path.endsWith(".png") -> "image/png"

        path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".webp") -> "image/jpeg"

        path.endsWith(".jfif") -> "image/jpeg"

        path.endsWith(".svg") -> "image/svg+xml"

        path.endsWith(".woff2") -> "font/woff2"

        path.endsWith(".woff") -> "font/woff"

        else -> "text/html"

    }

}

