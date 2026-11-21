

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Optional, Pattern


def hash_identifier(value: object, salt: Optional[str] = None) -> Optional[str]:


    if value is None:
        return None
    text = str(value).strip()
    if text == "" or text.lower() in {"nan", "none", "null", "<na>"}:
        return None
    payload = f"{salt or ''}{text}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


_PHONE_ID = r"(?:\+62|62|0)8[1-9][0-9\-\s]{6,13}"

_LONG_DIGITS = r"\b\d{7,}\b"


@dataclass
class PIIScrubber:


    url_token: str = "<URL>"
    email_token: str = "<EMAIL>"
    phone_token: str = "<PHONE>"
    nik_token: str = "<NIK>"
    handle_token: str = "<USER>"

    _url: Pattern = field(init=False, repr=False)
    _email: Pattern = field(init=False, repr=False)
    _handle: Pattern = field(init=False, repr=False)
    _nik: Pattern = field(init=False, repr=False)
    _phone: Pattern = field(init=False, repr=False)
    _long_digits: Pattern = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._url = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)
        self._email = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b", re.IGNORECASE)
        self._handle = re.compile(r"@\w+")
        self._nik = re.compile(r"\b\d{16}\b")
        self._phone = re.compile(_PHONE_ID)
        self._long_digits = re.compile(_LONG_DIGITS)

    def scrub(self, text: object) -> str:
        if text is None:
            return ""
        s = str(text)
        if s.strip() == "":
            return ""

        s = self._url.sub(self.url_token, s)
        s = self._email.sub(self.email_token, s)
        s = self._handle.sub(self.handle_token, s)
        s = self._nik.sub(self.nik_token, s)
        s = self._phone.sub(self.phone_token, s)
        s = self._long_digits.sub(self.phone_token, s)
        return s


_DEFAULT_SCRUBBER = PIIScrubber()


def scrub_pii(text: object) -> str:
    return _DEFAULT_SCRUBBER.scrub(text)
