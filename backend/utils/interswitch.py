import base64
import hashlib
import hmac
import time
import uuid
import requests
from config import Config


class InterswitchClient:
    """
    Interswitch payment client — inline checkout edition.

    Responsibilities:
    - Resolve pay_item_id per payment type (_pay_item_id)
    - Verify transactions server-side via requery API (requery_transaction)

    The redirect/Webpay URL builder has been removed; the inline checkout
    SDK (loaded client-side) handles the payment modal entirely.
    """

    # ── OAuth token cache ─────────────────────────────────────────────────────
    _token: str | None = None
    _token_expires_at: float = 0.0

    @classmethod
    def _requery_base(cls) -> str:
        return Config.INTERSWITCH_BASE_URL

    # ── OAuth token ───────────────────────────────────────────────────────────
    @classmethod
    def _get_token(cls) -> str:
        now = time.time()
        if cls._token and now < cls._token_expires_at - 30:
            return cls._token

        client_id     = Config.INTERSWITCH_CLIENT_ID
        client_secret = Config.INTERSWITCH_CLIENT_SECRET

        credentials = base64.b64encode(
            f"{client_id}:{client_secret}".encode()
        ).decode()

        # OAuth token lives on passport.interswitchng.com regardless of the
        # collections API base URL.
        resp = requests.post(
            "https://passport.interswitchng.com/passport/oauth/token",
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type":  "application/x-www-form-urlencoded",
            },
            data={"grant_type": "client_credentials", "scope": "profile"},
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
        client_id = Config.INTERSWITCH_CLIENT_ID
        secret    = Config.INTERSWITCH_CLIENT_SECRET
        body_b64  = base64.b64encode(hashlib.sha512(b"").digest()).decode()
        sign_str  = f"{client_id}{nonce}{timestamp}{body_b64}"
        return base64.b64encode(
            hmac.new(secret.encode(), sign_str.encode(), hashlib.sha512).digest()
        ).decode()

    # ── Pay-item resolution ───────────────────────────────────────────────────
    @classmethod
    def _pay_item_id(cls, payment_type: str) -> str:
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

    # ── Server-side transaction verification ──────────────────────────────────
    @classmethod
    def requery_transaction(cls, reference_no: str, amount_kobo: int) -> dict:
        base_url      = cls._requery_base()
        merchant_code = Config.INTERSWITCH_MERCHANT_CODE
        full_url = (
            f"{base_url}/collections/api/v1/gettransaction.json"
            f"?transactionreference={reference_no}"
            f"&amount={amount_kobo}"
            f"&merchantcode={merchant_code}"
        )
        token     = cls._get_token()
        nonce     = uuid.uuid4().hex
        timestamp = str(int(time.time()))

        resp = requests.get(full_url, headers={
            "Authorization": f"Bearer {token}",
            "Content-Type":  "application/json",
            "Nonce":         nonce,
            "Timestamp":     timestamp,
            "Signature":     cls._sign(nonce, timestamp),
        }, timeout=30)

        if resp.status_code == 404:
            return {
                "ResponseCode":        "T0",
                "ResponseDescription": "Transaction not found or still pending",
            }

        resp.raise_for_status()
        return resp.json()