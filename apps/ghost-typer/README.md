# Ghost Typer

Paste text in, pick a speed, hit start, then click wherever you want the text
to appear. After the countdown it types it for you, like a person would.

Single file: `ghost_typer.py`. Run it directly with Python, or build a
double-clickable app:

```bash
pip install --user pynput pywebview
python ghost_typer.py                 # run
python ghost_typer.py --selftest      # check the engine, no window
python build.py                       # dist/Ghost Typer.exe (or .app)
```

Every push that touches this folder builds Windows, macOS and Linux apps in
GitHub Actions (`.github/workflows/build.yml`). Download them from the run's
**Artifacts**; a `v*` tag also attaches them to a Release.
