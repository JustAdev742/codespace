#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ghost Typer
===========

Paste text in, pick a speed, hit start, then click wherever you want the text
to appear. After the countdown it types it for you, like a person would.

There is no list of typos in here. There is a model of eight fingers resting
on the home row, and every keystroke is a reach from wherever that finger
currently sits to wherever the key is. The reach carries spatial error that
grows with distance and speed, so when a stroke goes wrong the key that gets
hit is whichever one the finger actually landed on. Long reaches to the number
row go wrong more often than home-row keys, and they go wrong in the direction
the finger was travelling. The other failure modes are about timing: two hands
firing out of order, a press that doesn't complete, a key that bounces, a
shift released a beat late, a whole hand set down one column off.

How often that happens is the accuracy dial. What happens, and where it lands,
comes out of the simulation.

Requirements
------------
    Python 3.9+ and two packages, no admin rights needed:

        pip install --user pynput pywebview

    pywebview draws the window with the web engine the OS already has
    (WebView2 on Windows, WebKit on macOS). On Linux it wants
    python3-gi and gir1.2-webkit2-4.1, or PyQt with QtWebEngine.

    To make a double-clickable app instead, run build.py (see its notes).

Run
---
    python ghost_typer.py               # open the app
    python ghost_typer.py --selftest    # check the engine, no GUI needed
    python ghost_typer.py --dump-ui ui.html   # write the page out to look at
    python ghost_typer.py --debug       # open the web inspector alongside

    A short tour runs the first time; the ? in the corner replays it.
    If it misbehaves, ~/.ghost_typer.log has the trail.

Pausing and stopping
--------------------
    Esc  pauses and hides this window completely, holding its place. Press
         it again and the window comes back, gives you five seconds to click
         into your document, then carries on from exactly where it stopped.
    F9   stops for good.

    Both work while another window is focused, and both can be reassigned by
    clicking them in the app. A hotkey has to be a key the typer never sends
    itself, so Esc, the function keys, Insert and Home are fine; letters and
    digits are not.

Tables
------
    Set Send as to one of the table options and paste a grid: a markdown pipe
    table, something copied out of a spreadsheet, or plain CSV. It reads the
    grid, squares it up, tells you what it found, and types cell by cell.

    Tab is already the "next cell" key almost everywhere. In a Word or Docs
    table it wraps to the first cell of the next row by itself, so rows need
    no Enter; Excel and Sheets need Enter to drop a row. Pick whichever
    matches. Click the first cell during the countdown and let it run.

    Cell moves are counted, not aimed, so one row with a missing cell would
    shift every cell after it. Short rows are padded and over-wide rows are
    folded back so the count stays honest all the way to the bottom, and the
    columns stepper can force a width to match a table that already exists.

Notes
-----
  * macOS asks for Accessibility permission the first time (System Settings ->
    Privacy & Security -> Accessibility). That is a permission, not an admin
    install.
  * Linux needs an X11 session; Wayland blocks synthetic key events.
  * In chat apps, set the Enter key to Shift+Enter so line breaks don't send
    the message early.
  * In Word, turn off AutoCorrect first (File -> Options -> Proofing) or it
    will quietly rewrite things mid-run.
"""

from __future__ import annotations

import csv
import io
import json
import math
import os
import queue
import random
import re
import sys
import threading
import time
from dataclasses import dataclass

# --------------------------------------------------------------------------
# Optional dependency: pynput drives the actual keyboard. The engine below
# works without it, so --selftest runs anywhere.
# --------------------------------------------------------------------------
try:
    from pynput.keyboard import (Controller as KbController, Key as KbKey,
                                 Listener as KbListener)
    PYNPUT_ERROR = None
except Exception as _exc:  # pragma: no cover
    KbController = KbKey = KbListener = None
    PYNPUT_ERROR = f"{type(_exc).__name__}: {_exc}"


MECHANISM_NAMES = {
    "slip": "landed on the wrong key",
    "swap": "hands fired out of order",
    "drop": "press never completed",
    "bounce": "key bounced",
    "shift": "shift mistimed",
    "run": "hand set down off-column",
    "space": "thumb out of step",
}

# ==========================================================================
#  The keyboard, physically
# ==========================================================================

_ROWS = [
    "`1234567890-=",
    "qwertyuiop[]\\",
    "asdfghjkl;'",
    "zxcvbnm,./",
]
# Rows on a real keyboard are offset from each other; without this the
# diagonal reaches come out wrong and so do the slips.
_ROW_STAGGER = [0.0, 0.5, 0.75, 1.25]

_SHIFT_TO_BASE = {
    "~": "`", "!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6",
    "&": "7", "*": "8", "(": "9", ")": "0", "_": "-", "+": "=", "{": "[",
    "}": "]", "|": "\\", ":": ";", '"': "'", "<": ",", ">": ".", "?": "/",
}
_BASE_TO_SHIFT = {v: k for k, v in _SHIFT_TO_BASE.items()}

# Touch-typing finger assignment. 0-3 left hand, 4-7 right hand, 8 thumbs.
_FINGER_KEYS = {
    0: "`1qaz",
    1: "2wsx",
    2: "3edc",
    3: "45rtfgvb",
    4: "67yuhjnm",
    5: "8ik,",
    6: "9ol.",
    7: "0-=p[]\\;'/",
}

# Where each finger rests between strokes.
_HOME_KEY = {0: "a", 1: "s", 2: "d", 3: "f",
             4: "j", 5: "k", 6: "l", 7: ";", 8: " "}

# Index fingers are strong and quick; pinkies are neither. This drives both
# how fast a finger moves and how likely it is to fumble the press.
FINGER_POWER = {0: 0.60, 1: 0.76, 2: 0.90, 3: 1.00,
                4: 1.00, 5: 0.90, 6: 0.76, 7: 0.58, 8: 1.00}

KEYPOS: dict[str, tuple[float, float]] = {}
for _r, _row in enumerate(_ROWS):
    for _c, _ch in enumerate(_row):
        KEYPOS[_ch] = (float(_r), _c + _ROW_STAGGER[_r])
KEYPOS[" "] = (4.0, 5.0)

FINGER: dict[str, int] = {}
for _f, _keys in _FINGER_KEYS.items():
    for _ch in _keys:
        FINGER[_ch] = _f
FINGER[" "] = 8

HOME_POS = {f: KEYPOS[k] for f, k in _HOME_KEY.items()}

# Candidate landing keys near each key, so a missed stroke only has to be
# checked against its own neighbourhood instead of the whole board.
VICINITY: dict[str, list[tuple[str, float, float]]] = {}
for _ch, (_r, _c) in KEYPOS.items():
    near = []
    for _ch2, (_r2, _c2) in KEYPOS.items():
        if _ch2 == " " or math.hypot(_r - _r2, _c - _c2) > 2.3:
            continue
        near.append((_ch2, _r2, _c2))
    VICINITY[_ch] = near


def base_key(ch: str) -> tuple[str, bool]:
    """Split a character into the key you press and whether shift is held."""
    if ch.isalpha():
        return ch.lower(), ch.isupper()
    if ch in _SHIFT_TO_BASE:
        return _SHIFT_TO_BASE[ch], True
    return ch, False


def apply_shift(key: str, shifted: bool) -> str:
    if not shifted:
        return key
    return key.upper() if key.isalpha() else _BASE_TO_SHIFT.get(key, key)


def hand_of(finger: int | None) -> int | None:
    if finger is None:
        return None
    return 0 if finger <= 3 else (1 if finger <= 7 else 2)


# Letter pairs English typists have drilled to the point of being one motion.
COMMON_BIGRAMS = {
    "th", "he", "in", "er", "an", "re", "on", "at", "en", "nd", "ti", "es",
    "or", "te", "of", "ed", "is", "it", "al", "ar", "st", "to", "nt", "ng",
    "se", "ha", "as", "ou", "io", "le", "ve", "co", "me", "de", "hi", "ri",
    "ro", "ic", "ne", "ea", "ra", "ce", "li", "ch", "ll", "be", "ma", "si",
    "om", "ur", "ca", "el", "ta", "la", "ns", "di", "fo", "ho", "pe", "ec",
}

COMMON_WORDS = set("""
a about after all also an and any are as at back be because been before but
by can come could day did do does down each even first for from get give go
good had has have he her here him his how i if in into is it its just know
like little look make man many me more most much must my new no not now of
on one only or other our out over people say see she should so some such take
than that the their them then there these they thing think this those time to
too two up us use very want was way we well were what when where which who
why will with work would year you your
""".split())


# ==========================================================================
#  Hands
# ==========================================================================

class Hands:
    """Eight fingers with positions, drift, and imperfect aim."""

    def __init__(self, rnd: random.Random, haste: float):
        self.rnd = rnd
        self.haste = haste                     # rises with the wpm setting
        self.at = dict(HOME_POS)               # where each finger is now
        self.drift = {0: [0.0, 0.0], 1: [0.0, 0.0]}   # slow per-hand wander
        self.displaced: tuple[int, int, int] | None = None  # hand, cols, left

    # ---------------------------------------------------------------- state

    def settle(self, finger: int) -> None:
        """Fingers creep back towards home when they aren't being used."""
        if finger is None:
            return
        here = self.at[finger]
        home = HOME_POS[finger]
        self.at[finger] = (here[0] + (home[0] - here[0]) * 0.35,
                           here[1] + (home[1] - here[1]) * 0.35)

    def wander(self) -> None:
        """Both hands drift a little relative to the keys underneath them."""
        for pair in self.drift.values():
            for axis in (0, 1):
                pair[axis] += self.rnd.gauss(0.0, 0.012) - pair[axis] * 0.05
                pair[axis] = max(-0.30, min(0.30, pair[axis]))

    def displace(self, hand: int, columns: int, duration: int) -> None:
        """Set a hand down off its proper column for the next few strokes."""
        self.displaced = (hand, columns, duration)

    def _offset(self, finger: int) -> tuple[float, float]:
        hand = hand_of(finger)
        if hand not in (0, 1):
            return (0.0, 0.0)
        row, col = self.drift[hand]
        if self.displaced and self.displaced[0] == hand:
            col += self.displaced[1]
        return (row, col)

    # ----------------------------------------------------------- keystrokes

    def reach(self, key: str) -> float:
        """Move the right finger onto a key. Returns how far it travelled."""
        finger = FINGER.get(key)
        if finger is None or key not in KEYPOS:
            return 1.0
        target = KEYPOS[key]
        here = self.at[finger]
        distance = math.hypot(target[0] - here[0], target[1] - here[1])
        self.at[finger] = target
        if self.displaced:
            hand, columns, left = self.displaced
            left -= 1
            self.displaced = (hand, columns, left) if left > 0 else None
        self.wander()
        return distance

    def land(self, key: str, sloppiness: float = 1.0) -> str:
        """Where the finger actually comes down when a stroke goes wrong.

        The miss is pushed along the line the finger was already travelling,
        so a long reach overshoots and a return falls short, with a smaller
        sideways spread on top. Whatever key is nearest to that point is what
        gets typed.
        """
        finger = FINGER.get(key)
        if finger is None or key not in KEYPOS:
            return key
        target = KEYPOS[key]
        origin = self.at[finger]

        travel = math.hypot(target[0] - origin[0], target[1] - origin[1])
        if travel > 0.05:
            unit = ((target[0] - origin[0]) / travel,
                    (target[1] - origin[1]) / travel)
        else:                                  # already on the key: pure wobble
            angle = self.rnd.uniform(0, 2 * math.pi)
            unit = (math.sin(angle), math.cos(angle))

        power = FINGER_POWER.get(finger, 1.0)
        spread = sloppiness * (0.55 + 0.30 * travel) * self.haste / power
        along = self.rnd.gauss(0.45, 0.40) * (0.5 + 0.7 * travel)
        across = self.rnd.gauss(0.0, 0.55)

        drift_row, drift_col = self._offset(finger)
        point = (target[0] + unit[0] * along * spread - unit[1] * across * spread
                 + drift_row,
                 target[1] + unit[1] * along * spread + unit[0] * across * spread
                 + drift_col)

        best, best_d = None, 1e9
        for candidate, row, col in VICINITY[key]:
            if candidate == key:
                continue
            d = math.hypot(point[0] - row, point[1] - col)
            if d < best_d:
                best, best_d = candidate, d
        return best or key


# ==========================================================================
#  Settings
# ==========================================================================

@dataclass
class Settings:
    wpm: int = 80
    accuracy: float = 97.0      # percent; adaptive mode only
    hesitation: float = 50.0    # 0-100, how often it stops to think
    adaptive: bool = True
    seed: int | None = None


# Error mechanisms, and roughly how they arise.
SLIP = "slip"            # finger lands on the wrong key
SWAP = "swap"            # hands fire out of order
DROP = "drop"            # press never completes
BOUNCE = "bounce"        # key repeats
DOUBLE_SHIFT = "shift"   # shift mistimed
RUN = "run"              # whole hand set down off-column
SPACE = "space"          # thumb early or late


