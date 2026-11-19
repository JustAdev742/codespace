"""Uno with the robot: the full card game (official rules for two players), the robot's strategy, and the robot
playing it for real in the house - sitting at the dining table, reaching to the card tray to draw and to play.

    from uno import Uno, RobotPlayer, RandomPlayer
    g = Uno(seed=1); g.play(RobotPlayer(), RandomPlayer())      # one game, no robot body
    python uno.py --games 1000                                  # the strategy against a random player

Rules: a 108-card deck (per colour: one 0, two each of 1-9, Skip, Reverse and Draw Two; four Wilds and four Wild Draw
Fours); seven cards each; play a card of the same colour, number or symbol, or a Wild; Wild Draw Four only when you
hold nothing of the current colour; no playable card: draw one, and play it if you can; with two players Reverse
acts as Skip; say "Uno" when you are down to one card, or draw two if the other player catches you; first to empty
their hand wins. In the house, "you" are the other player: in live mode you type your cards, in the tests a simulated
player plays (sometimes forgetting to say Uno).
"""
from __future__ import annotations

import argparse
import random
from dataclasses import dataclass

COLOURS = ["red", "yellow", "green", "blue"]
RGB = {"red": (0.85, 0.1, 0.1), "yellow": (0.95, 0.8, 0.1), "green": (0.15, 0.65, 0.25), "blue": (0.15, 0.35, 0.85),
       None: (0.1, 0.1, 0.1)}


@dataclass(frozen=True)
class Card:
    colour: str | None          # None for wilds
    value: str                  # "0".."9", "skip", "reverse", "draw2", "wild", "wild4"

    def __str__(self):
        names = {"draw2": "draw two", "wild4": "wild draw four"}
        v = names.get(self.value, self.value)
        return v if self.colour is None else f"{self.colour} {v}"


def deck():
    d = []
    for c in COLOURS:
        d.append(Card(c, "0"))
        for v in [str(n) for n in range(1, 10)] + ["skip", "reverse", "draw2"]:
            d += [Card(c, v), Card(c, v)]
    d += [Card(None, "wild")] * 4 + [Card(None, "wild4")] * 4
    return d


class Uno:
    def __init__(self, seed=0, log=None):
        self.rng = random.Random(seed)
        self.log = log or (lambda *a: None)
        self.draw_pile = deck()
        self.rng.shuffle(self.draw_pile)
        self.hands = [[self.draw_pile.pop() for _ in range(7)] for _ in range(2)]
        self.discard = [self.draw_pile.pop()]
        while self.discard[-1].value == "wild4":           # never start on a Wild Draw Four
            self.draw_pile.insert(0, self.discard.pop())
            self.discard.append(self.draw_pile.pop())
        self.colour = self.discard[-1].colour
        self.turn = 0
        self.said_uno = [False, False]
        self.illegal = 0
        self.history = []

    # ----------------------------------------------------------------------------------------- rules
    def legal(self, card, hand):
        top = self.discard[-1]
        if card.value == "wild":
            return True
        if card.value == "wild4":
            return not any(c.colour == self.colour for c in hand)
        return card.colour == self.colour or card.value == top.value

    def playable(self, p):
        return [c for c in self.hands[p] if self.legal(c, self.hands[p])]

    def draw(self, p, n=1):
        got = []
        for _ in range(n):
            if not self.draw_pile:                          # reshuffle the discards under the top card
                top = self.discard.pop()
                self.draw_pile = self.discard
                self.rng.shuffle(self.draw_pile)
                self.discard = [top]
            if self.draw_pile:
                got.append(self.draw_pile.pop())
        self.hands[p] += got
        self.said_uno[p] = False
        return got

    def apply(self, p, card, colour=None):
        """Player p plays card (checked). Returns who plays next."""
        if card not in self.hands[p] or not self.legal(card, self.hands[p]):
            self.illegal += 1
            raise ValueError(f"illegal play: {card} on {self.discard[-1]} ({self.colour})")
        self.hands[p].remove(card)
        self.discard.append(card)
        self.colour = colour if card.colour is None else card.colour
        self.history.append((p, str(card), self.colour))
        other = 1 - p
        if card.value in ("skip", "reverse"):               # two players: reverse = skip
            return p
        if card.value == "draw2":
            self.draw(other, 2)
            return p
        if card.value == "wild4":
            self.draw(other, 4)
            return p
        return other

    def winner(self):
        for p in (0, 1):
            if not self.hands[p]:
                return p
        return None

    # ------------------------------------------------------------------------------------- a game loop
    def play(self, a, b, max_turns=500, on_turn=None):
        """a, b: players (choose(game, p) -> (card or None, colour)). on_turn(game, p, action) for the robot body."""
        players = [a, b]
        first = self.discard[-1]                             # the first card's effect hits the first player
        if first.value in ("skip", "reverse"):
            self.turn = 1
        elif first.value == "draw2":
            self.draw(0, 2)
            self.turn = 1
        elif first.value == "wild":
            self.colour = players[0].pick_colour(self, 0)
        for _ in range(max_turns):
            p = self.turn
            card, colour = players[p].choose(self, p)
            if card is None:
                got = self.draw(p, 1)
                action = ("draw", got[0] if got else None)
                if got and self.legal(got[0], self.hands[p]) and players[p].play_drawn(self, p, got[0]):
                    colour = players[p].pick_colour(self, p) if got[0].colour is None else None
                    if on_turn:
                        on_turn(self, p, action)
                    action = ("play", got[0], colour)
                    self.turn = self.apply(p, got[0], colour)
                else:
                    self.turn = 1 - p
            else:
                action = ("play", card, colour)
                self.turn = self.apply(p, card, colour)
            if len(self.hands[p]) == 1:                      # one card left: say Uno (or be caught)
                self.said_uno[p] = players[p].says_uno(self, p)
                if not self.said_uno[p] and players[1 - p].catches(self, 1 - p):
                    self.draw(p, 2)
                    action = action + ("caught",)
            if on_turn:
                on_turn(self, p, action)
            w = self.winner()
            if w is not None:
                return w
        return None


