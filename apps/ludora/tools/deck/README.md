# The Ludora presentation

- `content.py`: every slide and the words to say with it. One list, so the slides and the script
  cannot drift apart. Facts come from `docs/features` and `docs/STATUS.md`.
- `build_deck.py`: writes the PowerPoint (`Ludora.pptx`): 24 slides, then every feature listed a
  line each by area (read from `docs/features/*.md`). The script goes in each slide's notes.
- `build_cards.py`: writes the paper cue cards (`Ludora cue cards.pdf`): one card a slide, four to
  an A4 page, plus a "before you start" card and two "if they ask" cards.

Pictures come from the film's capture folder (`tools/film/capture`). A missing picture becomes a
labelled grey box, so the deck still builds and says what to shoot.

```bash
python3 tools/deck/build_deck.py     # needs python-pptx and Pillow
python3 tools/deck/build_cards.py    # needs reportlab
```

Fonts are Arial and Calibri on purpose: they are on every school computer, so the slides look
the same wherever they are opened.

## "What's new"

- `updates_content.py`: the slides and script for everything added between 12 and 19 November 2026.
- `build_updates.py`: writes `Ludora - what is new.pptx` in the look of The Hills Grammar School's
  copy, with the script in each slide's notes. Pictures come from `tools/film/capture/updates.mjs`
  (`FILM_OUT`, stills and two film frames saved as `deck/crowd.jpg` and `deck/uniforms.jpg`).

```bash
FILM_OUT=/path/to/scratch/upd python3 tools/deck/build_updates.py
```
