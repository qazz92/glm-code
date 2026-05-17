"""Small Python module for multi-language GLM Code checks."""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class TextStats:
    words: int
    characters: int
    unique_words: int


def analyze_text(text: str) -> TextStats:
    words = re.findall(r"[A-Za-z0-9']+", text.lower())
    return TextStats(
        words=len(words),
        characters=len(text),
        unique_words=len(set(words)),
    )
