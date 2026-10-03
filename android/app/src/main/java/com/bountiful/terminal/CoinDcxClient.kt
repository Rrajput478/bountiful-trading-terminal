package com.bountiful.terminal

import org.json.JSONArray
import org.json.JSONObject
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Minimal CoinDCX REST client.
 *
 * Signed requests go over OkHttp (bundled with the app), not over `fetch` from
 * the WebView: CoinDCX sends no CORS headers, so a browser-side call is always
 * rejected. Signing happens here so the API secret is never handed to JS.
 *
 * Auth scheme (docs.coindcx.com):
 *   signature = hex( HMAC-SHA256( secret, compactJsonBody ) )
 *   headers   = X-AUTH-APIKEY, X-AUTH-SIGNATURE, Content-Type: application/json
 */
class CoinDcxClient(private val store: SecureStore) {

    private companion object {
        const val BASE = "https://api.coindcx.com"
        private val HTTP = okhttp3.OkHttpClient()
    }

    class BrokerException(message: String) : Exception(message)

    /** Signs `payload` and posts it verbatim. Returns the parsed response. */
    private fun signedPost(path: String, payload: JSONObject): JSONObject {
        val key = store.apiKey() ?: throw BrokerException("No API key stored. Add your CoinDCX key in Settings.")
        val secret = store.apiSecret() ?: throw BrokerException("No API secret stored. Add your CoinDCX key in Settings.")
        // Sign the exact bytes that go on the wire.
        val body = payload.toString()
        val signature = hmacSha256Hex(secret, body)
        val request = okhttp3.Request.Builder()
            .url(BASE + path)
            .post(okhttp3.RequestBody.create(body.toRequestBodyCompat(), okhttp3.MediaType.Companion.parse("application/json")))
            .header("X-AUTH-APIKEY", key)
            .header("X-AUTH-SIGNATURE", signature)
            .build()
        return execute(request)
    }

    /**
     * Every authenticated CoinDCX endpoint is a POST whose signed body carries
     * a millisecond `timestamp` — including the read-only ones (balances, user
     * info). There is no signed GET.
     */
    private fun signedTimestampPost(path: String): String {
        val key = store.apiKey() ?: throw BrokerException("No API key stored. Add your CoinDCX key in Settings.")
        val secret = store.apiSecret() ?: throw BrokerException("No API secret stored. Add your CoinDCX key in Settings.")
        val body = JSONObject().put("timestamp", System.currentTimeMillis()).toString()
        val request = okhttp3.Request.Builder()
            .url(BASE + path)
            .post(body.toRequestBody())
            .header("X-AUTH-APIKEY", key)
            .header("X-AUTH-SIGNATURE", hmacSha256Hex(secret, body))
            .build()
        return executeRaw(request)
    }

    private fun signedPostRaw(path: String, payload: JSONObject): JSONArray {
        val key = store.apiKey() ?: throw BrokerException("No API key stored.")
        val secret = store.apiSecret() ?: throw BrokerException("No API secret stored.")
        val body = payload.toString()
        val signature = hmacSha256Hex(secret, body)
        val request = okhttp3.Request.Builder()
            .url(BASE + path)
            .post(okhttp3.RequestBody.create(body.toRequestBodyCompat(), okhttp3.MediaType.Companion.parse("application/json")))
            .header("X-AUTH-APIKEY", key)
            .header("X-AUTH-SIGNATURE", signature)
            .build()
        return JSONArray(executeRaw(request))
    }

    private fun execute(request: okhttp3.Request): JSONObject {
        val raw = executeRaw(request)
        return try {
            JSONObject(raw)
        } catch (e: Exception) {
            throw BrokerException("Unexpected response from CoinDCX: ${raw.take(180)}")
        }
    }

    private fun executeRaw(request: okhttp3.Request): String {
        try {
            HTTP.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    throw BrokerException(
                        "CoinDCX rejected the request (HTTP ${response.code}): ${extractError(text)}",
                    )
                }
                return text
            }
        } catch (e: BrokerException) {
            throw e
        } catch (e: Exception) {
            throw BrokerException("Cannot reach CoinDCX: ${e.message}")
        }
    }

    private fun extractError(text: String): String {
        return try {
            val json = JSONObject(text)
            json.optString("error", text)
        } catch (e: Exception) {
            text.take(180)
        }
    }

    private fun hmacSha256Hex(secret: String, message: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        val bytes = mac.doFinal(message.toByteArray(Charsets.UTF_8))
        val sb = StringBuilder(bytes.size * 2)
        for (b in bytes) sb.append(String.format("%02x", b))
        return sb.toString()
    }

    private fun String.toRequestBody(): okhttp3.RequestBody =
        okhttp3.RequestBody.create(this, okhttp3.MediaType.Companion.parse("application/json"))

    // ------------------------------------------------------------------ public API

    /** Verifies the stored key against the account endpoint. */
    fun connect(): JSONObject {
        val res = JSONObject(signedTimestampPost("/exchange/v1/users/info"))
        return JSONObject().apply {
            put("success", true)
            put("user_id", res.optString("user_id"))
            put("username", res.optString("username"))
            put("email", res.optString("email"))
        }
    }

    fun balances(): JSONArray = JSONArray(signedTimestampPost("/exchange/v1/users/balances"))

    fun markets(): JSONArray {
        val req = okhttp3.Request.Builder().url(BASE + "/exchange/v1/markets").build()
        return JSONArray(executeRaw(req))
    }

    /** Places an order. `order` is the exchange-shaped order object. */
    fun createOrder(order: JSONObject): JSONArray = signedPostRaw("/exchange/v1/orders/create", order)
}