class HumanTyper:
    """Turns text into timed keystrokes by simulating someone typing it.

    events() yields ("type", char, delay) and ("back", 1, delay). Applying
    every event in order always reproduces the source text exactly.
    """

    MIN_STROKE = 0.030      # nobody hits two keys closer together than this

    def __init__(self, text: str, settings: Settings, _calibrate: bool = True):
        self.text = text.replace("\r\n", "\n").replace("\r", "\n")
        self.settings = settings
        self.seed = (settings.seed if settings.seed is not None
                     else random.randrange(1 << 30))
        self.wpm = max(5, int(settings.wpm))
        self.accuracy = max(50.0, min(100.0, float(settings.accuracy)))
        self.adaptive = bool(settings.adaptive)
        self.hesitation = max(0.0, min(1.0, settings.hesitation / 100.0))
        self.base = 12.0 / self.wpm            # seconds per character on target
        self.pause_scale = 0.3 + 0.7 * self.hesitation
        self.haste = (self.wpm / 70.0) ** 0.6

        self.reset()
        self.weights, self.error_rate = self._error_weights()

        # Hesitating and fixing mistakes both cost time, so raw finger speed
        # has to run ahead of the target for the finished text to arrive at
        # the requested rate. Measure the shortfall on an identical dry run
        # and stretch every delay to close it.
        self.scale = 1.0
        if _calibrate and self.adaptive and self.text:
            self.scale = self._calibrate()
            self.reset()

    def reset(self) -> None:
        self.rnd = random.Random(self.seed)
        self.hands = Hands(self.rnd, self.haste)
        self.drift = 1.0
        self.burst = 0
        self.pending_pause = 0.0
        self.after_sentence = False
        self.vtime = 0.0
        self.mistakes = 0
        self.tally: dict[str, int] = {}
        self.last_key: str | None = None
        self.last_finger: int | None = None
        self.info = getattr(self, "info", None) or self._analyse(self.text)

    # ---------------------------------------------------------------- setup

    @staticmethod
    def _analyse(text: str):
        """Per-character word context: (word_length, index_in_word, common)."""
        info: list[tuple[int, int, bool] | None] = [None] * len(text)
        i, n = 0, len(text)
        while i < n:
            if text[i].isalnum() or text[i] == "'":
                j = i
                while j < n and (text[j].isalnum() or text[j] == "'"):
                    j += 1
                word = text[i:j]
                common = word.lower().strip("'") in COMMON_WORDS
                for k in range(i, j):
                    info[k] = (len(word), k - i, common)
                i = j
            else:
                i += 1
        return info

    def _error_weights(self):
        """How error-prone each character is, relative to the average.

        Worked out from the text alone, then normalised so the mean is 1.
        That way the accuracy dial means exactly what it says however awkward
        the text is, while the awkward characters still take the hits.
        """
        text = self.text
        weights = [0.0] * len(text)
        total = 0.0
        counted = 0
        for i, ch in enumerate(text):
            # A mistake on a tab or a newline would wreck the structure of a
            # table rather than a word, so those two never go wrong.
            if ch in "\t\n":
                continue
            key, shifted = base_key(ch)
            if ch == " ":
                # The thumb is home already and the target is enormous, but
                # it can still go down out of step with the fingers.
                weights[i] = 0.3
                total += 0.3
                counted += 1
                continue
            w = 1.0
            ctx = self.info[i]
            if ctx:
                length, pos, common = ctx
                if common and length <= 5:
                    w *= 0.55                  # drilled words rarely go wrong
                elif length >= 9:
                    w *= 1.45
                if pos == 0:
                    w *= 0.8                   # the first letter gets aimed at
            if not ch.isalpha():
                w *= 1.4                       # digits and symbols are a reach
            if shifted:
                w *= 1.25
            finger = FINGER.get(key)
            if finger is not None:
                w *= 1.0 + 0.5 * (1.0 - FINGER_POWER[finger])
                home = HOME_POS[finger]
                pos_here = KEYPOS.get(key, home)
                w *= 1.0 + 0.22 * math.hypot(pos_here[0] - home[0],
                                             pos_here[1] - home[1])
            if i:
                prev_key, _ = base_key(text[i - 1])
                pf = FINGER.get(prev_key)
                if pf is not None and pf == finger and prev_key != key:
                    w *= 1.9                   # same finger, different key
            weights[i] = w
            total += w
            counted += 1
        # Scale so the weights sum to the length of the text. Then the number
        # of mistakes works out to rate x characters, whatever the text is
        # made of, and the awkward characters still take most of them.
        if total > 0:
            factor = len(text) / total
            weights = [w * factor for w in weights]
        rate = 0.0 if self.accuracy >= 99.95 else (100.0 - self.accuracy) / 100.0
        # While a mistake is sitting there uncorrected no new one can start,
        # and each one swallows a few characters before it gets noticed. Left
        # alone that drags the finished accuracy above what was asked for, and
        # the gap widens the sloppier the setting. Roughly 2.5 characters go
        # by per mistake, so aim high enough to land on the number.
        rate = rate / max(0.30, 1.0 - 2.5 * rate)
        return weights, rate

    # ------------------------------------------------------------- mechanics

    def _stroke_cost(self, prev: str | None, ch: str, idx: int) -> float:
        """Seconds for one keystroke, before the calibration scale."""
        key, shifted = base_key(ch)
        finger = FINGER.get(key)
        travel = self.hands.reach(key)

        if not self.adaptive:
            self.last_key, self.last_finger = key, finger
            return self.base * self.rnd.uniform(0.93, 1.07)

        # A slow random walk, so the pace ebbs and flows instead of sitting
        # at one speed forever.
        self.drift += (1.0 - self.drift) * 0.02 + self.rnd.gauss(0.0, 0.035)
        self.drift = max(0.72, min(1.45, self.drift))

        m = 1.0
        extra = 0.0
        prev_finger = self.last_finger
        if prev_finger is None:
            m *= 1.30
        elif key == self.last_key:
            m *= 0.88                          # same key twice is a rhythm
        elif finger == prev_finger:
            m *= 1.48                          # same finger, different key
        elif hand_of(finger) != hand_of(prev_finger):
            m *= 0.85                          # hands alternating is fastest
        else:
            m *= 1.02
        m *= 1.0 + 0.11 * travel               # distance costs time
        if finger is not None:
            m *= 1.0 + 0.25 * (1.0 - FINGER_POWER[finger])

        if self.last_key and (self.last_key + key) in COMMON_BIGRAMS:
            m *= 0.87
        prev_shift = base_key(prev)[1] if prev else False
        if shifted and not prev_shift:
            extra += self.rnd.uniform(0.03, 0.07)
        if ch.isdigit():
            m *= 1.35
        elif not ch.isalnum() and ch != " ":
            m *= 1.30

        ctx = self.info[idx] if 0 <= idx < len(self.info) else None
        if ctx:
            length, pos, common = ctx
            if common and length <= 5:
                m *= 0.78
            elif length >= 9:
                m *= 1.0 + min(0.28, 0.035 * (length - 8))
            if pos == 0:
                m *= 1.16
                if self.burst <= 0 and self.rnd.random() < 0.03:
                    self.burst = self.rnd.randint(5, 14)
            elif pos == length - 1:
                m *= 0.94

        if self.burst > 0:
            m *= 0.76
            self.burst -= 1

        m *= self.drift
        m *= 1.0 + min(0.15, self.vtime / 900.0)      # mild fatigue
        sigma = 0.30
        m *= self.rnd.lognormvariate(0.0, sigma) / math.exp(sigma * sigma / 2)

        self.last_key, self.last_finger = key, finger
        return max(0.012, self.base * m + extra)

    def _think_pause(self, idx: int, prev: str | None) -> float:
        if not self.adaptive or self.hesitation <= 0:
            return 0.0
        ctx = self.info[idx] if idx < len(self.info) else None
        if prev is None or ctx is None or ctx[1] != 0:
            return 0.0                          # only between words
        length, _, common = ctx
        p_micro = 0.15 * self.hesitation
        p_think = 0.038 * self.hesitation
        if self.after_sentence:
            p_think *= 2.6
            p_micro *= 1.5
        if common and length <= 4:
            p_micro *= 0.5
            p_think *= 0.25
        elif length >= 9:
            p_think *= 1.9
            p_micro *= 1.4
        r = self.rnd.random()
        if r < p_think:
            if self.rnd.random() < 0.22:
                return self.rnd.uniform(1.8, 3.6)
            return self.rnd.uniform(0.6, 1.8)
        if r < p_think + p_micro:
            return self.rnd.uniform(0.10, 0.42)
        return 0.0

    def _after(self, ch: str) -> None:
        r = self.rnd
        if ch in ",;:":
            self.pending_pause += self.base * r.uniform(1.5, 3.5) * self.pause_scale
        elif ch in ".!?":
            self.after_sentence = True
            self.pending_pause += r.uniform(0.12, 0.45) * self.pause_scale
        elif ch == "\n":
            self.after_sentence = True
            self.pending_pause += r.uniform(0.25, 0.90) * self.pause_scale
        elif ch == "\t":
            self.pending_pause += r.uniform(0.15, 0.55) * self.pause_scale
        elif ch != " " and not ch.isalnum():
            self.pending_pause += self.base * r.uniform(0.3, 1.2)
        if ch.isalnum():
            self.after_sentence = False

    # ---------------------------------------------------------------- errors

    def _choose_mechanism(self, i: int) -> str:
        """Which way this particular keystroke goes wrong.

        Weighted by what the hands are actually being asked to do: two hands
        in a row invites them to fire out of order, a doubled letter invites a
        bounce, a weak finger invites a dropped press.
        """
        text = self.text
        ch = text[i]
        key, shifted = base_key(ch)
        finger = FINGER.get(key)
        nxt = text[i + 1] if i + 1 < len(text) else ""
        rnd = self.rnd

        options: list[tuple[str, float]] = [(SLIP, 42.0)]

        if nxt and not nxt.isspace() and nxt.lower() != ch.lower():
            nf = FINGER.get(base_key(nxt)[0])
            cross = hand_of(nf) is not None and hand_of(nf) != hand_of(finger)
            # Transpositions are overwhelmingly a two-hand problem: the other
            # hand is already moving and gets there first.
            options.append((SWAP, 26.0 if cross else 7.0))

        power = FINGER_POWER.get(finger, 1.0)
        options.append((DROP, 10.0 + 14.0 * (1.0 - power)))
        options.append((BOUNCE, 14.0 if ch == nxt else 9.0))
        if shifted:
            options.append((DOUBLE_SHIFT, 30.0))
        if ch == " ":
            options.append((SPACE, 40.0))
        # A whole hand set down one column off is rare but unmistakable.
        if finger is not None and hand_of(finger) in (0, 1) and i > 3:
            options.append((RUN, 3.0))

        kinds = [k for k, _ in options]
        weights = [w for _, w in options]
        return rnd.choices(kinds, weights=weights, k=1)[0]

    def _notice_after(self) -> int:
        return self.rnd.choices([0, 1, 2, 3, 4, 5, 6],
                                weights=[22, 20, 17, 13, 11, 9, 8], k=1)[0]

    def _record(self, kind: str) -> None:
        self.mistakes += 1
        self.tally[kind] = self.tally.get(kind, 0) + 1

    def _fix(self, screen: list[str], anchor: int, upto: int):
        """Backspace to where it went wrong, then retype it properly."""
        rnd = self.rnd
        text = self.text
        d = anchor
        limit = min(len(screen), upto)
        while d < limit and screen[d] == text[d]:
            d += 1
        if d > anchor and rnd.random() < 0.18:
            d -= 1                              # overshoot by one, as people do

        nback = len(screen) - d
        if nback <= 0 and d >= upto:
            return

        first = True
        for _ in range(nback):
            beat = rnd.uniform(0.16, 0.50) if first else 0.0
            first = False
            yield ("back", 1, rnd.uniform(0.045, 0.10), beat)
            screen.pop()

        # Hands come back to rest before the retype.
        for finger in list(self.hands.at):
            self.hands.settle(finger)
        self.hands.displaced = None
        self.last_key = screen[-1] if screen else None
        self.last_finger = FINGER.get(base_key(self.last_key)[0]) if self.last_key else None

        for k in range(d, upto):
            c = text[k]
            cost = self._stroke_cost(self.last_key, c, k) * rnd.uniform(0.75, 0.95)
            beat = rnd.uniform(0.05, 0.18) if k == d else 0.0
            yield ("type", c, cost, beat)
            screen.append(c)
        self.pending_pause += rnd.uniform(0.03, 0.15)

    # ------------------------------------------------------------- generator

    def _accounted(self):
        for kind, value, stroke, pause in self._generate():
            self.vtime += stroke + pause
            yield kind, value, stroke, pause

    def events(self):
        pf = self.scale ** 0.35        # pauses give less ground than fingers do
        for kind, value, stroke, pause in self._accounted():
            yield kind, value, max(self.MIN_STROKE, stroke * self.scale) + pause * pf

    def _generate(self):
        rnd = self.rnd
        text = self.text
        n = len(text)
        screen: list[str] = []
        prev: str | None = None
        i = 0
        pending = False
        anchor = 0
        notice = 0

        while i < n:
            ch = text[i]

            # Never leave a mistake standing across a tab or a newline. Once
            # those fire the cursor has left the cell or committed the field,
            # and a later backspace would eat the wrong text entirely.
            if pending and ch in "\n\t":
                yield from self._fix(screen, anchor, i)
                prev = screen[-1] if screen else None
                pending = False

            pause = self.pending_pause
            self.pending_pause = 0.0
            if not pending:
                pause += self._think_pause(i, prev)
            if prev is None:
                pause = min(pause, 0.15)

            fires = (not pending and self.adaptive
                     and rnd.random() < min(0.35, self.error_rate * self.weights[i]))

            if fires:
                anchor = i
                consumed = list(self._go_wrong(i, prev, pause, screen))
                for event in consumed:
                    yield event
                i = self._resume_at
                prev = screen[-1] if screen else prev
                pending = True
                notice = self._notice_after()
                if notice == 0:
                    yield from self._fix(screen, anchor, i)
                    prev = screen[-1] if screen else None
                    pending = False
                continue

            yield ("type", ch, self._stroke_cost(prev, ch, i), pause)
            screen.append(ch)
            prev = ch
            i += 1
            self._after(ch)

            if pending:
                notice -= 1
                if notice <= 0 or (ch.isspace() and rnd.random() < 0.7):
                    yield from self._fix(screen, anchor, i)
                    prev = screen[-1] if screen else None
                    pending = False

        if pending:
            yield from self._fix(screen, anchor, n)

    def _go_wrong(self, i: int, prev: str | None, pause: float, screen: list[str]):
        """Play out one failed keystroke. Sets _resume_at to the next index."""
        rnd = self.rnd
        text = self.text
        ch = text[i]
        key, shifted = base_key(ch)
        kind = self._choose_mechanism(i)
        self._resume_at = i + 1

        if kind == SWAP:
            # The other hand gets there first.
            self._record(SWAP)
            second = text[i + 1]
            yield ("type", second, self._stroke_cost(prev, second, i), pause)
            screen.append(second)
            yield ("type", ch, self._stroke_cost(second, ch, i + 1) * 0.85, 0.0)
            screen.append(ch)
            self._resume_at = i + 2
            return

        if kind == DROP:
            # The finger moved but never pressed hard enough to register.
            self._record(DROP)
            self.hands.reach(key)
            self.pending_pause += pause
            return

        if kind == BOUNCE:
            # Held a fraction too long and the key repeated.
            self._record(BOUNCE)
            yield ("type", ch, self._stroke_cost(prev, ch, i), pause)
            screen.append(ch)
            yield ("type", ch, rnd.uniform(0.030, 0.075), 0.0)
            screen.append(ch)
            return

        if kind == DOUBLE_SHIFT:
            self._record(DOUBLE_SHIFT)
            roll = rnd.random()
            if roll < 0.45 or i + 1 >= len(text) or not text[i + 1].isalpha():
                # Shift never made it: the capital comes out lower case.
                wrong = apply_shift(key, False)
                yield ("type", wrong, self._stroke_cost(prev, wrong, i), pause)
                screen.append(wrong)
                return
            if roll < 0.75:
                # Shift arrives a beat late, so it catches the next letter.
                first = apply_shift(key, False)
                second = text[i + 1].upper()
                yield ("type", first, self._stroke_cost(prev, first, i), pause)
                screen.append(first)
                yield ("type", second, self._stroke_cost(first, second, i + 1), 0.0)
                screen.append(second)
                self._resume_at = i + 2
                return
            # Shift held a beat too long, so it catches the next letter too.
            second = text[i + 1].upper()
            yield ("type", ch, self._stroke_cost(prev, ch, i), pause)
            screen.append(ch)
            yield ("type", second, self._stroke_cost(ch, second, i + 1), 0.0)
            screen.append(second)
            self._resume_at = i + 2
            return

        if kind == SPACE:
            # The thumb goes down out of step with the fingers.
            self._record(SPACE)
            if i + 1 < len(text) and not text[i + 1].isspace():
                nxt = text[i + 1]
                yield ("type", nxt, self._stroke_cost(prev, nxt, i + 1), pause)
                screen.append(nxt)
                yield ("type", " ", self._stroke_cost(nxt, " ", i), 0.0)
                screen.append(" ")
                self._resume_at = i + 2
                return
            self.pending_pause += pause         # space simply missed
            return

        if kind == RUN:
            # The hand was set down a column off. Everything it types from
            # here is shifted the same way until the eye catches up.
            self._record(RUN)
            finger = FINGER.get(key)
            columns = rnd.choice((-1, 1))
            self.hands.displace(hand_of(finger), columns, rnd.randint(2, 5))
            wrong = self.hands.land(key, sloppiness=1.6)
            wrong = apply_shift(wrong, shifted)
            yield ("type", wrong, self._stroke_cost(prev, wrong, i), pause)
            screen.append(wrong)
            return

        # Ordinary miss: ask the hands where the finger actually landed.
        self._record(SLIP)
        landed = self.hands.land(key, sloppiness=1.0)
        wrong = apply_shift(landed, shifted)
        if wrong == ch:                          # nothing else nearby
            wrong = apply_shift(landed, not shifted)
        yield ("type", wrong, self._stroke_cost(prev, wrong, i), pause)
        screen.append(wrong)

    # ------------------------------------------------------------ calibration

    def _calibrate(self) -> float:
        probe = HumanTyper(self.text, Settings(
            wpm=self.wpm, accuracy=self.accuracy,
            hesitation=self.hesitation * 100, adaptive=True, seed=self.seed),
            _calibrate=False)
        strokes = pauses = 0.0
        for _, _, stroke, pause in probe._accounted():
            strokes += stroke
            pauses += pause
        if strokes + pauses <= 0:
            return 1.0
        target = len(self.text) * 12.0 / self.wpm

        def total(s):
            return strokes * s + pauses * (s ** 0.35)

        lo, hi = 0.5, 2.5
        if total(lo) >= target:
            return lo
        if total(hi) <= target:
            return hi
        for _ in range(40):
            mid = (lo + hi) / 2
            if total(mid) < target:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2

    # -------------------------------------------------------------- utilities

    def estimate(self) -> tuple[float, int, int]:
        """Dry run. Returns (seconds, keystrokes, mistakes)."""
        self.reset()
        total = 0.0
        strokes = 0
        for _, _, delay in self.events():
            total += delay
            strokes += 1
        return total, strokes, self.mistakes

    def transcript(self, back_mark: str = "\u2190") -> str:
        """Replay as readable text, with backspaces shown."""
        self.reset()
        out = []
        for kind, value, _ in self.events():
            if kind == "back":
                out.append(back_mark)
            elif value == "\t":
                out.append(" \u21e5 ")
            elif value == "\n":
                out.append(" \u00b6\n")
            else:
                out.append(value)
        return "".join(out)


