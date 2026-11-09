"""List normalizer shared by the K1 handbook (make_handbook.py) and the S1 guide (simple/tutorial/make_pdf.py)."""

import re

_MARK = re.compile(r"^( *)([*+-]|\d+[.)])( +)(.*)$")


def normalize_lists(md):
    """Re-indent nested lists to 4 spaces per level (what Python-Markdown needs), whatever the source used
    (2- or 3-space CommonMark style). Tracks each open item's content column, so bullets, steps, tables and
    fenced code inside list items keep their nesting."""
    out, stack, fence, prev_blank, prev_cont = [], [], False, True, False
    for line in md.splitlines():
        if not line.strip():
            out.append(line)
            prev_blank, prev_cont = True, False
            continue
        n = len(line) - len(line.lstrip(" "))
        body = line[n:]
        if fence:
            if body.startswith("```"):
                fence = False
                if stack:                           # fenced code inside a list became an indented block
                    out.append("")
                    prev_blank = True
                    continue
            if stack:
                out.append(" " * (4 * len(stack) + 4 + max(0, n - stack[-1][1])) + body)
            else:
                out.append(line)
            prev_blank = False
            continue
        m = None if body.startswith("```") else _MARK.match(line)
        if m:
            while stack and n < stack[-1][1]:       # not inside the top item's content -> close it
                stack.pop()
            depth = len(stack)
            content_col = n + len(m.group(2)) + len(m.group(3))
            if prev_cont:                           # after an indented paragraph Python-Markdown would read the
                out.append("")                      # marker as a lazy continuation: separate it
            elif not stack and not prev_blank and out and not out[-1].lstrip().startswith(("|", "#")):
                out.append("")                      # a list straight after a paragraph (CommonMark allows it)
            stack.append((n, content_col))
            out.append(" " * (4 * depth) + body)
            prev_blank, prev_cont = False, False
            continue
        else:
            if stack and n == 0 and prev_blank:     # unindented paragraph after a blank line: lists end
                stack = []
            elif stack and n == 0:                  # lazy continuation of the item's paragraph
                pass
            else:
                while stack and n < stack[-1][1] and n > 0:
                    stack.pop()
            if body.startswith("```"):
                fence = True
                if stack:                           # Python-Markdown cannot fence inside a list: indent instead
                    if out and out[-1].strip():
                        out.append("")
                    prev_blank = True
                    continue
            if stack and n > 0:
                out.append(" " * (4 * len(stack) + max(0, n - stack[-1][1])) + body)
                prev_cont = prev_blank or prev_cont   # a paragraph that started after a blank line inside an item
            else:
                out.append(line)
                prev_cont = False
        prev_blank = False
    return "\n".join(out) + "\n"
