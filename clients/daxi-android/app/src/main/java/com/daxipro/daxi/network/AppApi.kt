package com.daxipro.daxi.network

import org.json.JSONObject

/** Client Kotlin de /api/app/ — une méthode par action de page. */
class AppApi(private val http: DaxiApiClient) {

    fun home(): JSONObject? = http.appGet("/api/app/home/")
    fun me(): JSONObject? = http.appGet("/api/app/auth/me/")

    fun login(email: String, password: String): JSONObject? {
        val body = JSONObject().put("email", email).put("password", password)
        val res = http.appPost("/api/app/auth/login/", body)
        res?.optJSONObject("tokens")?.optString("access")?.let { http.saveAccessToken(it) }
        return res
    }

    fun loginById(userId: String): JSONObject? {
        val res = http.appPost("/api/app/auth/login-by-id/", JSONObject().put("user_id", userId))
        res?.optJSONObject("tokens")?.optString("access")?.let { http.saveAccessToken(it) }
        return res
    }

    fun register(payload: JSONObject): JSONObject? = http.appPost("/api/app/auth/register/", payload)
    fun logout(): JSONObject? {
        val res = http.appPost("/api/app/auth/logout/")
        http.saveAccessToken(null)
        return res
    }

    fun sendOtp(email: String, phone: String, name: String = ""): JSONObject? =
        http.appPost(
            "/api/app/auth/send-otp/",
            JSONObject().put("email", email).put("phone", phone).put("name", name),
        )

    fun autocomplete(query: String): JSONObject? =
        http.appGet("/api/app/places/autocomplete/?q=" + java.net.URLEncoder.encode(query, "UTF-8"))

    fun placeDetails(placeId: String): JSONObject? =
        http.appGet("/api/app/places/details/?place_id=" + java.net.URLEncoder.encode(placeId, "UTF-8"))

    fun servicePlans(): JSONObject? = http.appGet("/api/app/service-plans/")

    fun createOrder(payload: JSONObject): JSONObject? =
        http.appPost("/api/app/orders/create/", payload)

    fun orders(tab: String = "active"): JSONObject? =
        http.appGet("/api/app/orders/?tab=$tab")

    fun order(id: Int): JSONObject? = http.appGet("/api/app/orders/$id/")
    fun orderStatus(id: Int): JSONObject? = http.appGet("/api/app/orders/$id/status/")
    fun confirmPrice(id: Int): JSONObject? = http.appPost("/api/app/orders/$id/confirm-price/")
    fun refusePrice(id: Int): JSONObject? = http.appPost("/api/app/orders/$id/refuse-price/")
    fun cancel(id: Int): JSONObject? = http.appPost("/api/app/orders/$id/cancel/")
    fun savePhone(id: Int, phone: String): JSONObject? =
        http.appPost("/api/app/orders/$id/phone/", JSONObject().put("client_phone", phone))
    fun initPayment(id: Int, method: String): JSONObject? =
        http.appPost("/api/app/orders/$id/payment/init/", JSONObject().put("method", method))
    fun paymentStatus(id: Int): JSONObject? = http.appGet("/api/app/orders/$id/payment/status/")
    fun updateGps(id: Int, lat: Double, lng: Double): JSONObject? =
        http.appPost(
            "/api/app/orders/$id/update-gps/",
            JSONObject().put("lat", lat).put("lng", lng).put("client_gps_lat", lat).put("client_gps_lng", lng),
        )
    fun arrived(id: Int): JSONObject? = http.appPost("/api/app/orders/$id/arrived/")
    fun rating(id: Int, stars: Int): JSONObject? =
        http.appPost("/api/app/orders/$id/rating/", JSONObject().put("rating", stars))
    fun share(id: Int): JSONObject? = http.appPost("/api/app/orders/$id/share/")
    fun sos(id: Int): JSONObject? = http.appPost("/api/app/orders/$id/sos/")
    fun chat(id: Int): JSONObject? = http.appGet("/api/app/chat/$id/")
    fun sendChat(id: Int, content: String): JSONObject? =
        http.appPost("/api/app/chat/$id/send/", JSONObject().put("content", content))
    fun account(): JSONObject? = http.appGet("/api/app/account/")
    fun accountUpdate(payload: JSONObject): JSONObject? = http.appPost("/api/app/account/update/", payload)
    fun stats(): JSONObject? = http.appGet("/api/app/account/stats/")

    fun driverLogin(identifier: String, password: String): JSONObject? =
        http.appPost(
            "/api/app/driver/login/",
            JSONObject().put("identifier", identifier).put("password", password).put("email", identifier),
        )
    fun driverLogout(): JSONObject? = http.appPost("/api/app/driver/logout/")
    fun driverHome(): JSONObject? = http.appGet("/api/app/driver/home/")
    fun driverOrders(tab: String = "available"): JSONObject? =
        http.appGet("/api/app/driver/orders/?tab=$tab")
    fun driverAccept(id: Int): JSONObject? = http.appPost("/api/app/driver/orders/$id/accept/")
    fun driverStatus(id: Int, status: String): JSONObject? =
        http.appPost("/api/app/driver/orders/$id/status/", JSONObject().put("status", status))
    fun driverLocation(lat: Double, lng: Double): JSONObject? =
        http.appPost("/api/app/driver/location/", JSONObject().put("lat", lat).put("lng", lng))
    fun driverOnline(online: Boolean): JSONObject? =
        http.appPost(
            "/api/app/driver/status/",
            JSONObject().put("status", if (online) "available" else "offline"),
        )
    fun driverActive(): JSONObject? = http.appGet("/api/app/driver/active-order/")
}