# ==========================================================================
#  Text preparation: markdown and tables
# ==========================================================================

# Inline markdown that should not be typed out literally. Order matters: the
# doubled marks have to go before the single ones, or **bold** leaves stray
# asterisks behind. The single * and _ rules need a non-word character on the
# outside, so file_names_like_this and 3 * 4 are left alone.
_MARKDOWN = [
    (re.compile(r"\*\*(.+?)\*\*", re.S), r"\1"),
    (re.compile(r"__(.+?)__", re.S), r"\1"),
    (re.compile(r"~~(.+?)~~", re.S), r"\1"),
    (re.compile(r"(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)", re.S), r"\1"),
    (re.compile(r"(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)", re.S), r"\1"),
    (re.compile(r"`([^`\n]+?)`"), r"\1"),
    (re.compile(r"^\s*#{1,6}\s+", re.M), ""),
]


def strip_markdown(text: str) -> str:
    """Drop bold, italic, strikethrough, code and heading marks."""
    for pattern, replacement in _MARKDOWN:
        text = pattern.sub(replacement, text)
    return text


def parse_table(text: str):
    """Read pasted text as a grid. Returns (rows, description) or None."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    body = [ln for ln in lines if ln.strip()]
    if not body:
        return None

    if sum(1 for ln in body if "|" in ln) >= max(1, len(body) * 0.8):
        rows = []
        for n, line in enumerate(body):
            stripped = line.strip()
            if stripped.startswith("|"):
                stripped = stripped[1:]
            if stripped.endswith("|"):
                stripped = stripped[:-1]
            cells = [c.strip() for c in stripped.split("|")]
            # The |---|:--:| rule under the header is layout, not data.
            if n < 2 and cells and all(c and set(c) <= set("-: ") for c in cells):
                continue
            rows.append(cells)
        if rows:
            return rows, "markdown table"

    if any("\t" in ln for ln in body):
        return [ln.split("\t") for ln in body], "tab separated"

    # CSV, but only with several lines that agree on the column count. One
    # line with a comma in it is a sentence, not a table.
    if len(body) >= 2 and all("," in ln for ln in body):
        try:
            rows = list(csv.reader(io.StringIO("\n".join(body))))
        except Exception:
            rows = []
        if rows and len({len(r) for r in rows}) == 1 and len(rows[0]) > 1:
            return [[c.strip() for c in r] for r in rows], "comma separated"

    return [[ln.strip()] for ln in body], "one column per line"


def square_up(rows, columns: int = 0):
    """Force every row to the same width. Returns (rows, width, notes).

    This is the whole ballgame for tables. Cell moves are counted, not aimed:
    the cursor lands where it lands after N presses of Tab. One row with a
    missing cell shifts every cell after it by one, and because the shift
    carries forward, the damage is invisible at the top and obvious at the
    bottom. Padding short rows keeps the count honest all the way down.

    Pass columns to match a table that already exists with a set number of
    columns; leave it at 0 to use the widest row in the data.
    """
    rows = [r for r in rows if any(c.strip() for c in r)]
    if not rows:
        return [], 0, []
    # The width most rows agree on, not the widest. One row with a stray
    # extra cell shouldn't widen the whole table and push a column of empties
    # onto every other row; a tie goes to the header, which usually knows.
    counts: dict[int, int] = {}
    for row in rows:
        counts[len(row)] = counts.get(len(row), 0) + 1
    best = max(counts.values())
    natural = (len(rows[0]) if counts.get(len(rows[0])) == best
               else max(w for w, c in counts.items() if c == best))
    width = columns if columns > 0 else natural
    notes = []
    short = long = 0
    out = []
    for row in rows:
        if len(row) < width:
            short += 1
            row = list(row) + [""] * (width - len(row))
        elif len(row) > width:
            long += 1
            # Fold the extras into the final cell rather than letting them
            # spill into the next row and drag everything out of line.
            row = list(row[:width - 1]) + [" ".join(row[width - 1:])]
        out.append(row)
    if short:
        notes.append(f"{short} short {'row' if short == 1 else 'rows'} padded")
    if long:
        notes.append(f"{long} over-wide {'row' if long == 1 else 'rows'} folded")
    return out, width, notes


def grid_to_stream(rows) -> str:
    """Flatten a grid: tab between cells, newline between rows.

    The engine only understands characters, so cell moves ride along as tabs
    and row moves as newlines. What key those become is decided at the
    keyboard, which is what lets one stream drive Word and Excel alike.
    Nothing is appended at the end: a trailing tab would add a row in Word and
    a trailing newline would leave a blank line in Excel.
    """
    return "\n".join("\t".join(cell.strip() for cell in row) for row in rows)


# ==========================================================================
#  Self-tests
# ==========================================================================

SAMPLES = [
    "The quick brown fox jumps over the lazy dog.",
    "Hello, World! Testing 1, 2, 3... does it work?",
    "Multi-line text.\nSecond line here.\n\nAnd a third, after a gap.",
    "Difficulty: unquestionably, extraordinarily complicated vocabulary.",
    "ll ee oo aa -- doubled letters: sunnily, coffee, aardvark, misspell.",
    "Symbols & things: (a+b)*c = 42; \"quoted\" 'stuff' #tag @name 50%.",
    "Region\tQuarter\tRevenue\nNorthumberland\tQ3\t184,220\nKent\tQ4\t9,110",
    "a",
    "",
]


def selftest(verbose: bool = True) -> bool:
    ok = True

    # 1. Replaying the events must always land on the original text.
    for wpm, acc, adaptive in [(40, 100, False), (85, 97, True), (120, 92, True),
                               (200, 86, True), (65, 99.5, True)]:
        for seed in range(25):
            for text in SAMPLES:
                eng = HumanTyper(text, Settings(wpm=wpm, accuracy=acc,
                                                adaptive=adaptive, seed=seed))
                screen: list[str] = []
                for kind, value, delay in eng.events():
                    if delay < 0:
                        ok = False
                    if kind == "type":
                        screen.append(value)
                    elif screen:
                        screen.pop()
                if "".join(screen) != text:
                    ok = False
                    if verbose:
                        print(f"  text FAIL {text[:28]!r} -> {''.join(screen)[:40]!r}")
    if verbose:
        print(f"text always arrives intact: {'PASS' if ok else 'FAIL'}")

    # 2. The two dials have to mean what they say.
    body = ("The quick brown fox jumps over the lazy dog. Pack my box with five "
            "dozen liquor jugs. Extraordinarily complicated vocabulary follows, "
            "and then a Question about Priorities. ") * 3
    if verbose:
        print("\nspeed dial:")
    for wpm, acc, hes in [(40, 99, 30), (85, 97, 50), (85, 92, 90),
                          (120, 96, 50), (200, 94, 40)]:
        rates = []
        for seed in range(10):
            eng = HumanTyper(body, Settings(wpm=wpm, accuracy=acc,
                                            hesitation=hes, seed=seed))
            secs, _, _ = eng.estimate()
            rates.append((len(eng.text) / 5) / (secs / 60))
        got = sum(rates) / len(rates)
        if verbose:
            flag = "" if abs(got - wpm) < max(4, wpm * 0.06) else "   (capped)"
            print(f"  asked {wpm:>3} wpm -> delivered {got:5.1f}{flag}")

    if verbose:
        print("\naccuracy dial:")
    for acc in (99.5, 97, 93, 88):
        misses = []
        for seed in range(60):
            eng = HumanTyper(body, Settings(wpm=85, accuracy=acc,
                                            hesitation=40, seed=seed))
            eng.estimate()
            misses.append(eng.mistakes)
        got = 100 - (sum(misses) / len(misses)) / len(body) * 100
        if abs(got - acc) > 1.0:
            ok = False
        if verbose:
            print(f"  asked {acc:>5}% -> delivered {got:5.2f}%")

    # 3. Mistakes have to be physically plausible, not random letters.
    rnd = random.Random(11)
    hands = Hands(rnd, 1.0)
    adjacent = total = 0
    offsets: dict[int, int] = {}
    for _ in range(20000):
        key = rnd.choice("qwertyuiopasdfghjklzxcvbnm")
        hands.reach(key)
        landed = hands.land(key)
        r1, c1 = KEYPOS[key]
        r2, c2 = KEYPOS[landed]
        total += 1
        if math.hypot(r1 - r2, c1 - c2) <= 1.35:
            adjacent += 1
        offsets[int(round(r2 - r1))] = offsets.get(int(round(r2 - r1)), 0) + 1
    share = adjacent / total * 100
    if share < 95:
        ok = False
    if verbose:
        print(f"\nmistakes land on a key next to the intended one: {share:.1f}%")
        rows = " ".join(f"{k:+d}:{v / total * 100:.0f}%"
                        for k, v in sorted(offsets.items()))
        print(f"  row the finger came down on: {rows}")
        tally: dict[str, int] = {}
        for seed in range(150):
            eng = HumanTyper(body, Settings(wpm=85, accuracy=94,
                                            hesitation=40, seed=seed))
            eng.estimate()
            for k, v in eng.tally.items():
                tally[k] = tally.get(k, 0) + v
        grand = sum(tally.values()) or 1
        print("  how they happen:")
        for kind, count in sorted(tally.items(), key=lambda kv: -kv[1]):
            print(f"    {count / grand * 100:5.1f}%  {MECHANISM_NAMES[kind]}")
    return ok


def table_selftest(verbose: bool = True) -> bool:
    ok = True
    cases = [
        ("| Name | Role  |\n|------|-------|\n| Ada  | Maths |\n| Alan | Logic |",
         "markdown table", 3, 2),
        ("Name\tRole\nAda\tMaths\nAlan\tLogic", "tab separated", 3, 2),
        ("Name,Role\nAda,Maths\nAlan,Logic", "comma separated", 3, 2),
        ("First line\nSecond line", "one column per line", 2, 1),
        ("Prose with a comma, and more text here.", "one column per line", 1, 1),
    ]
    for text, want_kind, want_rows, want_cols in cases:
        parsed = parse_table(text)
        if not parsed:
            ok = False
            continue
        rows, kind = parsed
        cols = max(len(r) for r in rows)
        if (kind, len(rows), cols) != (want_kind, want_rows, want_cols):
            ok = False
            if verbose:
                print(f"  parse FAIL {text[:24]!r}: {kind} {len(rows)}x{cols}")

    for raw, want in [("**1926**", "1926"), ("**When?**", "When?"),
                      ("*maybe* and **surely**", "maybe and surely"),
                      ("~~gone~~ and `code`", "gone and code"),
                      ("## Heading", "Heading"),
                      ("file_name_here stays", "file_name_here stays"),
                      ("3 * 4 * 5 stays", "3 * 4 * 5 stays"),
                      ("__loud__ and _soft_", "loud and soft")]:
        if strip_markdown(raw) != want:
            ok = False
            if verbose:
                print(f"  markdown FAIL {raw!r} -> {strip_markdown(raw)!r}")

    # Ragged input is what pushes cells out of line, so square_up has to fix it.
    ragged = [["a", "b", "c"], ["d", "e"], ["f"], ["g", "h", "i", "j"]]
    squared, width, notes = square_up(ragged)
    if width != 3 or any(len(r) != 3 for r in squared):
        ok = False
    if squared[3] != ["g", "h", "i j"]:
        ok = False
    forced, width4, _ = square_up(ragged, columns=4)
    if width4 != 4 or any(len(r) != 4 for r in forced):
        ok = False
    if verbose:
        print(f"\ngrid squared up: every row {width} wide ({'; '.join(notes)})")

    # Every cell has to land in the cell it belongs to, all the way down.
    grid, cols, _ = square_up(parse_table(
        "| Region | Quarter | Revenue |\n|---|---|---|\n"
        "| Northumberland | Q3 | 184,220 |\n"
        "| Kent | | 9,110 |\n"
        "| Aberdeenshire | Q1 |\n"
        "| Fife | Q2 | 41,300 |")[0])
    stream = grid_to_stream(grid)
    misplaced = crossings = 0
    for seed in range(120):
        eng = HumanTyper(stream, Settings(wpm=95, accuracy=88, hesitation=60,
                                          seed=seed))
        screen: list[str] = []
        for kind, value, _ in eng.events():
            if kind == "type":
                screen.append(value)
            else:
                if screen and screen[-1] in "\t\n":
                    crossings += 1
                if screen:
                    screen.pop()
        # Walk the keystrokes the way a Word table would.
        cells = [""]
        for ch in "".join(screen):
            if ch in "\t\n":
                cells.append("")
            else:
                cells[-1] += ch
        wanted = [c for row in grid for c in row]
        if cells != wanted:
            misplaced += 1
    if misplaced or crossings:
        ok = False
    if verbose:
        print(f"cells landed in the right cell: {120 - misplaced}/120 runs at "
              f"88% accuracy")
        print(f"backspaces that crossed a cell edge: {crossings} (must be 0)")
        print(f"\ntables and markdown: {'PASS' if ok else 'FAIL'}")
    return ok


# ==========================================================================
#  Interface
# ==========================================================================


# =========================================================================
#                                  THE APP
# =========================================================================
#
# The window is a native pywebview window showing an HTML page. Every visual
# decision lives in the CSS below; Python owns the typing engine, the hotkey
# listener, settings, and the countdown. The two sides talk over a tiny
# bridge: the page calls `window.pywebview.api.<method>()`, and Python pushes
# events to the page with `gt.on({...})`.

try:
    import webview                                          # noqa: E402
    WEBVIEW_ERROR = None
except Exception as _exc:                                   # pragma: no cover
    webview = None
    WEBVIEW_ERROR = f"{type(_exc).__name__}: {_exc}"

SETTINGS_FILE = os.path.join(os.path.expanduser("~"), ".ghost_typer.json")
LOG_FILE = os.path.join(os.path.expanduser("~"), ".ghost_typer.log")


def _log(message: str) -> None:
    """Append one line to ~/.ghost_typer.log. Never raises."""
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as fh:
            fh.write(time.strftime("%Y-%m-%d %H:%M:%S ") + message + "\n")
    except Exception:
        pass


def _install_crash_log() -> None:
    """Route uncaught exceptions from every thread into the log."""
    import traceback

    def hook(args):
        _log("thread %s crashed:\n%s" % (
            getattr(args.thread, "name", "?"),
            "".join(traceback.format_exception(args.exc_type, args.exc_value,
                                               args.exc_traceback))))
    try:
        threading.excepthook = hook
    except Exception:
        pass
    old = sys.excepthook

    def main_hook(exc_type, exc, tb):
        _log("main thread crashed:\n" + "".join(traceback.format_exception(exc_type, exc, tb)))
        old(exc_type, exc, tb)
    sys.excepthook = main_hook

# How the text reaches the target. In a Word or Docs table Tab walks to the
# next cell and wraps to the next row by itself, so rows need no Enter at all.
# Excel and Sheets need Enter to drop a row.
LAYOUTS = [
    "Plain text",
    "Table cells - Word, Docs",
    "Table cells - Excel, Sheets",
]

# wpm, accuracy, hesitation, adaptive
FEELS = {
    "Robotic": (80, 100, 0, False),
    "Careful": (62, 99, 35, True),
    "Natural": (85, 96, 50, True),
    "Rushed": (115, 92, 25, True),
}
FEEL_NOTES = {
    "Robotic": "Every keystroke evenly spaced. No pauses, no mistakes.",
    "Careful": "Unhurried and near-perfect, with time taken between sentences.",
    "Natural": "An everyday pace. Slips a few times a paragraph and fixes them.",
    "Rushed": "Fast and loose. Barely stops to think, and it shows.",
    "Custom": "Your own numbers.",
}
NEWLINES = ["Shift+Enter (chat apps)", "Enter (documents)", "Space instead"]

# After the window comes back from a pause, how long the user gets to click
# into their target before typing carries on.
RESUME_COUNTDOWN = 5

# Only the opening size. After that the page measures itself: see fit().
COMPOSE_SIZE = (700, 660)
MIN_SIZE = (460, 200)


def key_label(key) -> str:
    """Readable name for a pynput special key: Key.page_up -> 'Page Up'."""
    if key is None:
        return "none"
    name = getattr(key, "name", None)
    if not name:
        return str(key).strip("'")
    if name == "esc":
        return "Esc"
    if len(name) > 1 and name[0] == "f" and name[1:].isdigit():
        return name.upper()
    return name.replace("_", " ").title()


def _excluded_keys() -> set:
    """Keys that can't be hotkeys: the ones this app presses, plus modifiers.

    If the typer sent your hotkey it would trip over itself, and a modifier
    held during normal use would fire constantly.
    """
    if KbKey is None:
        return set()
    names = ("enter", "backspace", "tab", "space",
             "shift", "shift_l", "shift_r", "ctrl", "ctrl_l", "ctrl_r",
             "alt", "alt_l", "alt_r", "alt_gr", "cmd", "cmd_l", "cmd_r")
    return {getattr(KbKey, n) for n in names if hasattr(KbKey, n)}


# ---------------------------------------------------------------- the page

# A ghost with two eyes. Two colours, no gradients, so it
# reads at 16px in a title bar and at 512px on a store page alike.
ICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1E2030"/><path d="M32 9c-10.5 0-18 7.9-18 18.4V54l5.6-4.4 6.2 4.4 6.2-4.4 6.2 4.4 6.2-4.4L50 54V27.4C50 16.9 42.5 9 32 9z" fill="#8FE3C4"/><circle cx="25" cy="29" r="4" fill="#1E2030"/><circle cx="39" cy="29" r="4" fill="#1E2030"/></svg>"""


