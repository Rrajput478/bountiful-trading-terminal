package com.bountiful.terminal

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject

/**
 * Hosts the terminal UI in a WebView and exposes the CoinDCX bridge.
 *
 * The WebView runs the same built React app the browser serves. It talks to the
 * broker only through [BrokerBridge], so the API secret stays in Kotlin. JS
 * receives JSON results and error messages, never credentials.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var store: SecureStore

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        store = SecureStore(getSharedPreferences("bountiful_secrets", MODE_PRIVATE))

        web = WebView(this)
        val s: WebSettings = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        // The bundle is shipped in assets, so no file:// or content:// escape is
        // needed. Loading a remote origin would defeat the local-bundle model.
        s.allowFileAccess = false
        s.allowContentAccess = false
        setContentView(web)

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // Nothing should navigate away from the bundled app.
                return true
            }
        }

        web.addJavascriptInterface(BrokerBridge(this, store), "BountifulBroker")
        web.loadUrl("file:///android_asset/public/index.html")
    }

    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}

/**
 * The JavaScript-facing surface, injected as `window.BountifulBroker`.
 *
 * Every method returns a JSON-encoded result. Success is
 * `{"ok":true,...}`; failure is `{"ok":false,"error":"..."}`. The API key and
 * secret are write-only from JS: they can be saved or cleared, never read back.
 */
class BrokerBridge(
    private val activity: MainActivity,
    private val store: SecureStore,
) {
    private val client by lazy { CoinDcxClient(store) }

    private fun run(block: () -> String): String = try {
        block()
    } catch (e: Exception) {
        JSONObject().apply {
            put("ok", false)
            put("error", e.message ?: e.javaClass.simpleName)
        }.toString()
    }

    private fun ok(json: JSONObject): String {
        json.put("ok", true)
        return json.toString()
    }

    @JavascriptInterface
    fun hasCredentials(): String = run {
        JSONObject().apply {
            put("configured", store.hasCredentials())
            put("broker", "coindcx")
        }.toString()
    }

    @JavascriptInterface
    fun saveCredentials(apiKey: String, apiSecret: String): String = run {
        require(apiKey.isNotBlank()) { "API key is empty." }
        require(apiSecret.isNotBlank()) { "API secret is empty." }
        store.save(apiKey, apiSecret)
        JSONObject().apply { put("configured", true) }.toString()
    }

    @JavascriptInterface
    fun clearCredentials(): String = run {
        store.clear()
        JSONObject().apply { put("configured", false) }.toString()
    }

    @JavascriptInterface
    fun connect(): String = run {
        val info = client.connect()
        ok(info)
    }

    @JavascriptInterface
    fun balances(): String = run {
        // Normalise the exchange shape into the frontend's Balance contract.
        val raw: JSONArray = client.balances()
        val out = JSONArray()
        for (i in 0 until raw.length()) {
            val b = raw.getJSONObject(i)
            val balance = b.optDouble("balance", 0.0)
            val locked = b.optDouble("locked_balance", 0.0)
            out.put(
                JSONObject().apply {
                    put("currency", b.optString("currency"))
                    put("balance", balance)
                    put("usedMargin", locked)
                    put("available", balance - locked)
                },
            )
        }
        ok(JSONObject().apply { put("balances", out) })
    }

    @JavascriptInterface
    fun placeOrder(orderJson: String): String = run {
        val order = JSONObject(orderJson)
        val response = client.createOrder(order)
        ok(JSONObject().apply { put("response", response) })
    }
}