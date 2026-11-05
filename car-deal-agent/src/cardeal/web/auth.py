"""Who may use the app.

Two ways in, both ending in a signed cookie (valid SESSION_DAYS):
- Email: the user types their address, gets a six-digit code (and a one-tap link) by email and is
  signed in. ALLOWED_EMAILS can limit who may sign up, ADMIN_EMAILS names the owner(s).
- Access codes: the owner hands out codes (ACCESS_CODES=name:code,...), ADMIN_CODE is the owner's.

Every account has a daily AI allowance, and all accounts together a daily cap, so nobody runs up
the API bill. Without email sending and without codes the app is open to everyone (fine on your own
machine); the allowance then applies to all visitors together."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import threading
import time
from dataclasses import dataclass, field
from datetime import date

from cardeal.web.jobs import UserFacingError

COOKIE = "cd_session"
SESSION_DAYS = 30
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")


@dataclass(frozen=True)
class Account:
    id: str  # stable, derived from the code or email (never the code itself)
    name: str
    admin: bool = False
    email: str = ""


def parse_codes(spec: str | None) -> dict[str, Account]:
    """'Mohamad:secret1,Kha:secret2' -> {code: Account}. A code without a name gets "user N"."""
    codes: dict[str, Account] = {}
    for number, entry in enumerate(filter(None, (part.strip() for part in (spec or "").split(","))), 1):
        name, _, code = entry.rpartition(":")
        code, name = code.strip(), name.strip() or f"user {number}"
        if code:
            codes[code] = Account(id=hashlib.sha256(code.encode()).hexdigest()[:12], name=name)
    return codes


def normalize_email(raw: str) -> str | None:
    email = (raw or "").strip().lower()
    return email if len(email) <= 254 and EMAIL_RE.match(email) else None


def email_list(spec: str | None) -> list[str]:
    return [entry.strip().lower() for entry in (spec or "").replace(";", ",").split(",") if entry.strip()]


@dataclass
class _Pending:
    digest: str
    expires: float
    attempts: int = 0


@dataclass
class EmailLogin:
    """One-time codes by email. Pending codes live in memory: a restart only means asking for a new one."""

    mailer: object  # cardeal.web.mail.Mailer
    secret: bytes
    allowed: list[str] = field(default_factory=list)  # emails or "@domain"; empty = anyone
    admins: list[str] = field(default_factory=list)
    code_minutes: int = 10
    max_attempts: int = 5
    resend_seconds: int = 45
    per_email_hour: int = 6
    per_ip_hour: int = 15
    clock: object = time.time

    def __post_init__(self):
        self._pending: dict[str, _Pending] = {}
        self._sent: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def may_use(self, email: str) -> bool:
        if not self.allowed:
            return True
        domain = "@" + email.split("@", 1)[1]
        return email in self.allowed or domain in self.allowed

    def account(self, email: str) -> Account:
        return Account(id=hashlib.sha256(email.encode()).hexdigest()[:12], name=email, admin=email in self.admins,
                       email=email)

    def _digest(self, email: str, code: str) -> str:
        return hmac.new(self.secret, f"{email}:{code}".encode(), hashlib.sha256).hexdigest()

    def _recent(self, key: str, now: float) -> list[float]:
        times = [t for t in self._sent.get(key, []) if now - t < 3600]
        self._sent[key] = times
        return times

    def request_code(self, raw_email: str, ip: str) -> tuple[str, str]:
        """Checks address and limits, returns (email, code) to send. Raises UserFacingError."""
        email = normalize_email(raw_email)
        if email is None:
            raise UserFacingError("bad_email")
        if not self.may_use(email):
            raise UserFacingError("not_allowed")
        now = self.clock()
        with self._lock:
            by_email, by_ip = self._recent(f"e:{email}", now), self._recent(f"i:{ip}", now)
            if by_email and now - by_email[-1] < self.resend_seconds:
                raise UserFacingError("too_soon", seconds=int(self.resend_seconds - (now - by_email[-1])) + 1)
            if len(by_email) >= self.per_email_hour or len(by_ip) >= self.per_ip_hour:
                raise UserFacingError("too_many_codes")
            code = f"{secrets.randbelow(1_000_000):06d}"
            self._pending[email] = _Pending(self._digest(email, code), now + self.code_minutes * 60)
            by_email.append(now)
            by_ip.append(now)
        return email, code

    def erase(self, email: str) -> None:
        """Account deleted: a pending code and the address's send times go (the per-IP limit stays)."""
        with self._lock:
            self._pending.pop(email, None)
            self._sent.pop(f"e:{email}", None)

    def forget(self, email: str) -> None:
        """The code could not be sent: let the user try again right away."""
        with self._lock:
            self._pending.pop(email, None)
            times = self._sent.get(f"e:{email}", [])
            if times:
                times.pop()

    def verify(self, raw_email: str, code: str) -> Account:
        email = normalize_email(raw_email)
        code = re.sub(r"\D", "", code or "")
        now = self.clock()
        with self._lock:
            pending = self._pending.get(email or "")
            if email is None or pending is None or pending.expires < now:
                raise UserFacingError("code_expired")
            pending.attempts += 1
            if not hmac.compare_digest(pending.digest, self._digest(email, code)):
                if pending.attempts >= self.max_attempts:
                    del self._pending[email]
                    raise UserFacingError("code_expired")
                raise UserFacingError("code_wrong", left=self.max_attempts - pending.attempts)
            del self._pending[email]
        if not self.may_use(email):
            raise UserFacingError("not_allowed")
        return self.account(email)