def _ghost_pixels(size: int):
    """Rasterise the ghost from ICON_SVG's geometry: 32-bit BGRA rows, top
    down, drawn on a transparent background so it sits on any title bar.
    Supersampled 4x for clean edges; no imaging library needed."""
    import struct
    ss = 4
    body = (0x8F, 0xE3, 0xC4)
    eye = (0x1E, 0x20, 0x30)

    def sample(x, y):
        # coordinates in the SVG's 64-unit space
        inside = ((x - 32) ** 2 + (y - 27.4) ** 2 <= 18 ** 2 and y <= 27.4)
        if not inside and 14 <= x <= 50 and y >= 27.4:
            t = ((x - 14) % 12.4) / 12.4          # zigzag hem, 6 points
            inside = y <= 54 - 4.4 * (1 - abs(2 * t - 1))
        if not inside:
            return None
        if (x - 25) ** 2 + (y - 29) ** 2 <= 16 or (x - 39) ** 2 + (y - 29) ** 2 <= 16:
            return eye
        return body

    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0
            for sy in range(ss):
                for sx in range(ss):
                    c = sample((px + (sx + 0.5) / ss) * 64 / size,
                               (py + (sy + 0.5) / ss) * 64 / size)
                    if c:
                        r += c[0]; g += c[1]; b += c[2]; a += 1
            n = ss * ss
            if a:
                # premultiplied-free: average colour of covered samples
                row += struct.pack("<BBBB", b // a, g // a, r // a, 255 * a // n)
            else:
                row += b"\0\0\0\0"
        rows.append(bytes(row))
    return rows


def write_ico(path: str, sizes=(16, 24, 32, 48)) -> bool:
    """A classic ICO: one uncompressed 32-bit BMP entry per size, which every
    Windows version and gdk-pixbuf can read. PNG-in-ICO and SVG are not
    accepted by System.Drawing, which is what pywebview uses on Windows."""
    import struct
    entries = []
    for size in sizes:
        rows = _ghost_pixels(size)
        # BITMAPINFOHEADER with doubled height: colour rows then the AND mask
        header = struct.pack("<IiiHHIIiiII", 40, size, size * 2, 1, 32, 0,
                             size * size * 4, 0, 0, 0, 0)
        pixels = b"".join(reversed(rows))          # DIB rows are bottom-up
        stride = ((size + 31) // 32) * 4            # 1-bit mask, 4-byte rows
        mask = b"\0" * (stride * size)               # alpha carries transparency
        entries.append((size, header + pixels + mask))
    offset = 6 + 16 * len(entries)
    out = [struct.pack("<HHH", 0, 1, len(entries))]
    dirs, blobs = [], []
    for size, blob in entries:
        dirs.append(struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32,
                                len(blob), offset))
        blobs.append(blob)
        offset += len(blob)
    try:
        with open(path, "wb") as fh:
            fh.write(b"".join(out + dirs + blobs))
        return True
    except OSError:
        return False


def page_html() -> str:
    from urllib.parse import quote
    return (UI_HTML.replace("__ICON__", ICON_SVG)
            .replace("__FAVICON__", "data:image/svg+xml," + quote(ICON_SVG)))


UI_HTML = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ghost Typer</title>
<link rel="icon" href="__FAVICON__">
<style>
:root {
  /* palette: every pair here was checked against WCAG AA */
  --bg: #1E2030;
  --panel: #262A3E;
  --field: #171928;
  --line: #363B54;
  --edge: #4E5780;
  --text: #E4E7F5;
  --muted: #8E95B5;
  --accent: #8FE3C4;
  --accent-hi: #A6EDD3;
  --track: #6FB89E;
  --warn: #F2C14E;
  --stop: #E4736B;
  --ink: #12202A;
  --select: #3C4468;

  /* motion: a critically damped spring (damping 1.0) sampled for linear().
     0.48s is Apple's response 0.30, 0.64s is response 0.40. */
  --spring: linear(0 0%, .0667 4.2%, .2048 8.3%, .3577 12.5%, .4991 16.7%,
    .6189 20.8%, .7154 25%, .7905 29.2%, .8475 33.3%, .89 37.5%, .9213 41.7%,
    .9441 45.8%, .9605 50%, .9722 54.2%, .9805 58.3%, .9864 62.5%, .9905 66.7%,
    .9934 70.8%, .9955 75%, .9969 79.2%, .9978 83.3%, .9985 87.5%, .999 91.7%,
    .9993 95.8%, 1 100%);
  --quick: 0.48s;
  --settle: 0.64s;
  /* strong curves: the built-in ones are too weak to read as deliberate */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --fast: 140ms;
  /* press is the deliberate phase, release is the system answering */
  --tap-down: 160ms;
  --tap-up: 100ms;

  --sans: "Fira Sans", ui-sans-serif, system-ui, "Segoe UI", -apple-system,
    "Helvetica Neue", sans-serif;
  --mono: "Fira Code", "Cascadia Mono", ui-monospace, Menlo, Consolas,
    "DejaVu Sans Mono", monospace;
  color-scheme: dark;
}

*, *::before, *::after { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 400 13px/1.45 var(--sans);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
}
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; border: 0; background: none; padding: 0; }
:focus { outline: none; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }

/* The scroller. Whatever the window size, DPI or font metrics, nothing can
   end up unreachable: if it does not fit, it scrolls. */
#app {
  height: 100%; overflow-y: auto; overflow-x: hidden;
  scrollbar-gutter: stable;
  padding: 20px 24px 18px; display: flex; flex-direction: column; gap: 0;
}

/* ----------------------------------------------------------- compose */
#compose { display: flex; flex-direction: column; transition: opacity 180ms var(--ease-out); }
#compose.leaving { opacity: 0; }

h1 {
  display: flex; align-items: center; gap: 10px;
  margin: 0;
  font-size: 22px; font-weight: 700;
  line-height: 1.1; letter-spacing: -0.02em;     /* large text: tighten */
}
.mark { display: inline-flex; width: 26px; height: 26px; }
.mark svg { width: 100%; height: 100%; }
.sub { margin: 3px 0 0; color: var(--muted); }

.field {
  position: relative;
  margin-top: 14px;
  border: 1px solid var(--edge);
  border-radius: 8px;
  background: var(--field);
  transition: border-color 120ms ease;   /* focus is a keyboard action: no glow animation */
}
.field[data-invalid="true"] { border-color: var(--warn); }
.field:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}
textarea#text {
  display: block; width: 100%; height: 150px; resize: vertical;
  padding: 11px 13px; border: 0; background: transparent;
  font: 400 13px/1.5 var(--mono);
  caret-color: var(--accent);
  user-select: text; -webkit-user-select: text;
}
textarea::placeholder { color: var(--muted); opacity: .7; }
textarea::selection { background: var(--select); }
.meta { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-top: 6px; min-height: 1.4em; }
.error { margin: 0; font-size: 12px; color: var(--warn); }
.count { margin: 0 0 0 auto; text-align: right; font-size: 12px; color: var(--muted); min-height: 1.4em; }

.essentials { display: flex; align-items: center; gap: 10px; margin-top: 12px; }

/* segmented control: a pill that springs between choices */
.seg {
  position: relative; display: inline-flex; padding: 3px;
  background: var(--field); border-radius: 8px;
}
/* An "on" copy of the labels sits over the row, clipped to the current
   choice. Only the clip moves, so the text colour never crossfades and no
   layout property is animated. */
.seg .seg-on {
  position: absolute; inset: 0; display: flex; padding: 3px;
  background: var(--panel); color: var(--accent);
  pointer-events: none; will-change: clip-path;
  clip-path: inset(3px 100% 3px 0 round 6px);
}
.seg .seg-on span { padding: 6px 12px; white-space: nowrap; }
.seg button {
  position: relative;
  padding: 6px 12px; border-radius: 6px;
  color: var(--muted);
  transition: color var(--fast) ease, transform var(--tap-up) var(--ease-out);
}
.seg button:active { transform: scale(0.97);  transition-duration: var(--tap-down); }

.select { position: relative; }
.select select {
  appearance: none; -webkit-appearance: none;
  padding: 6px 30px 6px 10px; border: 0; border-radius: 6px;
  background: var(--field); color: var(--text); cursor: pointer;
  transition: background var(--fast) ease;
}
.select::after {
  content: ""; position: absolute; right: 11px; top: 50%;
  width: 7px; height: 7px; margin-top: -5px;
  border: solid var(--muted); border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg); pointer-events: none;
}

.note { margin: 0; font-size: 12px; color: var(--muted); }
#feelnote { margin-top: 8px; min-height: 1.4em; }

/* disclosure: height animates via grid rows, which is interruptible */
.disclosure {
  display: inline-flex; align-items: center; gap: 7px;
  margin-top: 14px; padding: 2px 0;
  color: var(--muted);
  transition: color var(--fast) ease;
}
.disclosure .chev {
  width: 0; height: 0;
  border-left: 5px solid transparent; border-right: 5px solid transparent;
  border-top: 6px solid currentColor;
  transform: rotate(-90deg);
  transition: transform var(--quick) var(--spring);
}
.disclosure[aria-expanded="true"] .chev { transform: rotate(0deg); }

.advanced {
  display: grid; grid-template-rows: 0fr;
  transition: grid-template-rows var(--settle) var(--spring);
}
.advanced[data-open="true"] { grid-template-rows: 1fr; }
.adv-inner { min-height: 0; overflow: hidden; }
.adv-card {
  margin-top: 8px; padding: 14px 16px 16px;
  background: var(--panel); border-radius: 10px;
}
/* the three groups arrive 40ms apart: decorative, never blocks input */
.adv-card .group {
  opacity: 0; transform: translateY(4px);
  transition: opacity 200ms var(--ease-out), transform var(--quick) var(--spring);
}
.advanced[data-open="true"] .group { opacity: 1; transform: none; }
.advanced[data-open="true"] .group:nth-child(2) { transition-delay: 40ms; }
.advanced[data-open="true"] .group:nth-child(3) { transition-delay: 80ms; }

.sec {
  margin: 14px 0 6px; font-size: 11px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted);
}
.group:first-child .sec { margin-top: 0; }

.row { display: grid; grid-template-columns: 84px 1fr 96px; align-items: center; gap: 8px; min-height: 30px; }
.row > span:first-child { color: var(--muted); }
.row .select { justify-self: start; }
.row output { color: var(--accent); font-variant-numeric: tabular-nums; }
.row.off > span:first-child, .row.off output { color: var(--line); }

/* range: the track fill follows the thumb 1:1 */
input[type="range"] {
  appearance: none; -webkit-appearance: none;
  width: 100%; height: 26px; margin: 0; background: transparent;
  --p: 50%;
}
input[type="range"]::-webkit-slider-runnable-track {
  height: 5px; border-radius: 3px;
  background: linear-gradient(90deg, var(--track) var(--p), var(--field) var(--p));
}
input[type="range"]::-webkit-slider-thumb {
  appearance: none; -webkit-appearance: none;
  width: 14px; height: 14px; margin-top: -4.5px; border-radius: 50%;
  background: var(--track); border: 2px solid var(--panel);
  transition: transform var(--tap-up) var(--ease-out), background var(--fast) ease;
}
input[type="range"]:hover::-webkit-slider-thumb,
input[type="range"]:focus-visible::-webkit-slider-thumb { background: var(--accent); }
input[type="range"]:active::-webkit-slider-thumb { transform: scale(1.15); transition-duration: var(--tap-down); }
input[type="range"]:focus-visible { outline: none; }
input[type="range"]:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent);
}
input[type="range"]:focus-visible::-webkit-slider-runnable-track {
  background: linear-gradient(90deg, var(--accent) var(--p), var(--field) var(--p));
}
input[type="range"]:disabled { opacity: .55; cursor: default; }
input[type="range"]:disabled::-webkit-slider-runnable-track {
  background: linear-gradient(90deg, var(--line) var(--p), var(--field) var(--p));
}
input[type="range"]:disabled::-webkit-slider-thumb { background: var(--line); }

.stepper { display: inline-flex; align-items: center; background: var(--field); border-radius: 6px; overflow: hidden; }
.stepper button { width: 32px; height: 32px; color: var(--muted); transition: background var(--fast) ease, color var(--fast) ease, transform var(--tap-up) var(--ease-out); }
.stepper button:active { transform: scale(0.94);  transition-duration: var(--tap-down); }
.stepper output { min-width: 44px; text-align: center; color: var(--accent); font-variant-numeric: tabular-nums; }
.stepper[aria-disabled="true"] { opacity: .5; pointer-events: none; }
.stepper[aria-disabled="true"] output { color: var(--muted); }

