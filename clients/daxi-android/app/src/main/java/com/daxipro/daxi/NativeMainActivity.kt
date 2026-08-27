package com.daxipro.daxi

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.daxipro.daxi.databinding.ActivityNativeMainBinding
import com.daxipro.daxi.location.LocationHelper
import com.daxipro.daxi.network.AppApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

class NativeMainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityNativeMainBinding
    private lateinit var api: AppApi
    private lateinit var locationHelper: LocationHelper
    private var pickupLat: Double? = null
    private var pickupLng: Double? = null
    private var destLat: Double? = null
    private var destLng: Double? = null
    private var currentOrderId: Int? = null
    private val orders = mutableListOf<JSONObject>()

    private val locPermission = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { granted ->
        if (granted.values.any { it }) startGps()
    }

    private val adapter = object : RecyclerView.Adapter<OrderVh>() {
        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): OrderVh {
            val v = LayoutInflater.from(parent.context).inflate(R.layout.item_order, parent, false)
            return OrderVh(v)
        }

        override fun getItemCount() = orders.size

        override fun onBindViewHolder(holder: OrderVh, position: Int) {
            val o = orders[position]
            val pickup = o.optString("pickup_display").ifBlank { o.optString("pickup") }
            val dest = o.optString("destination_display").ifBlank { o.optString("destination") }
            holder.title.text = "$pickup → $dest"
            holder.meta.text = o.optString("client_status_label").ifBlank { o.optString("status_display", o.optString("status")) }
            holder.itemView.setOnClickListener {
                openOrder(o.optInt("id"))
            }
        }
    }

    class OrderVh(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.itemTitle)
        val meta: TextView = view.findViewById(R.id.itemMeta)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        DaxiAppServices.init(this)
        DaxiAppServices.api.ensureGuestId()
        api = DaxiAppServices.appApi
        locationHelper = LocationHelper(this)
        binding = ActivityNativeMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.ordersList.layoutManager = LinearLayoutManager(this)
        binding.ordersList.adapter = adapter

        binding.bottomNav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_home -> showScreen("home")
                R.id.nav_orders -> {
                    showScreen("orders")
                    loadOrders()
                }
                R.id.nav_account -> {
                    showScreen("account")
                    loadAccount()
                }
            }
            true
        }

        binding.btnGps.setOnClickListener { useMyPosition() }
        binding.btnOrder.setOnClickListener { createOrder() }
        binding.btnLogin.setOnClickListener { loginClient() }
        binding.btnDriverLogin.setOnClickListener { loginDriver() }
        binding.btnLogout.setOnClickListener { logout() }
        binding.btnConfirmPrice.setOnClickListener {
            currentOrderId?.let { id -> runAction { api.confirmPrice(id) } }
        }
        binding.btnPayCash.setOnClickListener {
            currentOrderId?.let { id -> runAction { api.initPayment(id, "in_person") } }
        }
        binding.btnCancelOrder.setOnClickListener {
            currentOrderId?.let { id -> runAction { api.cancel(id) } }
        }
        binding.btnBackHome.setOnClickListener { showScreen("home") }

        maybeAskLocation()
        loadHome()
    }

    private fun showScreen(name: String) {
        binding.screenHome.isVisible = name == "home"
        binding.screenOrders.isVisible = name == "orders"
        binding.screenAccount.isVisible = name == "account"
        binding.screenOrder.isVisible = name == "order"
    }

    private fun maybeAskLocation() {
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
        if (fine == PackageManager.PERMISSION_GRANTED) {
            startGps()
        } else {
            locPermission.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                ),
            )
        }
    }

    private fun startGps() {
        try {
            locationHelper.startContinuousUpdates()
        } catch (_: Exception) {
        }
        useMyPosition()
    }

    private fun useMyPosition() {
        lifecycleScope.launch {
            val loc = withContext(Dispatchers.IO) {
                locationHelper.refreshHighAccuracy()
                locationHelper.getLastKnownHighAccuracy()
            }
            if (loc != null) {
                pickupLat = loc.latitude
                pickupLng = loc.longitude
                binding.mapLabel.text = "GPS %.5f, %.5f (±%.0fm)".format(loc.latitude, loc.longitude, loc.accuracy)
                if (binding.inputPickup.text.isNullOrBlank()) {
                    binding.inputPickup.setText("Ma position")
                }
            } else {
                binding.mapLabel.text = "GPS indisponible — saisissez l'adresse"
            }
        }
    }

    private fun loadHome() {
        lifecycleScope.launch {
            val home = withContext(Dispatchers.IO) { api.home() }
            val user = home?.optJSONObject("user")
            val name = user?.optString("name").orEmpty()
            binding.homeStatus.text = if (name.isNotBlank()) "Connecté · $name" else "Invité · app native"
            val active = home?.optJSONObject("active_order")
            if (active != null && active.optInt("id") > 0) {
                openOrder(active.optInt("id"), fromHome = true)
            }
        }
    }

    private fun loadOrders() {
        lifecycleScope.launch {
            val res = withContext(Dispatchers.IO) { api.orders("active") }
            val list = res?.optJSONArray("orders")
            orders.clear()
            if (list != null) {
                for (i in 0 until list.length()) {
                    orders.add(list.optJSONObject(i) ?: continue)
                }
            }
            adapter.notifyDataSetChanged()
            binding.ordersEmpty.isVisible = orders.isEmpty()
        }
    }

    private fun loadAccount() {
        lifecycleScope.launch {
            val me = withContext(Dispatchers.IO) { api.me() }
            val user = me?.optJSONObject("user")
            val driver = me?.optJSONObject("driver")
            val logged = me?.optBoolean("is_authenticated") == true || driver != null
            binding.accountInfo.text = when {
                user != null -> user.optString("name").ifBlank { user.optString("email") }
                driver != null -> "Chauffeur · ${driver.optString("name")}"
                else -> "Mode invité — vous pouvez commander sans compte"
            }
            binding.btnLogout.isVisible = logged
            binding.btnLogin.isVisible = !logged
            binding.btnDriverLogin.isVisible = !logged
        }
    }

    private fun createOrder() {
        val pickup = binding.inputPickup.text?.toString()?.trim().orEmpty()
        val dest = binding.inputDest.text?.toString()?.trim().orEmpty()
        if (pickup.isBlank() || dest.isBlank()) {
            showHomeError("Indiquez le départ et la destination.")
            return
        }
        binding.btnOrder.isEnabled = false
        lifecycleScope.launch {
            val payload = JSONObject()
                .put("pickup", pickup)
                .put("destination", dest)
                .put("pickup_lat", pickupLat ?: 0)
                .put("pickup_lng", pickupLng ?: 0)
                .put("destination_lat", destLat ?: 0)
                .put("destination_lng", destLng ?: 0)
                .put("client_gps_lat", pickupLat ?: 0)
                .put("client_gps_lng", pickupLng ?: 0)
                .put("trip_type", "aller simple")
                .put("passengers", 1)
                .put("vehicle_type", "economy")
            val res = withContext(Dispatchers.IO) { api.createOrder(payload) }
            binding.btnOrder.isEnabled = true
            if (res?.optBoolean("ok") == true) {
                showHomeError(null)
                val id = res.optInt("order_id", res.optJSONObject("order")?.optInt("id") ?: 0)
                if (id > 0) openOrder(id)
                else Toast.makeText(this@NativeMainActivity, "Commande créée", Toast.LENGTH_SHORT).show()
            } else {
                showHomeError(res?.optString("error").ifNullOrBlank("Impossible de créer la course"))
            }
        }
    }

    private fun openOrder(id: Int, fromHome: Boolean = false) {
        currentOrderId = id
        if (!fromHome) showScreen("order")
        else showScreen("order")
        lifecycleScope.launch {
            val res = withContext(Dispatchers.IO) { api.order(id) }
            val order = res?.optJSONObject("order") ?: return@launch
            renderOrder(order, res.optString("next"))
        }
    }

    private fun renderOrder(order: JSONObject, next: String) {
        val pickup = order.optString("pickup_display").ifBlank { order.optString("pickup") }
        val dest = order.optString("destination_display").ifBlank { order.optString("destination") }
        val status = order.optString("client_status_label").ifBlank { order.optString("status_display") }
        val price = order.opt("price")
        val driver = order.optString("driver_name")
        binding.orderTitle.text = "Course #${order.optInt("id")}"
        binding.orderBody.text = buildString {
            appendLine("$pickup → $dest")
            appendLine(status)
            if (price != null && price.toString() != "null") appendLine("Prix : $price HTG")
            if (driver.isNotBlank()) appendLine("Chauffeur : $driver")
        }
        binding.btnConfirmPrice.isVisible = next == "confirm_price"
        binding.btnPayCash.isVisible = next == "payment"
        binding.btnCancelOrder.isVisible = next in setOf("confirm_price", "payment", "pending_coords", "phone")
    }

    private fun runAction(block: () -> JSONObject?) {
        val id = currentOrderId ?: return
        lifecycleScope.launch {
            val res = withContext(Dispatchers.IO) { block() }
            if (res?.optBoolean("ok") == false && res.has("error")) {
                Toast.makeText(this@NativeMainActivity, res.optString("error"), Toast.LENGTH_LONG).show()
            }
            openOrder(id)
        }
    }

    private fun loginClient() {
        val email = binding.inputEmail.text?.toString()?.trim().orEmpty()
        val password = binding.inputPassword.text?.toString()?.trim().orEmpty()
        if (email.isBlank() || password.isBlank()) {
            Toast.makeText(this, "Email et mot de passe requis", Toast.LENGTH_SHORT).show()
            return
        }
        lifecycleScope.launch {
            val res = withContext(Dispatchers.IO) { api.login(email, password) }
            if (res?.optBoolean("ok") == true) {
                Toast.makeText(this@NativeMainActivity, "Connecté", Toast.LENGTH_SHORT).show()
                loadAccount()
                loadHome()
            } else {
                Toast.makeText(this@NativeMainActivity, res?.optString("error") ?: "Échec connexion", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun loginDriver() {
        val email = binding.inputEmail.text?.toString()?.trim().orEmpty()
        val password = binding.inputPassword.text?.toString()?.trim().orEmpty()
        if (email.isBlank() || password.isBlank()) {
            Toast.makeText(this, "Identifiant chauffeur requis", Toast.LENGTH_SHORT).show()
            return
        }
        lifecycleScope.launch {
            val res = withContext(Dispatchers.IO) { api.driverLogin(email, password) }
            if (res?.optBoolean("ok") == true) {
                Toast.makeText(this@NativeMainActivity, "Chauffeur connecté", Toast.LENGTH_SHORT).show()
                loadAccount()
            } else {
                Toast.makeText(this@NativeMainActivity, res?.optString("error") ?: "Échec chauffeur", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun logout() {
        lifecycleScope.launch {
            withContext(Dispatchers.IO) {
                api.logout()
                api.driverLogout()
            }
            loadAccount()
            Toast.makeText(this@NativeMainActivity, "Déconnecté", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showHomeError(msg: String?) {
        binding.homeError.isVisible = !msg.isNullOrBlank()
        binding.homeError.text = msg.orEmpty()
    }

    private fun String?.ifNullOrBlank(fallback: String) = if (this.isNullOrBlank()) fallback else this
}
