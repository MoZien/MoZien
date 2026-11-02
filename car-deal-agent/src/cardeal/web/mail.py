"""Sends the login code by email: through Gmail (or any SMTP server) or through Brevo's HTTPS API.

Render's free instances block outgoing SMTP, so there only Brevo works; on a paid instance a Gmail
app password is enough. Environment:
  GMAIL_USER, GMAIL_APP_PASSWORD   send from this Gmail account (smtp.gmail.com, port 465)
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD   any other SMTP server (port 465 or 587)
  BREVO_API_KEY                    send through brevo.com instead (works on Render's free plan)
  MAIL_FROM                        sender, e.g. "AutoHalle <name@gmail.com>" (default: the Gmail/SMTP user)
"""

from __future__ import annotations

import html
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, parseaddr
from typing import Protocol

import requests

log = logging.getLogger(__name__)


class MailError(Exception):
    pass


class Mailer(Protocol):
    def send(self, to: str, subject: str, text: str, html_body: str) -> None: ...


class SmtpMailer:
    def __init__(self, host: str, port: int, user: str, password: str, sender: str):
        self.host, self.port, self.user, self.password, self.sender = host, port, user, password, sender

    def send(self, to: str, subject: str, text: str, html_body: str) -> None:
        message = EmailMessage()
        message["From"], message["To"], message["Subject"] = self.sender, to, subject
        message.set_content(text)
        message.add_alternative(html_body, subtype="html")
        try:
            if self.port == 465:
                with smtplib.SMTP_SSL(self.host, self.port, timeout=20, context=ssl.create_default_context()) as smtp:
                    smtp.login(self.user, self.password)
                    smtp.send_message(message)
            else:
                with smtplib.SMTP(self.host, self.port, timeout=20) as smtp:
                    smtp.starttls(context=ssl.create_default_context())
                    smtp.login(self.user, self.password)
                    smtp.send_message(message)
        except (OSError, smtplib.SMTPException) as exc:
            raise MailError(f"SMTP {self.host}:{self.port}: {exc}") from exc


class BrevoMailer:
    URL = "https://api.brevo.com/v3/smtp/email"

    def __init__(self, api_key: str, sender: str):
        self.api_key = api_key
        self.name, self.email = parseaddr(sender)

    def send(self, to: str, subject: str, text: str, html_body: str) -> None:
        payload = {"sender": {"email": self.email, "name": self.name or "AutoHalle"}, "to": [{"email": to}],
                   "subject": subject, "textContent": text, "htmlContent": html_body}
        try:
            response = requests.post(self.URL, json=payload, timeout=20,
                                     headers={"api-key": self.api_key, "accept": "application/json"})
        except requests.RequestException as exc:
            raise MailError(f"Brevo: {exc}") from exc
        if response.status_code >= 300:
            raise MailError(f"Brevo {response.status_code}: {response.text[:200]}")


def mailer_from_env(env, app_name: str = "AutoHalle") -> Mailer | None:
    """The configured way to send mail, or None (then the app falls back to access codes)."""
    def sender(default_address: str) -> str:
        name, address = parseaddr(env.get("MAIL_FROM") or "")
        return formataddr((name or app_name, address or default_address))

    if env.get("BREVO_API_KEY"):
        address = parseaddr(env.get("MAIL_FROM") or "")[1] or env.get("GMAIL_USER") or ""
        if not address:
            log.warning("BREVO_API_KEY set but no MAIL_FROM: email login disabled")
            return None
        return BrevoMailer(env["BREVO_API_KEY"].strip(), sender(address))
    if env.get("GMAIL_USER") and env.get("GMAIL_APP_PASSWORD"):
        user = env["GMAIL_USER"].strip()
        # Google shows app passwords in groups of four ("abcd efgh ..."); the spaces are not part of it.
        return SmtpMailer("smtp.gmail.com", 465, user, env["GMAIL_APP_PASSWORD"].replace(" ", ""), sender(user))
    if env.get("SMTP_HOST") and env.get("SMTP_USER") and env.get("SMTP_PASSWORD"):
        user = env["SMTP_USER"].strip()
        return SmtpMailer(env["SMTP_HOST"].strip(), int(env.get("SMTP_PORT") or 465), user, env["SMTP_PASSWORD"],
                          sender(user))
    return None


TEXTS = {
    "de": {
        "subject": "{code} ist dein Anmeldecode für {app}",
        "hello": "Hallo,",
        "code": "dein Code für {app}:",
        "valid": "Der Code gilt {minutes} Minuten. Oder öffne einfach diesen Link:",
        "button": "Jetzt anmelden",
        "ignore": "Wenn du dich nicht anmelden wolltest, ignoriere diese E-Mail.",
    },
    "en": {
        "subject": "{code} is your sign-in code for {app}",
        "hello": "Hello,",
        "code": "your code for {app}:",
        "valid": "The code is valid for {minutes} minutes. Or just open this link:",
        "button": "Sign in now",
        "ignore": "If you did not try to sign in, ignore this email.",
    },
    "ar": {
        "subject": "{code} هو كود الدخول إلى {app}",
        "hello": "أهلاً،",
        "code": "كود الدخول إلى {app}:",
        "valid": "الكود صالح لمدة {minutes} دقائق. أو افتح هالرابط مباشرة:",
        "button": "سجّل دخول هلأ",
        "ignore": "إذا ما كنت إنت اللي طلب الكود، تجاهل هالإيميل.",
    },
}


def login_email(code: str, link: str, lang: str, app: str, minutes: int) -> tuple[str, str, str]:
    """Subject, plain text and HTML of the login email."""
    t = {key: value.format(code=code, app=app, minutes=minutes) for key, value in TEXTS.get(lang, TEXTS["de"]).items()}
    text = f"{t['hello']}\n\n{t['code']} {code}\n\n{t['valid']}\n{link}\n\n{t['ignore']}\n"
    direction = "rtl" if lang == "ar" else "ltr"
    e = {key: html.escape(value) for key, value in t.items()}
    body = f"""<!doctype html><html><body style="margin:0;background:#f6f6f4;font-family:Arial,Helvetica,sans-serif">
<div dir="{direction}" style="max-width:440px;margin:0 auto;padding:32px 20px;color:#17181a">
<p style="font-size:18px;font-weight:bold;margin:0 0 24px">{html.escape(app)}</p>
<p style="margin:0 0 8px">{e['hello']}</p><p style="margin:0 0 12px">{e['code']}</p>
<p dir="ltr" style="font-size:32px;letter-spacing:8px;font-weight:bold;margin:0 0 20px">{code}</p>
<p style="margin:0 0 16px;color:#5f6268">{e['valid']}</p>
<p style="margin:0 0 28px"><a href="{html.escape(link)}" style="display:inline-block;background:#17181a;color:#fff;
text-decoration:none;padding:12px 20px;border-radius:10px">{e['button']}</a></p>
<p style="margin:0;color:#93959a;font-size:13px">{e['ignore']}</p></div></body></html>"""
    return t["subject"], text, body
