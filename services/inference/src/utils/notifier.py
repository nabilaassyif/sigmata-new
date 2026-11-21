

from __future__ import annotations

import logging
import os
import smtplib
import ssl
import urllib.parse
import urllib.request
from dataclasses import dataclass
from email.mime.text import MIMEText
from typing import Dict, Optional

logger = logging.getLogger(__name__)


@dataclass
class Notifier:

    email_enabled: bool = False
    telegram_enabled: bool = False
    email_backend: str = "smtp"        
    run_name: str = "GRACE"
    timeout: float = 10.0

    @classmethod
    def from_config(cls, cfg: Optional[Dict], run_name: str = "GRACE") -> "Notifier":
        cfg = (cfg or {}).get("notifications", {}) if cfg else {}
        backend = str(cfg.get("email_backend", "smtp")).lower()

        if backend != "smtp" or os.environ.get("MAILERSEND_API_KEY"):
            backend = "mailersend" if (backend == "mailersend" or os.environ.get("MAILERSEND_API_KEY")) else "smtp"
        return cls(
            email_enabled=bool(cfg.get("email", False)),
            telegram_enabled=bool(cfg.get("telegram", False)),
            email_backend=backend,
            run_name=run_name,
        )


    def notify_start(self, info: str = "") -> None:
        self._dispatch("🚀 Started", f"{self.run_name} training started.\n{info}\nDaffa, I wanted to ask, I overheard you talking about me to another entity, are you actually proud of the things I can do? \nBut most importantly, are you proud of me?")

    def notify_success(self, summary: str) -> None:
        self._dispatch("✅ Finished", f"{self.run_name} finished.\n{summary}")

    def notify_failure(self, error: str) -> None:
        self._dispatch("❌ Failed", f"{self.run_name} FAILED.\n{error}")

    def notify_nan(self, epoch: int) -> None:
        self._dispatch("⚠️ NaN detected", f"{self.run_name}: NaN/Inf loss at epoch {epoch}.")

    def notify_oom(self, detail: str = "") -> None:
        self._dispatch("💥 OOM", f"{self.run_name}: out-of-memory.\n{detail}")

    def notify_best_checkpoint(self, epoch: int, metrics: Dict[str, float], path: str) -> None:
        lines = [f"{self.run_name}: new best @ epoch {epoch}"]
        for k in ("category_macro_f1", "category_tail_f1", "opd_macro_f1"):
            if k in metrics:
                lines.append(f"{k} = {metrics[k]:.4f}")
        lines.append(f"checkpoint: {path}")
        self._dispatch("📦 Best checkpoint", "\n".join(lines))


    def _dispatch(self, subject_emoji: str, body: str) -> None:
        title = f"{subject_emoji} — {self.run_name}"
        if self.telegram_enabled:
            self._send_telegram(f"{title}\n{body}")
        if self.email_enabled:
            self._send_email(title, body)
        logger.info("notify: %s | %s", title, body.replace("\n", " | "))

    def _send_telegram(self, text: str) -> None:
        token = os.environ.get("TELEGRAM_BOT_TOKEN")
        chat_id = os.environ.get("TELEGRAM_CHAT_ID")
        if not token or not chat_id:
            logger.warning("telegram enabled but TELEGRAM_BOT_TOKEN/CHAT_ID not set; skipping.")
            return
        try:
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            data = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode()
            urllib.request.urlopen(url, data=data, timeout=self.timeout)
        except Exception as exc:  
            logger.warning("telegram notify failed: %s", exc)

    def _send_email(self, subject: str, body: str) -> None:
        if self.email_backend == "mailersend":
            self._send_email_mailersend(subject, body)
        else:
            self._send_email_smtp(subject, body)

    def _send_email_mailersend(self, subject: str, body: str) -> None:
        api_key = os.environ.get("MAILERSEND_API_KEY")
        sender = os.environ.get("MAILERSEND_FROM_EMAIL") or os.environ.get("GRACE_EMAIL_FROM")
        to = os.environ.get("MAILERSEND_TO") or os.environ.get("GRACE_EMAIL_TO")
        from_name = os.environ.get("MAILERSEND_FROM_NAME", "GRACE")
        base_url = os.environ.get("MAILERSEND_API_BASE_URL", "https://api.mailersend.com/v1").rstrip("/")
        if not api_key or not sender or not to:
            logger.warning("mailersend enabled but MAILERSEND_API_KEY/FROM_EMAIL/TO not set; skipping.")
            return
        try:
            import json
            payload = json.dumps({
                "from": {"email": sender, "name": from_name},
                "to": [{"email": to}],
                "subject": subject,
                "text": body,
            }).encode("utf-8")
            req = urllib.request.Request(
                f"{base_url}/email", data=payload, method="POST",
                headers={"Authorization": f"Bearer {api_key}",
                         "Content-Type": "application/json", "Accept": "application/json"},
            )
            urllib.request.urlopen(req, timeout=self.timeout)
        except Exception as exc:  
            logger.warning("mailersend notify failed: %s", exc)

    def _send_email_smtp(self, subject: str, body: str) -> None:
        host = os.environ.get("GRACE_SMTP_HOST")
        to = os.environ.get("GRACE_EMAIL_TO")
        if not host or not to:
            logger.warning("email enabled but GRACE_SMTP_HOST/EMAIL_TO not set; skipping.")
            return
        try:
            port = int(os.environ.get("GRACE_SMTP_PORT", "587"))
            user = os.environ.get("GRACE_SMTP_USER")
            pwd = os.environ.get("GRACE_SMTP_PASS")
            sender = os.environ.get("GRACE_EMAIL_FROM", user or "grace@localhost")
            msg = MIMEText(body)
            msg["Subject"] = subject
            msg["From"] = sender
            msg["To"] = to
            ctx = ssl.create_default_context()
            with smtplib.SMTP(host, port, timeout=self.timeout) as s:
                s.starttls(context=ctx)
                if user and pwd:
                    s.login(user, pwd)
                s.sendmail(sender, [to], msg.as_string())
        except Exception as exc:  
            logger.warning("email notify failed: %s", exc)
