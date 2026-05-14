import base64
import hashlib
import hmac
import time
import uuid
import requests
from urllib.parse import urlencode
from config import Config


class InterswitchClient:
    """
    Interswitch Webpay payment client.

    Fix log:
    - urlencode() used for all query-string building (prevents WAF rejection)
    - callback_url must be a clean URL with NO query params (caller's responsibility)
    - Only site_redirect_url is sent (removed duplicate redirect_url param)
    - HMAC sign string corrected (no colon separator)
    - Token cache moved to instance-safe pattern with Redis fallback note
    """

    # ── OAuth token cache (per-process; see note below on multi-worker) ───────
    # WARNING: If running Gunicorn with multiple workers, each worker maintains
    # its own cache and will fetch separate tokens. For production with 2+ workers,
    # move token caching to Redis:
    #   r.setex('isw_token', expires_in - 30, token)
    _token: str | None = None
    _token_expires_at: float = 0.0

    # ── Interswitch Webpay hosted-page base URL ───────────────────────────────
    @classmethod
    def _webpay_url(cls) -> str:
        """Return the correct Webpay URL based on environment."""
        env = getattr(Config, 'ENVIRONMENT', 'sandbox').lower()
        if env == 'production':
            return "https://webpay.interswitchng.com/collections/w/pay"
        return "https://sandbox.interswitchng.com/collections/w/pay"

    @classmethod
    def _requery_base(cls) -> str:
        env = getattr(Config, 'ENVIRONMENT', 'sandbox').lower()
        if env == 'production':
            return "https://webpay.interswitchng.com"
        return "https://sandbox.interswitchng.com"

    # ── OAuth token ───────────────────────────────────────────────────────────
    @classmethod
    def _get_token(cls) -> str:
        """
        Fetch (or return cached) an OAuth2 Bearer token.
        Interswitch uses the client_credentials grant.
        """
        now = time.time()
        if cls._token and now < cls._token_expires_at - 30:
            return cls._token

        client_id     = Config.INTERSWITCH_CLIENT_ID
        client_secret = Config.INTERSWITCH_CLIENT_SECRET
        base_url      = cls._requery_base()

        credentials = base64.b64encode(
            f"{client_id}:{client_secret}".encode()
        ).decode()

        resp = requests.post(
            f"{base_url}/passport/oauth/token",
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type":  "application/x-www-form-urlencoded",
            },
            data={
                "grant_type": "client_credentials",
                "scope":      "profile",
            },
            timeout=30,
        )
        resp.raise_for_status()
        body = resp.json()

        cls._token            = body["access_token"]
        cls._token_expires_at = now + int(body.get("expires_in", 3600))
        return cls._token

    # ── HMAC-SHA512 signature ─────────────────────────────────────────────────
    @classmethod
    def _sign(cls, nonce: str, timestamp: str) -> str:
        """
        Build the Interswitch HMAC-SHA512 signature for Requery requests.

        FIX: Removed the erroneous colon separator in the sign string.
        Correct format: clientId + nonce + timestamp + base64(sha512(body))
        For GET requests, body is empty string.
        """
        client_id = Config.INTERSWITCH_CLIENT_ID
        secret    = Config.INTERSWITCH_CLIENT_SECRET

        body_hash = hashlib.sha512(b"").digest()
        body_b64  = base64.b64encode(body_hash).decode()

        # FIX: No colon — concatenate all parts directly
        sign_str  = f"{client_id}{nonce}{timestamp}{body_b64}"

        signature = hmac.new(
            secret.encode(), sign_str.encode(), hashlib.sha512
        ).digest()
        return base64.b64encode(signature).decode()

    # ── Pay-Item resolution ───────────────────────────────────────────────────
    @classmethod
    def _pay_item_id(cls, payment_type: str) -> str:
        """
        Single source of truth for pay item ID resolution.
        Keeps this logic out of applicant.py entirely.
        """
        mapping = {
            "application_fee": Config.INTERSWITCH_PAY_ITEM_ID_APP,
            "acceptance_fee":  Config.INTERSWITCH_PAY_ITEM_ID_ACC,
            "tuition":         Config.INTERSWITCH_PAY_ITEM_ID_TUI,
        }
        pay_item = mapping.get(payment_type)
        if not pay_item:
            raise ValueError(
                f"No pay_item_id configured for payment_type '{payment_type}'. "
                f"Check your .env file."
            )
        return pay_item

    # ── Build Webpay redirect URL ─────────────────────────────────────────────
    @classmethod
    def build_redirect_url(
        cls,
        payment_type:   str,
        amount_naira:   float,
        reference_no:   str,
        customer_name:  str,
        customer_email: str,
        callback_url:   str, 
    ) -> dict:

        if '?' in callback_url:
            raise ValueError(
                "callback_url must not contain query parameters. "
                "Interswitch's WAF will reject the request. "
                f"Received: {callback_url}"
            )

        pay_item_id   = cls._pay_item_id(payment_type)
        merchant_code = Config.INTERSWITCH_MERCHANT_CODE
        amount_kobo   = (round(amount_naira * 100))

        params = {
            "merchantcode":      merchant_code,
            "payitemid":         pay_item_id,
            "amount":            str(amount_kobo),
            "txnref":            reference_no,
            "name":              customer_name,
            "email":             customer_email,
            "cust_id":           customer_email,
            "currency":          "566",
            "site_redirect_url": callback_url,
        }

        # FIX: urlencode handles special chars in name/email/URL safely
        query_string = urlencode(params)
        redirect_url = f"{cls._webpay_url()}?{query_string}"

        return {
            "redirect_url": redirect_url,
            "reference_no": reference_no,
            "amount_kobo":  amount_kobo,
        }

    # ── Requery (verify) a transaction ────────────────────────────────────────
    @classmethod
    def requery_transaction(cls, reference_no: str, amount_kobo: int) -> dict:
        """
        Query Interswitch to verify whether a transaction actually succeeded.

        Returns the raw Interswitch JSON response.
        Key response codes:
            "00" → successful
            "T0" → pending / not yet processed
            anything else → failed
        """
        base_url = cls._requery_base()
        url_path = (
            f"/collections/api/v1/gettransaction.json"
            f"?transactionreference={reference_no}&amount={amount_kobo}"
        )
        full_url = f"{base_url}{url_path}"

        token     = cls._get_token()
        nonce     = uuid.uuid4().hex
        timestamp = str(int(time.time()))

        # FIX: _sign() now uses corrected signature format
        signature = cls._sign(nonce, timestamp)

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type":  "application/json",
            "Nonce":         nonce,
            "Timestamp":     timestamp,
            "Signature":     signature,
        }

        resp = requests.get(full_url, headers=headers, timeout=30)

        # 404 from Interswitch = not found / still pending
        if resp.status_code == 404:
            return {
                "ResponseCode":        "T0",
                "ResponseDescription": "Transaction not found or still pending",
            }

        resp.raise_for_status()
        return resp.json()