class Access:
    def __init__(self, codes: str | None, secret: str | None, admin_code: str | None = None,
                 ai_daily_limit: int = 40, chat_daily_limit: int = 150, email: EmailLogin | None = None,
                 ai_global_limit: int = 400, chat_global_limit: int = 3000):
        self.codes = parse_codes(codes)
        if admin_code:
            admin = Account(id=hashlib.sha256(admin_code.encode()).hexdigest()[:12], name="admin", admin=True)
            self.codes[admin_code] = admin
        self.secret = (secret or secrets.token_hex(32)).encode()
        self.email = email
        self.ai_daily_limit = ai_daily_limit
        self.chat_daily_limit = chat_daily_limit
        self.global_limits = {"ai": ai_global_limit, "chat": chat_global_limit}
        self._usage: dict[tuple[str, str, str], int] = {}
        self._names: dict[str, str] = {}
        self._lock = threading.Lock()

    @property
    def open(self) -> bool:
        return not self.codes and self.email is None

    @property
    def methods(self) -> list[str]:
        return (["email"] if self.email else []) + (["code"] if self.codes else [])

    def login(self, code: str) -> Account | None:
        for known, account in self.codes.items():
            if hmac.compare_digest(known.encode(), code.strip().encode()):
                return account
        return None

    def token(self, account: Account) -> str:
        data = {"id": account.id, "name": account.name, "admin": account.admin,
                "exp": int(time.time()) + SESSION_DAYS * 86400}
        if account.email:
            data["email"] = account.email
        payload = base64.urlsafe_b64encode(json.dumps(data).encode()).decode()
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
        if email := data.get("email"):
            # Admin rights and sign-up rules are read again, so changing them takes effect at once.
            if self.email is None or not self.email.may_use(email):
                return None
            return self.email.account(email)
        if not any(a.id == data.get("id") for a in self.codes.values()):
            return None  # the code was removed from ACCESS_CODES
        return Account(id=data["id"], name=data.get("name", ""), admin=bool(data.get("admin")))

    def _sign(self, payload: str) -> str:
        return hmac.new(self.secret, payload.encode(), hashlib.sha256).hexdigest()[:32]

    def _keys(self, account: Account, kind: str) -> tuple[tuple[str, str, str], tuple[str, str, str], int]:
        today = date.today().isoformat()
        limit = self.ai_daily_limit if kind == "ai" else self.chat_daily_limit
        return (account.id, kind, today), ("*", kind, today), limit

    def _used_up(self, account: Account, kind: str) -> bool:
        key, total, limit = self._keys(account, kind)
        return not account.admin and (self._usage.get(key, 0) >= limit
                                      or self._usage.get(total, 0) >= self.global_limits[kind])

    def has_allowance(self, account: Account, kind: str) -> bool:
        """Whether `use` would allow one more call now; counts nothing."""
        with self._lock:
            return not self._used_up(account, kind)

    def use(self, account: Account, kind: str) -> bool:
        """Counts one AI call of `kind` ("ai" or "chat") for today; False when the account's allowance
        or the daily cap of all accounts together is used up (the owner has neither)."""
        key, total, _ = self._keys(account, kind)
        with self._lock:
            if self._used_up(account, kind):
                return False
            self._usage[key] = self._usage.get(key, 0) + 1
            self._names[account.id] = account.name
            if not account.admin:
                self._usage[total] = self._usage.get(total, 0) + 1
            return True

    def erase(self, account: Account) -> None:
        """Deletes what the server keeps about an account: its usage counts and, for an email
        account, its sign-in data. The day totals of all accounts together stay (no person in them)."""
        with self._lock:
            for key in [key for key in self._usage if key[0] == account.id]:
                del self._usage[key]
            self._names.pop(account.id, None)
        if self.email is not None and account.email:
            self.email.erase(account.email)

    def usage(self, account: Account) -> dict:
        today = date.today().isoformat()
        return {kind: {"used": self._usage.get((account.id, kind, today), 0),
                       "limit": self.ai_daily_limit if kind == "ai" else self.chat_daily_limit}
                for kind in ("ai", "chat")}

    def report(self) -> list[dict]:
        """Per account and day, for the owner."""
        rows: dict[tuple[str, str], dict] = {}
        names = {**self._names, **{a.id: a.name for a in self.codes.values()}}
        for (account_id, kind, day), count in self._usage.items():
            if account_id == "*":
                continue
            row = rows.setdefault((account_id, day), {"name": names.get(account_id, account_id), "day": day})
            row[kind] = count
        return sorted(rows.values(), key=lambda r: (r["day"], r["name"]), reverse=True)