.keys { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.keys .cap { color: var(--muted); margin-right: 10px; }
.chip {
  min-width: 78px; min-height: 32px; padding: 6px 10px; border-radius: 6px;
  background: var(--field); color: var(--accent);
  transition: background var(--fast) ease, color var(--fast) ease, transform var(--tap-up) var(--ease-out);
}
.chip:active { transform: scale(0.96);  transition-duration: var(--tap-down); }
.chip.recording { background: var(--line); color: var(--warn); }

.toggles { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 14px; color: var(--muted); }
.toggles label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.toggles input { accent-color: var(--accent); width: 14px; height: 14px; margin: 0; }

/* buttons: one primary, quiet secondaries, one danger */
.primary {
  margin-top: 16px; width: 100%; padding: 12px;
  border-radius: 8px;
  background: var(--accent); color: var(--ink);
  font-size: 14px; font-weight: 700;
  transition: background var(--fast) ease, transform var(--tap-up) var(--ease-out), box-shadow var(--fast) ease;
}
.primary:active { transform: scale(0.985); box-shadow: none;  transition-duration: var(--tap-down); }
.primary:disabled { background: var(--line); color: var(--muted); box-shadow: none; cursor: default; transform: none; }

.secondary { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.quiet { padding: 8px 6px; min-height: 32px; color: var(--muted); border-radius: 4px; transition: color var(--fast) ease, transform var(--tap-up) var(--ease-out); }
.quiet:active { transform: scale(0.97);  transition-duration: var(--tap-down); }
.quiet:disabled { color: var(--line); cursor: default; transform: none; }
.dot { color: var(--line); }
#hint { margin-top: 12px; max-width: 560px; }

/* ----------------------------------------------------------- status */
#foot { margin-top: 16px; }
.status { margin: 0; font-size: 16px; line-height: 1.3; transition: color 220ms ease, filter 120ms ease, opacity 120ms ease; }
.status.swap { filter: blur(2px); opacity: 0.5; }
.status.warn { color: var(--warn); }
.status.good { color: var(--accent); }
.status.busy { color: var(--accent); }

.bar { position: relative; height: 10px; margin: 10px 0 8px; border-radius: 5px; background: var(--line); overflow: hidden; display: none; }
.bar.on { display: block; }
.bar .fill {
  position: absolute; inset: 0; width: 100%;
  transform-origin: left center; transform: scaleX(0);
  background: var(--accent); border-radius: 5px;
  transition: transform 160ms linear, background 220ms ease;
  will-change: transform;
}
.bar.countdown .fill { background: var(--warn); }
.bar.typing .fill { box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 45%, transparent); transition: transform 160ms linear, background 220ms ease, box-shadow 600ms var(--ease-out); }
.bar.done .fill { box-shadow: 0 0 18px color-mix(in srgb, var(--accent) 70%, transparent); }
#stats { min-height: 1.4em; }
#runrow {
  display: none; align-items: center; gap: 12px; margin-top: 14px;
  transition: opacity 160ms var(--ease-out), transform var(--quick) var(--spring);
}
#app[data-mode="run"] #runrow { display: flex; }
@starting-style {
  #app[data-mode="run"] #runrow { opacity: 0; transform: translateY(6px); }
}
#app[data-mode="run"] #compose { display: none; }
.danger { padding: 8px 22px; border-radius: 8px; background: var(--panel); color: var(--stop); transition: background var(--fast) ease, transform var(--tap-up) var(--ease-out); }
.danger:active { transform: scale(0.97);  transition-duration: var(--tap-down); }

/* ----------------------------------------------------------- sheets */
.scrim {
  position: fixed; inset: 0; z-index: 10; background: rgba(6, 8, 16, 0.55);
  opacity: 0; pointer-events: none; transition: opacity 200ms var(--ease-out);
}
.scrim.on { opacity: 1; pointer-events: auto; }
.sheet {
  position: fixed; z-index: 11; left: 16px; right: 16px; bottom: 16px; top: 16px;
  display: flex; flex-direction: column;
  padding: 16px 18px; border-radius: 12px;
  background: var(--panel);
  box-shadow: 0 24px 60px -20px rgba(0,0,0,.7);
  opacity: 0; transform: translateY(14px) scale(0.985);
  transform-origin: bottom center;
  pointer-events: none;
  transition: opacity 180ms var(--ease-out), transform var(--quick) var(--spring);
}
.sheet.on { opacity: 1; transform: none; pointer-events: auto; }
.sheet-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.sheet .note { margin-top: 8px; }
.sheet .body {
  flex: 1; margin-top: 10px; padding: 10px 12px; overflow: auto;
  border: 1px solid var(--line); border-radius: 8px;
  background: var(--field); font: 400 12.5px/1.55 var(--mono);
  transition: filter 120ms ease, opacity 120ms ease;
  white-space: pre-wrap; word-break: break-word; user-select: text; -webkit-user-select: text;
}
.body.swap { filter: blur(2px); opacity: 0.6; }
.body .mark { color: var(--warn); }
.body .back { color: var(--stop); }
.sheet .legend { margin-top: 10px; }
.close { padding: 6px 10px; border-radius: 6px; color: var(--muted); transition: color var(--fast) ease, background var(--fast) ease; }

#scratch textarea {
  width: 100%; height: 140px; resize: none; margin-top: 10px; padding: 11px 13px;
  border: 1px solid var(--edge); border-radius: 8px; background: var(--field);
  font: 400 13px/1.5 var(--mono); caret-color: var(--accent);
  user-select: text; -webkit-user-select: text;
}
#scratch textarea:focus { border-color: var(--accent); }

.toast {
  position: fixed; z-index: 12; left: 50%; bottom: 18px;
  padding: 8px 14px; border-radius: 8px;
  background: var(--panel); color: var(--text); border: 1px solid var(--line);
  box-shadow: 0 10px 30px -12px rgba(0,0,0,.6);
  opacity: 0; transform: translate(-50%, 8px);
  pointer-events: none;
  transition: opacity 160ms var(--ease-out), transform var(--quick) var(--spring);
}
.toast.on { opacity: 1; transform: translate(-50%, 0); }

/* ------------------------------------------------------------- tour */
.help {
  position: absolute; top: 0; right: 0;
  width: 30px; height: 30px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--muted); background: var(--panel);
  font-weight: 700;
  transition: color var(--fast) ease, background var(--fast) ease, transform var(--tap-up) var(--ease-out);
}
.help:active { transform: scale(0.94); transition-duration: var(--tap-down); }
#compose header { position: relative; }

#tour { position: fixed; inset: 0; z-index: 20; }
#tour[hidden] { display: none; }
/* one fixed box: its border is the highlight, its shadow is the dimming */
#tour-spot {
  position: fixed; left: 50%; top: 50%; width: 0; height: 0;
  border-radius: 10px; pointer-events: none;
  box-shadow: 0 0 0 200vmax rgba(6, 8, 16, 0.62);
  outline: 2px solid var(--accent); outline-offset: 0;
  opacity: 0;
  transition: left var(--quick) var(--spring), top var(--quick) var(--spring),
              width var(--quick) var(--spring), height var(--quick) var(--spring),
              opacity 200ms var(--ease-out), outline-color var(--fast) ease;
}
#tour-spot.bare { outline-color: transparent; }
#tour.on #tour-spot { opacity: 1; }
#tour-card {
  position: fixed; left: 0; top: 0;
  width: min(380px, calc(100vw - 32px));
  padding: 16px 18px 14px; border-radius: 12px;
  background: var(--panel); border: 1px solid var(--line);
  box-shadow: 0 24px 60px -24px rgba(0, 0, 0, 0.8);
  opacity: 0; transform: translate(var(--x, 0px), var(--y, 0px)) scale(0.985);
  transition: transform var(--quick) var(--spring), opacity 160ms var(--ease-out);
}
#tour.on #tour-card { opacity: 1; transform: translate(var(--x, 0px), var(--y, 0px)); }
#tour-card h2 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
#tour-card p { margin: 8px 0 0; color: var(--text); }
#tour-card .keys-note { margin-top: 10px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; color: var(--muted); font-size: 12px; }
#tour-card kbd {
  padding: 2px 8px; border-radius: 5px; background: var(--field); color: var(--accent);
  font: 600 12px/1.6 var(--sans);
}
.tour-foot { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.tour-foot .step { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; margin-right: auto; }
.tour-foot .primary { margin: 0; width: auto; padding: 8px 16px; font-size: 13px; }
.tour-foot .quiet { color: var(--text); }      /* muted does not clear 4.5:1 on the panel */

/* the welcome demo: a little window the ghost types into */
.demo { margin-top: 12px; border-radius: 8px; overflow: hidden; border: 1px solid var(--line); background: var(--field); }
.demo-bar { height: 22px; display: flex; align-items: center; gap: 6px; padding: 0 10px; background: var(--bg); }
.demo-bar i { width: 8px; height: 8px; border-radius: 50%; background: var(--line); }
.demo-text {
  min-height: 62px; padding: 10px 12px; font: 400 12.5px/1.55 var(--mono);
  white-space: pre-wrap; word-break: break-word; color: var(--text);
}
.demo-text::after { content: ""; display: inline-block; width: 2px; height: 1.1em; vertical-align: text-bottom; background: var(--accent); margin-left: 1px; animation: caret 1s steps(1) infinite; }
@keyframes caret { 50% { opacity: 0; } }

/* hover states only where a hover exists: touch fires them on tap */
@media (hover: hover) and (pointer: fine) {
  .help:hover { color: var(--accent); background: var(--line); }
  .select select:hover { background: var(--panel); }
  .disclosure:hover, .disclosure[aria-expanded="true"] { color: var(--text); }
  .stepper button:hover { background: var(--panel); color: var(--text); }
  .chip:hover { background: var(--line); }
  .primary:hover { background: var(--accent-hi); box-shadow: 0 6px 18px -8px color-mix(in srgb, var(--accent) 70%, transparent); }
  .quiet:hover { color: var(--accent); }
  .danger:hover { background: var(--line); }
  .close:hover { color: var(--text); background: var(--line); }
}

/* reduced motion: keep the state changes, drop the travel */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 120ms !important; transition-timing-function: ease !important; }
  .sheet, .toast, #runrow, .adv-card .group { transform: none !important; transition-delay: 0ms !important; }
  /* the progress fill keeps its smoothing: that is comprehension, not travel */
  .bar .fill { transition: transform 160ms linear, background 120ms ease !important; }
  .primary:active, .quiet:active, .chip:active, .danger:active, .seg button:active, .stepper button:active, .help:active { transform: none !important; }
  #tour-spot, #tour-card { transition: opacity 120ms ease !important; }
  .demo-text::after { animation: none; }
}
@media (prefers-contrast: more) {
  .field, .sheet, .toast { border-color: var(--muted); }
  .note, .count, .sub { color: var(--text); }
}
</style>
</head>
<body>
<main id="app" data-mode="compose">
  <section id="compose">
    <header>
      <h1><span class="mark" aria-hidden="true">__ICON__</span>Ghost Typer</h1>
      <p class="sub">Types your text into whatever window you click on.</p>
      <button type="button" id="tour-replay" class="help" aria-label="Show the tour">?</button>
    </header>

    <div class="field">
      <textarea id="text" spellcheck="false" aria-label="Text to type" aria-describedby="text-error"
        placeholder="Type or paste the text you want typed out."></textarea>
    </div>
    <div class="meta">
      <p id="text-error" class="error" role="alert" hidden></p>
      <p id="count" class="count" aria-live="polite"></p>
    </div>

    <div class="essentials">
      <div class="seg" id="feel" role="radiogroup" aria-label="Feel">
                <button type="button" role="radio" aria-checked="false" data-v="Robotic">Robotic</button>
        <button type="button" role="radio" aria-checked="false" data-v="Careful">Careful</button>
        <button type="button" role="radio" aria-checked="false" data-v="Natural">Natural</button>
        <button type="button" role="radio" aria-checked="false" data-v="Rushed">Rushed</button>
        <button type="button" role="radio" aria-checked="false" data-v="Custom">Custom</button>
      </div>
      <div class="select">
        <select id="layout" aria-label="Send as"></select>
      </div>
    </div>
    <p id="feelnote" class="note"></p>

    <button type="button" id="advtoggle" class="disclosure" aria-expanded="false" aria-controls="advanced">
      <span class="chev" aria-hidden="true"></span><span>Fine-tune</span>
    </button>
    <div id="advanced" class="advanced" data-open="false">
      <div class="adv-inner">
        <div class="adv-card">
          <div class="group">
          <h2 class="sec">Timing</h2>
          <label class="row"><span>Speed</span>
            <input type="range" id="wpm" min="20" max="200" step="1"><output for="wpm" id="wpm-out"></output></label>
          <label class="row" id="acc-row"><span>Accuracy</span>
            <input type="range" id="acc" min="85" max="100" step="1"><output for="acc" id="acc-out"></output></label>
          <label class="row" id="hes-row"><span>Hesitation</span>
            <input type="range" id="hes" min="0" max="100" step="1"><output for="hes" id="hes-out"></output></label>
          <label class="row"><span>Countdown</span>
            <input type="range" id="wait" min="3" max="30" step="1"><output for="wait" id="wait-out"></output></label>

          </div>
          <div class="group">
          <h2 class="sec">Delivery</h2>
          <label class="row" id="nl-row"><span>Enter key</span>
            <div class="select" style="grid-column: 2 / 4"><select id="newline"></select></div></label>
          <div class="row" id="cols-row"><span>Columns</span>
            <div class="stepper" id="cols" aria-disabled="false" style="grid-column: 2 / 4; justify-self: start">
              <button type="button" id="cols-dec" aria-label="Fewer columns">&minus;</button>
              <output id="cols-out" aria-live="polite">auto</output>
              <button type="button" id="cols-inc" aria-label="More columns">+</button>
            </div></div>

          </div>
          <div class="group">
          <h2 class="sec">Keys</h2>
          <div class="keys">
            <button type="button" class="chip" id="key-pause" aria-describedby="cap-pause hint">Esc</button><span class="cap" id="cap-pause">pause and hide</span>
            <button type="button" class="chip" id="key-stop" aria-describedby="cap-stop hint">F9</button><span class="cap" id="cap-stop">stop</span>
          </div>
          <div class="toggles">
            <label><input type="checkbox" id="strip"> Drop ** formatting marks</label>
            <label><input type="checkbox" id="ontop"> Stay on top</label>
            <label><input type="checkbox" id="remember"> Remember settings</label>
          </div>
          </div>
        </div>
      </div>
    </div>

    <button type="button" id="start" class="primary">Start typing</button>
    <div class="secondary">
      <button type="button" id="preview" class="quiet">Preview</button>
      <span class="dot" aria-hidden="true">&middot;</span>
      <button type="button" id="tryit" class="quiet">Try it here</button>
    </div>
    <p id="hint" class="note"></p>
  </section>

  <section id="foot">
    <p id="status" class="status" aria-live="polite">Ready when you are.</p>
    <div class="bar" id="bar" role="progressbar" aria-label="Typing progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="fill"></div></div>
    <p id="stats" class="note" aria-live="polite"></p>
    <div id="runrow">
      <button type="button" id="stop" class="danger">Stop</button>
      <span id="runhint" class="note"></span>
    </div>
  </section>

<div class="scrim" id="scrim"></div>
<div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
  <div class="sheet-head">
    <div class="seg" id="pv-mode" role="radiogroup" aria-label="Preview mode">
            <button type="button" role="radio" aria-checked="false" data-v="typed">What gets typed</button>
      <button type="button" role="radio" aria-checked="false" data-v="dry">Dry run with mistakes</button>
    </div>
    <button type="button" class="close" id="pv-close">Close</button>
  </div>
  <span id="sheet-title" hidden>Preview</span>
  <p class="note" id="pv-summary"></p>
  <div class="body" id="pv-body" tabindex="0" role="region" aria-label="Preview text"></div>
  <p class="note legend" id="pv-legend"></p>
</div>
<div class="sheet" id="scratch" role="dialog" aria-modal="true" aria-label="Scratch pad">
  <div class="sheet-head"><p class="note">Anything typed here goes nowhere. Close it when you're done.</p>
    <button type="button" class="close" id="scratch-close">Close</button></div>
  <textarea id="scratchpad" spellcheck="false" aria-label="Scratch pad"></textarea>
  <p class="note" id="scratch-note"></p>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>

<div id="tour" hidden>
  <div id="tour-spot" aria-hidden="true"></div>
  <div id="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
    <h2 id="tour-title"></h2>
    <p id="tour-body"></p>
    <div class="demo" id="tour-demo" hidden aria-hidden="true">
      <div class="demo-bar"><i></i><i></i><i></i></div>
      <div class="demo-text" id="demo-text"></div>
    </div>
    <div class="keys-note" id="tour-keys" hidden></div>
    <div class="tour-foot">
      <span class="step" id="tour-step"></span>
      <button type="button" class="quiet" id="tour-skip">Skip</button>
      <button type="button" class="quiet" id="tour-back">Back</button>
      <button type="button" class="primary" id="tour-next">Next</button>
    </div>
  </div>
</div>
</main>