class RandomPlayer:
    """The simulated other player: plays a random legal card (wilds last), forgets to say Uno now and then."""

    def __init__(self, seed=0, forget=0.3):
        self.rng = random.Random(seed)
        self.forget = forget

    def choose(self, g, p):
        opts = g.playable(p)
        if not opts:
            return None, None
        plain = [c for c in opts if c.colour is not None]
        c = self.rng.choice(plain or opts)
        return c, (self.pick_colour(g, p) if c.colour is None else None)

    def pick_colour(self, g, p):
        cs = [c.colour for c in g.hands[p] if c.colour]
        return max(set(cs), key=cs.count) if cs else self.rng.choice(COLOURS)

    def play_drawn(self, g, p, card):
        return True

    def says_uno(self, g, p):
        return self.rng.random() > self.forget

    def catches(self, g, p):
        return self.rng.random() < 0.5


class RobotPlayer:
    """The robot's strategy: keep the colour it holds most of; save wilds for when nothing else goes; hit back with
    skips and draw-twos when the other player is close to winning; always says Uno; always catches a missed Uno."""

    def choose(self, g, p):
        opts = g.playable(p)
        if not opts:
            return None, None
        hand = g.hands[p]
        theirs = len(g.hands[1 - p])
        count = {c: sum(1 for h in hand if h.colour == c) for c in COLOURS}

        def score(c):
            s = 0.0
            if c.colour is None:
                s -= 10 if theirs > 2 else -2                # wilds: keep them, unless they are nearly out
                if c.value == "wild4":
                    s += 3 if theirs <= 2 else -2
            else:
                s += count[c.colour] * 1.5                    # stay in the colour we hold most of
                if c.value in ("skip", "reverse", "draw2"):
                    s += 4 if theirs <= 2 else 0.5
                    s += 1 if c.value == "draw2" else 0
                elif c.value.isdigit():
                    s += int(c.value) * 0.1                   # shed high numbers first
                if any(h.value == c.value and h.colour != c.colour for h in hand):
                    s += 0.5                                  # keeps a colour-switch option
            return s
        c = max(opts, key=score)
        return c, (self.pick_colour(g, p) if c.colour is None else None)

    def pick_colour(self, g, p):
        cs = [c.colour for c in g.hands[p] if c.colour]
        return max(set(cs), key=cs.count) if cs else "red"

    def play_drawn(self, g, p, card):
        return card.colour is not None or len(g.hands[1 - p]) <= 2

    def says_uno(self, g, p):
        return True

    def catches(self, g, p):
        return True


def say_play(card, colour):
    if card.value == "wild":
        return f"Wild. {colour.capitalize()}."
    if card.value == "wild4":
        return f"Wild draw four. Draw four, and it's {colour}."
    if card.value == "draw2":
        return f"{card.colour.capitalize()} draw two. Two for you."
    if card.value in ("skip", "reverse"):
        return f"{card.colour.capitalize()} {card.value}. My turn again."
    return f"{card.colour.capitalize()} {card.value}."


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--games", type=int, default=1000)
    a = ap.parse_args()
    wins = illegal = turns = 0
    for k in range(a.games):
        g = Uno(seed=k)
        robot_first = k % 2 == 0
        pl = [RobotPlayer(), RandomPlayer(seed=k)] if robot_first else [RandomPlayer(seed=k), RobotPlayer()]
        w = g.play(*pl)
        wins += (w == 0) == robot_first if w is not None else 0
        illegal += g.illegal
        turns += len(g.history)
    print(f"{a.games} games: robot won {wins} ({wins / a.games:.0%}) against a random player; "
          f"illegal plays {illegal}; {turns / a.games:.0f} cards played per game")


if __name__ == "__main__":
    main()
