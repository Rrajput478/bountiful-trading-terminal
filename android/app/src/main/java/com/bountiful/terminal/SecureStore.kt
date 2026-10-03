package com.bountiful.terminal

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Broker credentials, encrypted at rest with a hardware-backed key.
 *
 * The API secret is encrypted with an AES-256-GCM key generated inside the
 * Android Keystore. That key never leaves secure hardware and cannot be
 * extracted, so a copy of the app's SharedPreferences file (backup, root, adb
 * pull) yields ciphertext only.
 *
 * The plaintext secret exists only in local variables for the duration of a
 * single signing operation.
 */
class SecureStore(private val prefs: android.content.SharedPreferences) {

    private companion object {
        const val KEY_ALIAS = "bountiful_broker_key_v1"
        const val PREFS = "bountiful_secrets"
        const val KEY_API = "api_key"
        const val KEY_SECRET = "api_secret"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }

    private fun secretKey(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }

        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                // The key must decrypt without user interaction so orders can be
                // signed while the screen is off during a session.
                .setUserAuthenticationRequired(false)
                .build(),
        )
        return gen.generateKey()
    }

    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val iv = cipher.iv
        val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        val blob = iv + ct
        return Base64.encodeToString(blob, Base64.NO_WRAP)
    }

    private fun decrypt(encoded: String): String? = try {
        val blob = Base64.decode(encoded, Base64.NO_WRAP)
        if (blob.size <= IV_BYTES) return null
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            secretKey(),
            GCMParameterSpec(TAG_BITS, blob, 0, IV_BYTES),
        )
        String(cipher.doFinal(blob, IV_BYTES, blob.size - IV_BYTES), Charsets.UTF_8)
    } catch (e: Exception) {
        // A key rotation or a wiped keystore leaves undecryptable data behind.
        // Treat that as "no credentials" rather than crashing the bridge.
        null
    }

    fun save(apiKey: String, apiSecret: String) {
        prefs.edit()
            .putString(KEY_API, encrypt(apiKey))
            .putString(KEY_SECRET, encrypt(apiSecret))
            .apply()
    }

    fun apiKey(): String? = prefs.getString(KEY_API, null)?.let { decrypt(it) }

    fun apiSecret(): String? = prefs.getString(KEY_SECRET, null)?.let { decrypt(it) }

    fun hasCredentials(): Boolean = apiKey() != null && apiSecret() != null

    fun clear() {
        prefs.edit().clear().apply()
    }
}