<script>
(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const reduced = matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- a small spring: damping ratio 1.0, retargets from the live value */
function spring(getValue, apply, response = 0.3) {
  let value = getValue(), velocity = 0, target = value, raf = 0, last = 0;
  const omega = (2 * Math.PI) / response;
  function step(now) {
    const dt = Math.min(0.064, (now - last) / 1000 || 0.016); last = now;
    // critically damped: x'' + 2ωx' + ω²x = 0, integrated semi-implicitly
    const dx = value - target;
    velocity += (-2 * omega * velocity - omega * omega * dx) * dt;
    value += velocity * dt;
    if (Math.abs(value - target) < 0.05 && Math.abs(velocity) < 0.5) {
      value = target; velocity = 0; apply(value); raf = 0; return;
    }
    apply(value); raf = requestAnimationFrame(step);
  }
  return {
    to(t, jump = false) {
      target = t;
      if (jump || reduced.matches) { value = t; velocity = 0; apply(value); return; }
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
    },
    set(v) { value = target = v; velocity = 0; apply(value); }
  };
}

/* ---------- segmented control */
function segmented(root, onChange) {
  const buttons = [...root.querySelectorAll("button[role=radio]")];
  const on = document.createElement("div");
  on.className = "seg-on"; on.setAttribute("aria-hidden", "true");
  buttons.forEach(b => { const t = document.createElement("span"); t.textContent = b.textContent; on.appendChild(t); });
  root.appendChild(on);
  let L = 0, R = 0, current = null, ready = false;
  const paint = () => { on.style.clipPath = `inset(3px ${Math.max(0, R)}px 3px ${Math.max(0, L)}px round 6px)`; };
  // two edges, two independent springs: they may travel at different speeds
  const l = spring(() => 0, (v) => { L = v; paint(); });
  const r = spring(() => 0, (v) => { R = v; paint(); });
  function place(btn, jump) {
    const left = btn.offsetLeft, width = btn.offsetWidth;
    if (!width) return;                 // hidden: a measurement of 0 is not a target
    const right = root.clientWidth - left - width;
    if (!ready) { l.set(left); r.set(right); ready = true; }
    else { l.to(left, jump); r.to(right, jump); }
  }
  function refresh() { const b = buttons.find(b => b.dataset.v === current); if (b) place(b, true); }
  function set(value, silent) {
    const btn = buttons.find(b => b.dataset.v === value) || buttons[0];
    if (!btn) return;
    buttons.forEach(b => { const on = b === btn; b.setAttribute("aria-checked", on); b.tabIndex = on ? 0 : -1; });
    place(btn);
    const changed = current !== btn.dataset.v;
    current = btn.dataset.v;
    if (changed && !silent) onChange(current);
  }
  buttons.forEach((b, i) => {
    b.addEventListener("click", () => set(b.dataset.v));
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return; e.preventDefault();
      const n = buttons[(i + d + buttons.length) % buttons.length]; n.focus(); set(n.dataset.v);
    });
  });
  addEventListener("resize", refresh);
  return { set, get: () => current, refresh };
}

/* ---------- window sizing
   The old code asked for three hardcoded sizes. They were guesses at the
   content height, they ignored the window chrome (resize() sets the OUTER
   size, so the title bar ate the bottom of the page), and switching modes
   yanked the width about. Instead: measure what the layout actually needs,
   learn the chrome from the result, and never touch the width. */
let chromeH = 39;                 // window height minus viewport; corrected below
let sizing = false, sizeQueued = false;

function contentHeight() {
  const app = $("app"), cs = getComputedStyle(app);
  const top = app.getBoundingClientRect().top + app.scrollTop;
  let bottom = null;
  for (const el of app.children) {
    const es = getComputedStyle(el);
    if (es.position === "fixed" || es.display === "none") continue;  // sheets, tour
    const r = el.getBoundingClientRect();
    if (!r.height) continue;
    const b = r.bottom + app.scrollTop + (parseFloat(es.marginBottom) || 0);
    bottom = bottom === null ? b : Math.max(bottom, b);
  }
  if (bottom === null) return null;
  let need = bottom - top + (parseFloat(cs.paddingBottom) || 0);
  // A panel that is on its way open is still short. Ask for the height it is
  // heading for, so the window grows first and the panel unfolds into it
  // rather than being clipped for the length of the animation.
  const adv = $("advanced");
  if (adv && adv.dataset.open === "true") {
    const inner = adv.firstElementChild;
    if (inner) need += Math.max(0, inner.scrollHeight - adv.getBoundingClientRect().height);
  }
  return Math.ceil(need);
}

async function fit() {
  if (sizing) { sizeQueued = true; return; }
  sizing = true;
  try {
    do {
      sizeQueued = false;
      const need = contentHeight();
      if (need === null) break;
      await call("resize_to", Math.round(need + chromeH));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      // What we asked for should have left exactly `need` of viewport. Any
      // gap is chrome we guessed wrong; correct it and settle.
      const err = need - innerHeight;
      if (Math.abs(err) > 2 && Math.abs(err) < 500) {
        chromeH += err;
        await call("resize_to", Math.round(need + chromeH));
      }
    } while (sizeQueued);
  } finally { sizing = false; }
}

/* ---------- state */
const S = {
  feel: "Natural", layout: 0, wpm: 85, acc: 96, hes: 50, wait: 10, cols: 0,
  newline: 0, strip: true, ontop: true, remember: true, tour_seen: false,
};
const FEELS = {Robotic: [80, 100, 0], Careful: [62, 99, 35], Natural: [85, 96, 50], Rushed: [115, 92, 25]};
let boot = null, loading = true, mode = "compose", pvData = null, recording = null;

const api = () => window.pywebview && window.pywebview.api;
async function call(name, ...args) {
  const a = api(); if (!a) return null;
  try { return await a[name](...args); } catch (e) { console.error(name, e); return null; }
}

/* ---------- widgets */
const feelSeg = segmented($("feel"), (v) => { S.feel = v; applyFeel(); persist(); });
const pvSeg = segmented($("pv-mode"), () => renderPreview());

const ranges = {wpm: (v) => `${v} wpm`, acc: (v) => v >= 100 ? "no mistakes" : `${v}%`,
                hes: (v) => v == 0 ? "none" : `${v}%`, wait: (v) => `${v} seconds`};
for (const id of Object.keys(ranges)) {
  const el = $(id), out = $(id + "-out");
  const paint = () => {
    const p = (el.value - el.min) / (el.max - el.min) * 100;
    el.style.setProperty("--p", p.toFixed(2) + "%"); out.value = ranges[id](+el.value);
  };
  el.addEventListener("input", () => { S[id] = +el.value; paint(); if (id !== "wait") wentCustom(); persist(); });
  el.paint = paint;
}
function setRange(id, v) { const el = $(id); el.value = v; S[id] = +v; el.paint(); }

function fillSelect(el, options, value) {
  el.innerHTML = ""; options.forEach((o, i) => { const opt = document.createElement("option"); opt.value = i; opt.textContent = o; el.appendChild(opt); });
  el.value = value;
}

function applyFeel() {
  $("feelnote").textContent = boot ? boot.feel_notes[S.feel] || "" : "";
  if (FEELS[S.feel]) {
    const was = loading; loading = true;
    const [w, a, h] = FEELS[S.feel]; setRange("wpm", w); setRange("acc", a); setRange("hes", h);
    loading = was;
  }
  const adaptive = S.feel !== "Robotic";
  for (const id of ["acc", "hes"]) { $(id).disabled = !adaptive; $(id + "-row").classList.toggle("off", !adaptive); }
}
function wentCustom() {
  if (loading) return;
  const f = FEELS[S.feel]; if (!f) return;
  if (S.wpm !== f[0] || S.acc !== f[1] || S.hes !== f[2]) feelSeg.set("Custom");
}
function layoutChanged() {
  const table = S.layout !== 0;
  $("newline").disabled = table; $("nl-row").classList.toggle("off", table);
  $("cols").setAttribute("aria-disabled", !table); $("cols-row").classList.toggle("off", !table);
  updateCount();
}
let countTimer = 0;
function updateCount() {
  clearTimeout(countTimer);
  countTimer = setTimeout(async () => {
    const line = await call("count", $("text").value, S.layout, S.cols, S.strip);
    if (line !== null) $("count").textContent = line;
  }, 40);
}
function paintCols() { $("cols-out").value = S.cols ? String(S.cols) : "auto"; }
function paintKeys() {
  for (const which of ["pause", "stop"]) {
    const chip = $("key-" + which);
    chip.classList.toggle("recording", recording === which);
    chip.textContent = recording === which ? "press a key" : (boot ? boot.keys[which] : "");
  }
  if (boot) {
    $("hint").textContent = `${boot.keys.pause} pauses and hides this window. Press it again and the window comes back, counts you in, then carries on where it left off. ${boot.keys.stop} stops for good. Click either key above to reassign it.`;
    $("runhint").textContent = `${boot.keys.pause} hides and pauses  ·  press it again to come back  ·  ${boot.keys.stop} stops`;
  }
}

let persistTimer = 0;
function persist() {
  if (loading) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => call("save", snapshot()), 150);
}
function snapshot() { return {...S, text: undefined}; }

/* ---------- mode: compose <-> run */
let modeTimer = 0, modeWait = null;
function setMode(next) {
  if (next === mode) return;
  const app = $("app"), compose = $("compose");
  mode = next;
  // any swap still pending from the previous switch is now wrong: drop it
  clearTimeout(modeTimer);
  if (modeWait) { compose.removeEventListener("transitionend", modeWait); modeWait = null; }
  if (next === "run") {
    compose.classList.add("leaving");
    const go = () => {
      if (mode !== "run") return;          // a stop landed during the fade
      clearTimeout(modeTimer); modeWait = null;
      compose.classList.remove("leaving"); app.dataset.mode = "run"; fit();
    };
    if (reduced.matches) { go(); return; }
    modeWait = (e) => { if (e.target === compose && e.propertyName === "opacity") go(); };
    compose.addEventListener("transitionend", modeWait, { once: true });
    modeTimer = setTimeout(go, 260);       // fallback if the event never fires
  } else {
    app.dataset.mode = "compose"; compose.classList.add("leaving"); fit();
    requestAnimationFrame(() => requestAnimationFrame(() => { compose.classList.remove("leaving"); feelSeg.refresh(); }));
  }
}
function setBusy(busy) {
  for (const id of ["start", "preview", "tryit", "key-pause", "key-stop"]) $(id).disabled = busy;
  $("text").disabled = busy; $("stop").disabled = !busy;
  if (boot && boot.pynput_error && !busy) { $("start").disabled = true; $("tryit").disabled = true; }
  if (busy) tour.end();
  setMode(busy ? "run" : "compose");
}
let statusTimer = 0;
function setStatus(text, tone) {
  const el = $("status"), cls = "status" + (tone ? " " + tone : "");
  const tick = (t) => /^Typing starts in/.test(t);
  // a countdown tick is a number changing; everything else is a state change
  const soft = el.textContent !== text && !(tick(text) && tick(el.textContent)) && !reduced.matches;
  clearTimeout(statusTimer);
  if (!soft) { el.textContent = text; el.className = cls; return; }
  el.classList.add("swap");
  statusTimer = setTimeout(() => { el.textContent = text; el.className = cls; }, 90);
}
function setBar(frac, tone) {
  const bar = $("bar"); bar.classList.add("on");
  bar.classList.toggle("countdown", tone === "warn"); bar.classList.toggle("typing", tone === "good");
  bar.querySelector(".fill").style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
  bar.setAttribute("aria-valuenow", Math.round(frac * 100));
}

/* ---------- disclosure */
let advTimer = 0, advWait = null;
$("advtoggle").addEventListener("click", () => {
  const adv = $("advanced"), open = adv.dataset.open !== "true";
  $("advtoggle").setAttribute("aria-expanded", open);
  clearTimeout(advTimer);
  if (advWait) { adv.removeEventListener("transitionend", advWait); advWait = null; }
  if (open) {
    // grow the window first, then let the panel unfold into the room
    adv.dataset.open = "true"; fit();
  } else {
    // fold the panel first; shrinking the window early would clip it
    adv.dataset.open = "false";
    const shrink = () => { clearTimeout(advTimer); advWait = null; if (adv.dataset.open === "false") fit(); };
    if (reduced.matches) { shrink(); return; }
    advWait = (e) => { if (e.target === adv && e.propertyName === "grid-template-rows") shrink(); };
    adv.addEventListener("transitionend", advWait, { once: true });
    advTimer = setTimeout(shrink, 720);
  }
});

/* ---------- sheets */
function openSheet(id) { $("scrim").classList.add("on"); $(id).classList.add("on"); }
function closeSheets() { $("scrim").classList.remove("on"); for (const id of ["sheet", "scratch"]) $(id).classList.remove("on"); }
$("scrim").addEventListener("click", () => { if (mode === "compose") closeSheets(); });
$("pv-close").addEventListener("click", closeSheets);
$("scratch-close").addEventListener("click", () => { closeSheets(); if (mode === "run") call("stop"); });
addEventListener("keydown", (e) => { if (e.key === "Escape" && $("sheet").classList.contains("on")) closeSheets(); });

function esc(s) { return s.replace(/[&<>]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;"}[c])); }
let pvTimer = 0;
function renderPreview(instant) {
  if (!pvData) return;
  const body = $("pv-body");
  if (!instant && !reduced.matches && body.innerHTML) {
    // two texts overlapping read as two objects; a little blur reads as one
    body.classList.add("swap"); clearTimeout(pvTimer);
    pvTimer = setTimeout(() => { renderPreview(true); body.classList.remove("swap"); }, 90);
    return;
  }
  if (pvSeg.get() === "typed") {
    body.innerHTML = esc(pvData.typed).replace(/\t/g, '<span class="mark"> ⇥ </span>').replace(/\n/g, '<span class="mark"> ¶</span>\n');
  } else {
    body.innerHTML = esc(pvData.dry).replace(/←/g, '<span class="back">←</span>').replace(/[⇥¶]/g, m => `<span class="mark">${m}</span>`);
  }
}
function fieldError(msg) {
  const f = document.querySelector(".field"), e = $("text-error");
  if (msg) { f.dataset.invalid = "true"; e.textContent = msg; e.hidden = false; $("text").focus(); }
  else { delete f.dataset.invalid; e.hidden = true; e.textContent = ""; }
}
function fail(r) { if (!r || !r.error) return false; /no text/.test(r.error) ? fieldError(r.error) : toast(r.error); return true; }
let toastTimer = 0;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2400);
}

/* ---------- actions */
$("start").addEventListener("click", async () => {
  const r = await call("start", $("text").value, snapshot(), false);
  fail(r);
});
$("tryit").addEventListener("click", async () => {
  const r = await call("start", $("text").value, snapshot(), true);
  if (fail(r)) return;
  $("scratchpad").value = ""; $("scratch-note").textContent = "Typing starts in a moment.";
  openSheet("scratch"); $("scratchpad").focus();
});
$("stop").addEventListener("click", () => call("stop"));
$("preview").addEventListener("click", async () => {
  const r = await call("preview", $("text").value, snapshot());
  if (!r || fail(r)) return;
  pvData = r; $("pv-summary").textContent = r.summary; $("pv-legend").textContent = r.legend;
  pvSeg.set("typed", true); renderPreview(true); openSheet("sheet"); $("pv-body").focus();
});
$("text").addEventListener("input", () => { fieldError(null); updateCount(); });
$("layout").addEventListener("change", () => { S.layout = +$("layout").value; layoutChanged(); persist(); });
$("newline").addEventListener("change", () => { S.newline = +$("newline").value; persist(); });
$("cols-dec").addEventListener("click", () => { S.cols = Math.max(0, S.cols - 1); paintCols(); updateCount(); persist(); });
$("cols-inc").addEventListener("click", () => { S.cols = Math.min(24, S.cols + 1); paintCols(); updateCount(); persist(); });
for (const id of ["strip", "ontop", "remember"]) $(id).addEventListener("change", () => {
  S[id] = $(id).checked; if (id === "strip") updateCount(); if (id === "ontop") call("set_on_top", S.ontop); persist();
});
for (const which of ["pause", "stop"]) $("key-" + which).addEventListener("click", async () => {
  if (recording || mode !== "compose") return;
  const ok = await call("record", which);
  if (ok) { recording = which; paintKeys(); $("stats").textContent = "Press the key you want. It has to be one this app never types, like Esc, F1-F12 or Insert."; }
});

