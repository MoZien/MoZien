"""Access codes: the owner gives each customer a code (ACCESS_CODES=name:code,...). The login
sets a signed cookie; each code has a daily AI allowance so nobody runs up the API bill.
Without ACCESS_CODES the app is open to everyone; the daily allowance then applies to all visitors
together, so a public link cannot run up the API bill either."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import threading
import time
from dataclasses import dataclass
from datetime import date

COOKIE = "cd_session"
SESSION_DAYS = 30


@dataclass(frozen=True)
class Account:
    id: str  # stable, derived from the code (never the code itself)
    name: str
    admin: bool = False


def parse_codes(spec: str | None) -> dict[str, Account]:
    """'Mohamad:secret1,Kha:secret2' -> {code: Account}. A code without a name gets "user N"."""
    codes: dict[str, Account] = {}
    for number, entry in enumerate(filter(None, (part.strip() for part in (spec or "").split(","))), 1):
        name, _, code = entry.rpartition(":")
        code, name = code.strip(), name.strip() or f"user {number}"
        if code:
            codes[code] = Account(id=hashlib.sha256(code.encode()).hexdigest()[:12], name=name)
    return codes


class Access:
    def __init__(self, codes: str | None, secret: str | None, admin_code: str | None = None,
                 ai_daily_limit: int = 40, chat_daily_limit: int = 150):
        self.codes = parse_codes(codes)
        if admin_code:
            admin = Account(id=hashlib.sha256(admin_code.encode()).hexdigest()[:12], name="admin", admin=True)
            self.codes[admin_code] = admin
        self.secret = (secret or secrets.token_hex(32)).encode()
        self.ai_daily_limit = ai_daily_limit
        self.chat_daily_limit = chat_daily_limit
        self._usage: dict[tuple[str, str, str], int] = {}
        self._lock = threading.Lock()

    @property
    def open(self) -> bool:
        return not self.codes

    def login(self, code: str) -> Account | None:
        for known, account in self.codes.items():
            if hmac.compare_digest(known.encode(), code.strip().encode()):
                return account
        return None

    def token(self, account: Account) -> str:
        payload = base64.urlsafe_b64encode(json.dumps(
            {"id": account.id, "name": account.name, "admin": account.admin,
             "exp": int(time.time()) + SESSION_DAYS * 86400}).encode()).decode()
        return f"{payload}.{self._sign(payload)}"

    def account(self, token: str | None) -> Account | None:
        if self.open:
            return Account(id="public", name="")
        if not token or "." not in token:
            return None
        payload, signature = token.rsplit(".", 1)
        if not hmac.compare_digest(signature, self._sign(payload)):
            return None
        try:
            data = json.loads(base64.urlsafe_b64decode(payload.encode()))
        except ValueError:
            return None
        if data.get("exp", 0) < time.time():
            return None
        if not any(a.id == data.get("id") for a in self.codes.values()):
            return None  # the code was removed from ACCESS_CODES
        return Account(id=data["id"], name=data.get("name", ""), admin=bool(data.get("admin")))

    def _sign(self, payload: str) -> str:
        return hmac.new(self.secret, payload.encode(), hashlib.sha256).hexdigest()[:32]

    def use(self, account: Account, kind: str) -> bool:
        """Counts one AI call of `kind` ("ai" or "chat") for today; False when the allowance is used up."""
        limit = self.ai_daily_limit if kind == "ai" else self.chat_daily_limit
        key = (account.id, kind, date.today().isoformat())
        with self._lock:
            if self._usage.get(key, 0) >= limit and not account.admin:
                return False
            self._usage[key] = self._usage.get(key, 0) + 1
            return True

    def usage(self, account: Account) -> dict:
        today = date.today().isoformat()
        return {kind: {"used": self._usage.get((account.id, kind, today), 0),
                       "limit": self.ai_daily_limit if kind == "ai" else self.chat_daily_limit}
                for kind in ("ai", "chat")}

    def report(self) -> list[dict]:
        """Per account and day, for the owner."""
        rows: dict[tuple[str, str], dict] = {}
        names = {a.id: a.name for a in self.codes.values()}
        for (account_id, kind, day), count in self._usage.items():
            row = rows.setdefault((account_id, day), {"name": names.get(account_id, account_id), "day": day})
            row[kind] = count
        return sorted(rows.values(), key=lambda r: (r["day"], r["name"]), reverse=True)
