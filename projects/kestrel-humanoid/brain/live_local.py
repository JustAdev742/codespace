"""A local language model as the robot's conversational brain (python live.py --local qwen3:8b).

The same job as live_claude.py, on your own computer and free: the model holds the conversation in the persona and
turns requests into the robot's actions through the same tools (go_to, fetch, sit, ...). It talks to any server with
an OpenAI-compatible chat API, which both Ollama (http://localhost:11434/v1, the default) and LM Studio
(http://localhost:1234/v1) provide. No extra Python packages: plain HTTP from the standard library.

The tools only queue actions; the skills run them and every walking command still goes through the safety
supervisor, so a model with its refusals stripped out still cannot make the robot strike anyone. A small model
misreads more often than a large one; when it answers with no usable tool call, the plain-command parser gets a try.

Good choices on a 12 GB GPU (pull with `ollama pull <name>`): qwen3:8b (the default suggestion: good at tool calls),
qwen2.5:7b-instruct, llama3.1:8b. Thinking models (qwen3) are told not to think aloud, and any <think> text is dropped.
"""
from __future__ import annotations

import json
import re
import threading
import urllib.error
import urllib.request

from live_claude import MAX_TURNS, system_prompt, to_action, tools

THINK = re.compile(r"<think>.*?</think>", re.S)


def openai_tools(house):
    """live_claude's tool definitions in the OpenAI function format."""
    out = []
    for t in tools(house):
        schema = dict(t["input_schema"])
        out.append({"type": "function", "function": {"name": t["name"], "description": t["description"],
                                                      "parameters": schema}})
    return out


class LocalBrain:
    def __init__(self, live, model="qwen3:8b", url="http://localhost:11434/v1", timeout=120.0):
        self.live, self.model, self.url, self.timeout = live, model, url.rstrip("/"), timeout
        self.messages = []
        self.lock = threading.Lock()
        self._sys = self._tools = None

    def state_line(self):
        from live_claude import ClaudeBrain
        return ClaudeBrain.state_line(self)

    def _post(self, body):
        req = urllib.request.Request(f"{self.url}/chat/completions", data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.loads(r.read().decode())

    def turn(self, text):
        """One conversational turn: returns the actions to queue; speaks the model's reply through the robot."""
        with self.lock:
            if self._sys is None:
                self._sys = system_prompt(self.live.h) + (
                    "\n\nReply briefly. Do not think aloud. When an action is needed, call the tool; never describe "
                    "a tool call in text. /no_think")
                self._tools = openai_tools(self.live.h)
            self.messages.append({"role": "user", "content": f"{self.state_line()}\n{text}"})
            body = {"model": self.model, "messages": [{"role": "system", "content": self._sys}] + self.messages,
                    "tools": self._tools, "tool_choice": "auto", "temperature": 0.3, "stream": False}
            try:
                resp = self._post(body)
            except urllib.error.HTTPError as e:
                self.messages.pop()
                detail = e.read().decode(errors="replace")[:200]
                return self._offline(text, f"My local model returned an error ({e.code}: {detail}). Plain commands.")
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                self.messages.pop()
                return self._offline(text, f"I can't reach my local model at {self.url} ({e}). Is Ollama or LM Studio "
                                           "running? Plain commands for now.")
            try:
                msg = resp["choices"][0]["message"]
            except (KeyError, IndexError, TypeError):
                self.messages.pop()
                return self._offline(text, "My local model sent something I can't read. Plain commands.")
            said = THINK.sub("", msg.get("content") or "").strip()
            calls = msg.get("tool_calls") or []
            acts, bad = [], 0
            for c in calls:
                fn = c.get("function", {})
                try:
                    args = fn.get("arguments") or {}
                    acts.append(to_action(fn.get("name"), args if isinstance(args, dict) else json.loads(args)))
                except (KeyError, ValueError, TypeError):
                    bad += 1
            self.messages.append({"role": "assistant", "content": said, **({"tool_calls": calls} if calls else {})})
            for c in calls:                                     # each tool call answered, as the format requires
                self.messages.append({"role": "tool", "tool_call_id": c.get("id", ""), "content": "queued"})
            if said:
                self.live.bot.say(said)
            if not acts and (bad or not said):                  # nothing usable: let the plain parser try
                return self._offline(text, "(the local model gave no usable action; trying plain commands)")
            if len(self.messages) > 2 * MAX_TURNS:
                self.messages = self.messages[-2 * (MAX_TURNS // 2):]
                while self.messages and self.messages[0]["role"] != "user":
                    self.messages.pop(0)
            return acts

    def _offline(self, text, note):
        from house_lang import parse
        self.live.push("log", note)
        return parse(text, self.live.h, self.live.lex)