/* ---------- the tour: a spotlight over the real controls */
const tour = (() => {
  const root = $("tour"), spot = $("tour-spot"), card = $("tour-card");
  let i = -1, open = false, openedAdvanced = false, demoTimer = 0, lastFocus = null;
  const steps = () => {
    const k = boot ? boot.keys : { pause: "Esc", stop: "F9" };
    return [
      { title: "Ghost Typer types for you",
        body: "Paste text here, choose how it should type, then click into any other window. After a countdown it types it there, keystroke by keystroke, the way a person would.",
        demo: true },
      { target: ".field", title: "1 · Your text",
        body: "Type or paste anything: a message, a document, a table. The ** marks from markdown are dropped by default." },
      { target: "#feel", title: "2 · How it types",
        body: "Robotic is exact. Natural slips a few times a paragraph and fixes them. Rushed is fast and loose. Custom is your own numbers." },
      { target: "#layout", title: "3 · Where it goes",
        body: "Plain text for documents and chats. Table cells for Word, Docs, Excel or Sheets: it types cell by cell, moving along with Tab and Enter." },
      { target: "#advanced", title: "4 · Fine-tune", advanced: true,
        body: "Speed, accuracy, hesitation, the countdown, what Enter does, and the two hotkeys all live in here." },
      { target: ".secondary", title: "5 · Look before you type",
        body: "Preview shows exactly what will be typed, with a dry run of the mistakes. Try it here types into a scratch pad, so a first go can't touch anything." },
      { target: "#start", title: "6 · Start typing",
        body: "Press Start, then click into the window and field you want. The countdown gives you time to get there.",
        keys: [[k.pause, "hides Ghost Typer and pauses. Press it again and the window comes back, then counts you in so you can click into your document before it carries on"], [k.stop, "stops for good"]] },
      { title: "That's it",
        body: "Replay this any time with the ? in the corner. Your settings are remembered between runs." },
    ];
  };
  const DEMO = "Dear Sam,\n\nThanks for teh\b\bhe notes from Tuesday. I've folded them into the plan.";
  function runDemo() {
    const out = $("demo-text"); out.textContent = "";
    if (reduced.matches) {                        // no typing: show the finished text
      out.textContent = [...DEMO].reduce((acc, ch) => ch === "\b" ? acc.slice(0, -1) : acc + ch, "");
      return;
    }
    let pos = 0;
    const tick = () => {
      if (!open || i !== 0) return;
      if (pos >= DEMO.length) { demoTimer = setTimeout(() => { out.textContent = ""; pos = 0; tick(); }, 2200); return; }
      const ch = DEMO[pos++];
      if (ch === "\b") out.textContent = out.textContent.slice(0, -1);
      else out.textContent += ch;
      demoTimer = setTimeout(tick, ch === "\b" ? 110 : ch === " " ? 95 : 55 + Math.random() * 70);
    };
    demoTimer = setTimeout(tick, 500);
  }
  function place() {
    if (!open) return;
    const s = steps()[i], t = s.target && document.querySelector(s.target);
    const vw = innerWidth, vh = innerHeight, pad = 8;
    let cx = vw / 2, cy = vh / 2;
    if (t && t.offsetWidth) {
      const r = t.getBoundingClientRect();
      spot.classList.remove("bare");
      spot.style.left = (r.left - pad) + "px"; spot.style.top = (r.top - pad) + "px";
      spot.style.width = (r.width + pad * 2) + "px"; spot.style.height = (r.height + pad * 2) + "px";
      const ch = card.offsetHeight, cw = card.offsetWidth;
      let y = r.bottom + pad + 12;
      if (y + ch > vh - 12) y = Math.max(12, r.top - pad - 12 - ch);      // no room below: go above
      if (y + ch > vh - 12 && r.right + 12 + cw < vw) { y = Math.max(12, Math.min(r.top, vh - 12 - ch)); }
      let x = Math.min(Math.max(12, r.left), vw - cw - 12);
      card.style.setProperty("--x", x + "px"); card.style.setProperty("--y", y + "px");
    } else {
      spot.classList.add("bare");
      spot.style.left = cx + "px"; spot.style.top = cy + "px"; spot.style.width = "0px"; spot.style.height = "0px";
      card.style.setProperty("--x", Math.round((vw - card.offsetWidth) / 2) + "px");
      card.style.setProperty("--y", Math.round(Math.max(12, (vh - card.offsetHeight) / 2)) + "px");
    }
  }
  function show(n) {
    const list = steps(); i = Math.max(0, Math.min(list.length - 1, n));
    const s = list[i];
    clearTimeout(demoTimer);
    if (s.advanced && $("advanced").dataset.open !== "true") { $("advtoggle").click(); openedAdvanced = true; }
    // leaving the Fine-tune step: fold the panel we opened, so the later
    // targets sit where they do in the compact window
    else if (!s.advanced && openedAdvanced && $("advanced").dataset.open === "true") { $("advtoggle").click(); openedAdvanced = false; }
    $("tour-title").textContent = s.title; $("tour-body").textContent = s.body;
    $("tour-step").textContent = `${i + 1} / ${list.length}`;
    $("tour-back").disabled = i === 0; $("tour-back").hidden = i === 0;
    $("tour-skip").hidden = i === list.length - 1;
    $("tour-next").textContent = i === list.length - 1 ? "Done" : "Next";
    const demo = $("tour-demo"); demo.hidden = !s.demo; if (s.demo) runDemo();
    const kn = $("tour-keys"); kn.hidden = !s.keys;
    if (s.keys) kn.innerHTML = s.keys.map(([key, what]) => `<span><kbd>${esc(key)}</kbd> ${esc(what)}</span>`).join("");
    place();
    setTimeout(place, 700);                          // the panel may still be moving
    $("tour-next").focus({ preventScroll: true });
  }
  function start() {
    if (open) return;
    open = true; lastFocus = document.activeElement;
    root.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("on")));
    show(0);
  }
  function end() {
    if (!open) return;
    open = false; clearTimeout(demoTimer);
    root.classList.remove("on");
    setTimeout(() => { root.hidden = true; }, reduced.matches ? 130 : 260);
    if (openedAdvanced && $("advanced").dataset.open === "true") $("advtoggle").click();
    openedAdvanced = false;
    S.tour_seen = true; persist();
    (lastFocus && lastFocus.focus) ? lastFocus.focus({ preventScroll: true }) : $("tour-replay").focus();
  }
  $("tour-next").addEventListener("click", () => i >= steps().length - 1 ? end() : show(i + 1));
  $("tour-back").addEventListener("click", () => show(i - 1));
  $("tour-skip").addEventListener("click", end);
  $("tour-replay").addEventListener("click", start);
  addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); end(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); i >= steps().length - 1 ? end() : show(i + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); show(i - 1); }
    else if (e.key === "Tab") {
      // keep focus inside the card
      const f = [...card.querySelectorAll("button:not([hidden]):not(:disabled)")];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, true);
  addEventListener("resize", place);
  return { start, end, isOpen: () => open };
})();

/* ---------- events from Python */
window.gt = {
  on(msg) {
    switch (msg.type) {
      case "busy": setBusy(msg.value); $("foot").setAttribute("aria-busy", msg.value ? "true" : "false"); break;
      case "status":
        setStatus(msg.text, msg.tone);
        if (msg.tone === "good" && /^Done/.test(msg.text)) {
          // one settle on completion, then back to rest - not a loop
          const bar = $("bar"); bar.classList.add("done"); setTimeout(() => bar.classList.remove("done"), 140);
        }
        break;
      case "bar": setBar(msg.frac, msg.tone); break;
      case "stats": $("stats").textContent = msg.text; break;
      case "keys": boot.keys = msg.keys; recording = null; paintKeys(); break;
      case "done": closeSheets(); break;
      case "scratch-go": $("scratch-note").textContent = "Typing goes into the scratch pad."; $("scratchpad").focus(); break;
    }
  }
};

/* ---------- boot */
async function init() {
  boot = await call("boot");
  if (!boot) { setStatus("Bridge not ready", "warn"); return; }
  Object.assign(S, boot.settings);
  fillSelect($("layout"), boot.layouts, S.layout);
  fillSelect($("newline"), boot.newlines, S.newline);
  for (const id of ["wpm", "acc", "hes", "wait"]) setRange(id, S[id]);
  for (const id of ["strip", "ontop", "remember"]) $(id).checked = !!S[id];
  paintCols(); feelSeg.set(S.feel, true); applyFeel(); layoutChanged(); paintKeys();
  if (boot.pynput_error) {
    setStatus("pynput isn't installed", "warn");
    $("stats").textContent = `Install it without admin rights:  pip install --user pynput  (${boot.pynput_error})`;
    $("start").disabled = true; $("tryit").disabled = true;
  }
  loading = false;
  $("text").focus();
  fit();
  // the textarea has a resize grip; follow it rather than clip it
  if (window.ResizeObserver) {
    let t = 0;
    new ResizeObserver(() => { clearTimeout(t); t = setTimeout(fit, 120); })
      .observe($("text"));
  }
  if (!S.tour_seen) setTimeout(tour.start, 350);   // first run: after the page settles
}
if (api()) init(); else addEventListener("pywebviewready", init, {once: true});
})();
</script>
</body>
</html>
"""


# ------------------------------------------------------------------- app

class Api:
    """The only object the page can see. pywebview walks every attribute of
    its js_api recursively to build the bridge, so this stays deliberately
    thin: ten methods, and the app itself hidden behind an underscore."""

    def __init__(self, app):
        self._app = app

    def boot(self):
        return self._app.boot()

    def save(self, snapshot):
        return self._app.save(snapshot)

    def set_on_top(self, on):
        return self._app.set_on_top(on)

    def resize_to(self, height):
        return self._app.resize_to(height)

    def count(self, text, layout, cols, strip):
        return self._app.count(text, layout, cols, strip)

    def preview(self, text, snapshot):
        return self._app.preview(text, snapshot)

    def start(self, text, snapshot, testing=False):
        return self._app.start(text, snapshot, testing)

    def stop(self):
        return self._app.stop()

    def record(self, which):
        return self._app.record(which)


class GhostTyper:
    """Python side of the bridge. The page reaches it through Api."""

    IDLE, COUNTDOWN, TYPING = "idle", "countdown", "typing"

    def __init__(self):
        self.window = None
        self.ready = threading.Event()         # set once the page has loaded
        self.log = _log
        self.state = self.IDLE
        self.abort = threading.Event()
        self.running = threading.Event()       # clear = paused
        self.running.set()
        self.resuming = threading.Event()      # set = counting back in
        self.q: queue.Queue = queue.Queue()
        self.listener = None
        self.recorder = None
        self.recording = None
        self.worker = None
        self.deadline = 0.0
        self.frozen_left = 0.0
        self.paused_seconds = 0.0
        self.testing = False
        self.engine = None
        self.total = 1
        self.run_layout = "plain"
        self.run_newline = NEWLINES[0]
        self.run_cols = 0
        self.excluded = _excluded_keys()
        self.hotkeys = {"pause": getattr(KbKey, "esc", None),
                        "stop": getattr(KbKey, "f9", None)}
        self.settings = {
            "feel": "Natural", "layout": 0, "wpm": 85, "acc": 96, "hes": 50,
            "wait": 10, "cols": 0, "newline": 0, "strip": True, "ontop": True,
            "remember": True, "tour_seen": False,
        }
        self._load_settings()

    # ------------------------------------------------------------ bridge

    def attach(self, window):
        self.window = window
        window.events.loaded += self._loaded
        window.events.closing += self._on_close
        threading.Thread(target=self._pump, daemon=True).start()

    def _loaded(self):
        self.log("page loaded")
        self.ready.set()

    def _push(self, **msg):
        self.q.put(("ui", msg))

    def _pump(self):
        """Drain the queue on one thread; the page is single-threaded too."""
        while True:
            try:
                msg = self.q.get(timeout=0.5)
            except queue.Empty:
                continue
            kind = msg[0]
            if kind == "ui" and not self.ready.wait(timeout=10):
                continue                        # page never came up; drop it
            try:
                if kind == "ui":
                    self._eval(msg[1])
                elif kind == "pause":
                    self._toggle_pause()
                elif kind == "hotkey":
                    self._assign(msg[1], msg[2])
                elif kind == "progress":
                    self._progress(*msg[1:])
                elif kind == "done":
                    self._done(*msg[1:])
            except Exception as exc:           # never let the pump die
                self.log(f"pump: {kind}: {exc!r}")

    def _eval(self, msg):
        if self.window is None:
            return
        try:
            self.window.evaluate_js(f"window.gt && gt.on({json.dumps(msg)})")
        except Exception:
            pass

    # ------------------------------------------------------- page -> python

    def boot(self):
        return {
            "settings": self.settings,
            "layouts": LAYOUTS,
            "newlines": NEWLINES,
            "feel_notes": FEEL_NOTES,
            "keys": self._key_labels(),
            "pynput_error": PYNPUT_ERROR,
        }

    def save(self, snapshot):
        self._take(snapshot)
        self._save_settings()

    def set_on_top(self, on):
        self.settings["ontop"] = bool(on)
        if self.window is not None and self.state == self.IDLE:
            try:
                self.window.on_top = bool(on)
            except Exception:
                pass

    def _screen_limit(self):
        """Height of the primary display, in the same logical pixels the
        window is measured in, so the window can never outgrow the screen.

        The primary is the right answer on one monitor and a fair guess on
        several; being clamped only costs a scrollbar now that the page can
        scroll, while being too generous puts the buttons off-screen.
        """
        try:
            return int(webview.screens[0].height * 0.92)
        except Exception:
            return 100000        # no idea: let the page ask for what it likes

    def resize_to(self, height):
        """Set the window height only; the width stays where the user left it.

        The page measures what it needs and adds the chrome it has learned,
        so nothing here guesses. All this does is keep the window on screen.
        """
        if self.window is None:
            return None
        try:
            wanted = int(height)
        except (TypeError, ValueError):
            return None
        wanted = max(MIN_SIZE[1], min(wanted, self._screen_limit()))
        try:
            self.window.resize(self.window.width, wanted)
        except Exception:
            pass
        return wanted

    def count(self, text, layout, cols, strip):
        body = text or ""
        if int(layout) != 0:
            grid = self._grid(body, int(cols))
            if grid and grid[0]:
                rows, width, kind, notes = grid
                bits = [f"{len(rows)} rows × {width} columns",
                        f"read as {kind}"]
                bits.extend(notes)
                if strip and strip_markdown(body) != body:
                    bits.append("formatting marks removed")
                return " · ".join(bits)
        lines = body.count("\n") + 1 if body else 0
        return f"{len(body)} characters · {lines} lines"

    def preview(self, text, snapshot):
        self._take(snapshot)
        if not (text or "").strip():
            return {"error": "There's no text to type yet."}
        body = self._typing_text(text)
        engine = HumanTyper(body, self._engine_settings())
        seconds, strokes, mistakes = engine.estimate()
        minutes, rest = divmod(int(seconds + 0.5), 60)
        clock = f"{minutes}m {rest}s" if minutes else f"{rest}s"
        pace = len(engine.text) / 5 / (seconds / 60) if seconds > 0 else 0
        summary = (f"{len(engine.text)} characters · about {clock} at "
                   f"{pace:.0f} wpm · {strokes} keystrokes")
        if engine.adaptive:
            kinds = ", ".join(f"{v} {MECHANISM_NAMES[k]}"
                              for k, v in sorted(engine.tally.items(),
                                                 key=lambda kv: -kv[1]))
            summary += f"  ·  {mistakes} mistakes made and fixed"
            if kinds:
                summary += f": {kinds}"
        legend = ("⇥ moves to the next cell, ¶ to the next row."
                  if self._layout_mode() != "plain"
                  else "¶ is a line break.")
        legend += "  On the dry run, red arrows are backspaces putting a mistake right."
        return {"typed": body, "dry": engine.transcript(), "summary": summary,
                "legend": legend}

    def start(self, text, snapshot, testing=False):
        if self.state != self.IDLE:
            return {"error": "Already running."}
        self._take(snapshot)
        if not (text or "").strip():
            return {"error": "There's no text to type yet."}
        if PYNPUT_ERROR:
            return {"error": "pynput isn't installed."}
        body = self._typing_text(text)
        self.engine = HumanTyper(body, self._engine_settings())
        self.total = max(1, len(self.engine.text))
        self.run_layout = self._layout_mode()
        self.run_newline = NEWLINES[int(self.settings["newline"])]
        self.run_cols = 0
        if self.run_layout != "plain":
            grid = self._grid(text, int(self.settings["cols"]))
            self.run_cols = grid[1] if grid else 0
        self.testing = bool(testing)
        self.abort.clear()
        self.running.set()
        self.paused_seconds = 0.0
        self._save_settings()
        self._push(type="busy", value=True)
        self._push(type="bar", frac=0, tone="warn")
        self._push(type="stats",
                   text="Typing goes into the scratch pad." if self.testing
                   else "Click into the window and field you want to type in.")
        self._start_listener()
        if self.settings["ontop"] and not self.testing and self.window:
            try:
                self.window.on_top = True
            except Exception:
                pass
        self.state = self.COUNTDOWN
        seconds = 3 if self.testing else int(self.settings["wait"])
        self.deadline = time.perf_counter() + seconds
        threading.Thread(target=self._countdown, args=(seconds,),
                         daemon=True).start()
        return {"ok": True}

    def stop(self):
        self.abort.set()
        self.running.set()
        return True

    def record(self, which):
        if self.state != self.IDLE or KbListener is None or self.recording:
            return False
        self.recording = which

        def grab(key):
            self.q.put(("hotkey", which, key))
            return False

        try:
            self.recorder = KbListener(on_press=grab)
            self.recorder.start()
        except Exception:
            self.recording = self.recorder = None
            return False
        return True

    # ------------------------------------------------------------- state

    def _take(self, snapshot):
        if not isinstance(snapshot, dict):
            return
        for k in self.settings:
            if k in snapshot and snapshot[k] is not None:
                self.settings[k] = snapshot[k]

    def _engine_settings(self) -> Settings:
        s = self.settings
        return Settings(wpm=int(s["wpm"]), accuracy=float(s["acc"]),
                        hesitation=float(s["hes"]),
                        adaptive=s["feel"] != "Robotic")

    def _layout_mode(self) -> str:
        choice = LAYOUTS[int(self.settings["layout"])]
        if choice.startswith("Table"):
            return "excel" if "Excel" in choice else "word"
        return "plain"

    def _grid(self, text, cols):
        parsed = parse_table(text or "")
        if not parsed:
            return None
        rows, kind = parsed
        squared, width, notes = square_up(rows, cols)
        return squared, width, kind, notes

    def _typing_text(self, text) -> str:
        body = text or ""
        if self._layout_mode() != "plain":
            grid = self._grid(body, int(self.settings["cols"]))
            if grid and grid[0]:
                body = grid_to_stream(grid[0])
        if self.settings["strip"]:
            body = strip_markdown(body)
        return body

    def _key_labels(self):
        return {w: key_label(k) for w, k in self.hotkeys.items()}

    def _load_settings(self):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as fh:
                saved = json.load(fh)
        except Exception:
            return
        try:
            s = self.settings
            s["wpm"] = int(saved.get("wpm", s["wpm"]))
            s["acc"] = int(saved.get("accuracy", s["acc"]))
            s["hes"] = int(saved.get("hesitation", s["hes"]))
            s["wait"] = int(saved.get("countdown", s["wait"]))
            s["cols"] = int(saved.get("columns", 0))
            if saved.get("layout") in LAYOUTS:
                s["layout"] = LAYOUTS.index(saved["layout"])
            if saved.get("feel"):
                s["feel"] = saved["feel"]
            if saved.get("newline") in NEWLINES:
                s["newline"] = NEWLINES.index(saved["newline"])
            for name, key in (("strip_markdown", "strip"), ("on_top", "ontop"),
                              ("remember", "remember"), ("tour_seen", "tour_seen")):
                if name in saved:
                    s[key] = bool(saved[name])
            if KbKey is not None:
                for which in ("pause", "stop"):
                    key = getattr(KbKey, saved.get(f"{which}_key", ""), None)
                    if key is not None and key not in self.excluded:
                        self.hotkeys[which] = key
        except Exception:
            pass

    def _save_settings(self):
        s = self.settings
        if not s["remember"]:
            try:
                with open(SETTINGS_FILE, "w", encoding="utf-8") as fh:
                    json.dump({"remember": False,
                               "tour_seen": bool(s.get("tour_seen"))}, fh)
            except Exception:
                pass
            return
        data = {
            "wpm": s["wpm"], "accuracy": s["acc"], "hesitation": s["hes"],
            "countdown": s["wait"], "columns": s["cols"],
            "layout": LAYOUTS[int(s["layout"])], "feel": s["feel"],
            "newline": NEWLINES[int(s["newline"])],
            "strip_markdown": s["strip"], "on_top": s["ontop"],
            "remember": True, "tour_seen": bool(s.get("tour_seen")),
            "pause_key": getattr(self.hotkeys["pause"], "name", ""),
            "stop_key": getattr(self.hotkeys["stop"], "name", ""),
        }
        try:
            with open(SETTINGS_FILE, "w", encoding="utf-8") as fh:
                json.dump(data, fh, indent=1)
        except Exception:
            pass

    # ----------------------------------------------------------- hotkeys

    def _assign(self, which: str, key):
        self.recording = self.recorder = None
        other = "stop" if which == "pause" else "pause"
        if KbKey is None or not isinstance(key, KbKey) or key in self.excluded:
            text = (f"{key_label(key)} won't work as a hotkey. Pick one this "
                    f"app never types, such as Esc, F1-F12, Insert or Home.")
        elif key == self.hotkeys[other]:
            text = f"{key_label(key)} is already the {other} key."
        else:
            self.hotkeys[which] = key
            text = f"{which.capitalize()} key is now {key_label(key)}."
            self._save_settings()
        self._push(type="keys", keys=self._key_labels())
        self._push(type="stats", text=text)

    def _start_listener(self):
        if KbListener is None:
            return

        def on_press(key):
            if key == self.hotkeys["stop"]:
                self.abort.set()
                self.running.set()
            elif key == self.hotkeys["pause"]:
                self.q.put(("pause",))

        try:
            self.listener = KbListener(on_press=on_press)
            self.listener.start()
        except Exception:
            self.listener = None

    def _stop_listener(self):
        for attr in ("listener", "recorder"):
            obj = getattr(self, attr, None)
            if obj is not None:
                try:
                    obj.stop()
                except Exception:
                    pass
                setattr(self, attr, None)
        if self.recording:
            self.recording = None
            self._push(type="keys", keys=self._key_labels())

    # --------------------------------------------------------------- run

    def _hide(self):
        """Out of sight completely - taskbar button and all.

        The pause key is the way back: nothing else reveals the window
        again, which is the point when it is typing into someone else's
        document.
        """
        if self.testing or self.window is None:
            return
        try:
            self.window.hide()
        except Exception:
            pass

    def _show(self):
        if self.testing or self.window is None:
            return
        try:
            self.window.show()
        except Exception:
            pass

    def _paused_message(self):
        return (f"Paused and hidden. Press "
                f"{key_label(self.hotkeys['pause'])} to bring it back.")

    def _toggle_pause(self):
        if self.state not in (self.COUNTDOWN, self.TYPING):
            return

        if self.resuming.is_set():
            # Pressed again while it was counting back in: hide and hold.
            self.resuming.clear()
            self._push(type="status", tone="warn", text=self._paused_message())
            self._hide()
            return

        if self.running.is_set():
            # Bank the time left before touching the window, so a slow
            # window manager cannot eat into the countdown.
            self.frozen_left = self.deadline - time.perf_counter()
            self.running.clear()
            self._push(type="status", tone="warn", text=self._paused_message())
            self._hide()
            return

        # Coming back. Showing the window takes keyboard focus with it, so
        # typing cannot start in the same breath - the keystrokes would land
        # in this window instead of the target. Show, then count the user
        # back into place.
        self._show()
        self.resuming.set()
        threading.Thread(target=self._resume_countdown, daemon=True).start()

    def _resume_countdown(self):
        end = time.perf_counter() + RESUME_COUNTDOWN
        while self.resuming.is_set():
            if self.abort.is_set():
                self.resuming.clear()
                return
            left = end - time.perf_counter()
            if left <= 0:
                break
            self._push(type="status", tone="warn",
                       text=f"Click back into the window you want, "
                            f"then typing carries on in "
                            f"{max(1, math.ceil(left))}…")
            self._push(type="bar", frac=1 - left / RESUME_COUNTDOWN,
                       tone="warn")
            time.sleep(0.1)
        if not self.resuming.is_set():
            return                       # a second press put it back to sleep
        self.resuming.clear()
        self.deadline = time.perf_counter() + self.frozen_left
        self.running.set()
        self._push(type="status", tone="good",
                   text="Typing…" if self.state == self.TYPING
                   else "Counting down…")

    def _countdown(self, seconds):
        while self.state == self.COUNTDOWN:
            if self.abort.is_set():
                self._finish("Stopped before it started.")
                return
            if not self.running.is_set():
                time.sleep(0.1)
                continue
            left = self.deadline - time.perf_counter()
            if left <= 0:
                self._push(type="status", tone="good", text="Typing…")
                self._push(type="bar", frac=0, tone="good")
                if self.testing:
                    self._push(type="scratch-go")
                self.state = self.TYPING
                self.worker = threading.Thread(target=self._run, daemon=True)
                self.worker.start()
                return
            self._push(type="status", tone="warn",
                       text=f"Typing starts in {max(1, math.ceil(left))}…")
            self._push(type="bar", frac=1 - left / max(1, seconds), tone="warn")
            time.sleep(0.1)

    @staticmethod
    def _tap(kb, key):
        kb.press(key)
        kb.release(key)

    def _emit(self, kb, ch: str):
        if ch == "\t":
            self._tap(kb, KbKey.tab)
        elif ch == "\n":
            if self.run_layout == "word":
                self._tap(kb, KbKey.tab)
            elif self.run_layout == "excel":
                self._tap(kb, KbKey.enter)
            elif self.run_newline.startswith("Space"):
                kb.type(" ")
            elif self.run_newline.startswith("Shift"):
                kb.press(KbKey.shift)
                self._tap(kb, KbKey.enter)
                kb.release(KbKey.shift)
            else:
                self._tap(kb, KbKey.enter)
        else:
            kb.type(ch)

    RESUME_GRACE = 0.6      # let focus settle before keystrokes start again

    def _sleep(self, seconds: float) -> bool:
        end = time.perf_counter() + seconds
        while True:
            if self.abort.is_set():
                return False
            if not self.running.is_set():
                held = time.perf_counter()
                while not self.running.is_set():
                    if self.abort.is_set():
                        return False
                    time.sleep(0.04)
                gap = time.perf_counter() - held
                self.paused_seconds += gap
                end += gap + self.RESUME_GRACE
            left = end - time.perf_counter()
            if left <= 0:
                return True
            time.sleep(min(left, 0.02))

    def _run(self):
        kb = KbController()
        net = strokes = cells = rows = 0
        started = time.perf_counter()
        last_push = 0.0
        reason = "Done."
        try:
            for kind, value, delay in self.engine.events():
                if not self._sleep(delay):
                    reason = "Stopped."
                    break
                try:
                    if kind == "type":
                        self._emit(kb, value)
                        net += 1
                        if value == "\t":
                            cells += 1
                        elif value == "\n":
                            cells += 1
                            rows += 1
                    else:
                        self._tap(kb, KbKey.backspace)
                        net -= 1
                except Exception:
                    pass
                strokes += 1
                now = time.perf_counter()
                if now - last_push > 0.1:
                    last_push = now
                    self.q.put(("progress", net, now - started - self.paused_seconds,
                                self.engine.mistakes, cells, rows))
        except Exception as exc:                       # pragma: no cover
            reason = f"Stopped: {exc}"
        finally:
            for key in (KbKey.shift, KbKey.shift_r):
                try:
                    kb.release(key)
                except Exception:
                    pass
        elapsed = time.perf_counter() - started - self.paused_seconds
        self.q.put(("progress", net, elapsed, self.engine.mistakes, cells, rows))
        self.q.put(("done", reason, net, elapsed, self.engine.mistakes))

    def _where(self, cells: int, rows: int) -> str:
        if self.run_layout == "plain" or not self.run_cols:
            return ""
        if self.run_layout == "word":
            row, col = divmod(cells, self.run_cols)
        else:
            row, col = rows, cells - rows
        return f" · row {row + 1}, column {col + 1}"

    def _progress(self, net, elapsed, missed, cells, rows):
        self._eval({"type": "bar", "frac": net / self.total, "tone": "good"})
        pace = (net / 5) / (elapsed / 60) if elapsed > 0.4 else 0
        line = (f"{max(0, net)} / {self.total} characters · {elapsed:.1f}s "
                f"· {pace:.0f} wpm")
        if self.engine.adaptive:
            line += f" · {missed} fixed"
        line += self._where(cells, rows)
        self._eval({"type": "stats", "text": line})

    def _done(self, reason, net, elapsed, missed):
        pace = (net / 5) / (elapsed / 60) if elapsed > 0.4 else 0
        tail = f"{max(0, net)} characters in {elapsed:.1f}s at {pace:.0f} wpm"
        if self.engine.adaptive and missed:
            tail += f", {missed} mistake{'' if missed == 1 else 's'} corrected"
        self._finish(reason, tail)

    def _finish(self, reason: str, detail: str = ""):
        self.state = self.IDLE
        self._stop_listener()
        self.abort.clear()
        self.running.set()
        self.resuming.clear()
        was_testing, self.testing = self.testing, False
        if self.window is not None:
            try:
                if not was_testing:
                    self.window.show()
                self.window.on_top = False
            except Exception:
                pass
        self._push(type="busy", value=False)
        self._push(type="status", text=reason,
                   tone="good" if reason.startswith("Done") else "warn")
        if detail:
            self._push(type="stats", text=detail)
        elif reason.startswith("Stopped before"):
            self._push(type="stats", text="")
            self._push(type="bar", frac=0, tone="good")
        self._push(type="done")

    def _on_close(self):
        self.abort.set()
        self.running.set()
        self._save_settings()
        self._stop_listener()


def main():
    if "--selftest" in sys.argv:
        passed = selftest()
        print()
        passed = table_selftest() and passed
        print()
        print("all checks passed" if passed else "SOMETHING FAILED")
        sys.exit(0 if passed else 1)
    if "--dump-ui" in sys.argv:
        # Write the page out so it can be opened in a browser (no bridge).
        path = sys.argv[sys.argv.index("--dump-ui") + 1]
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(page_html())
        print(f"wrote {path}")
        return
    if WEBVIEW_ERROR:
        print("Ghost Typer needs pywebview for its window:\n\n"
              "    pip install --user pywebview\n\n"
              f"({WEBVIEW_ERROR})", file=sys.stderr)
        sys.exit(1)
    _install_crash_log()
    _log(f"starting: python {sys.version.split()[0]} on {sys.platform}, "
         f"pywebview {getattr(webview, '__version__', '?')}")
    app = GhostTyper()
    # The window icon has to be a real .ico: pywebview hands it to
    # System.Drawing on Windows, which rejects anything else and cannot be
    # caught from Python. Only pass a file we wrote successfully.
    icon = None
    try:
        import tempfile
        candidate = os.path.join(tempfile.gettempdir(), "ghost_typer.ico")
        if write_ico(candidate):
            icon = candidate
    except Exception:
        icon = None
    window = webview.create_window(
        "Ghost Typer", html=page_html(), js_api=Api(app),
        width=COMPOSE_SIZE[0], height=COMPOSE_SIZE[1],
        min_size=MIN_SIZE, on_top=bool(app.settings["ontop"]),
        background_color="#1E2030", text_select=True)
    app.attach(window)
    debug = "--debug" in sys.argv          # opens the web inspector
    _log(f"window created, icon={'yes' if icon else 'no'}, debug={debug}")
    try:
        if icon:
            webview.start(icon=icon, debug=debug)
        else:
            webview.start(debug=debug)
    except TypeError:                     # an older pywebview without icon=
        webview.start(debug=debug)
    _log("window closed")


if __name__ == "__main__":
    main()
