#!/usr/bin/env bash
# Renders the whole film and joins it to its music.
#   tools/film/build.sh [workers]     (default 3 browsers side by side)
# Needs the film's preview server running (npx vite --config tools/film/comp/vite.config.ts)
# and the footage already shot (tools/film/capture).
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="${FILM_OUT:-/tmp/claude-0/-home-user/97a5c84e-6d10-5253-ab94-c316a24e49f4/scratchpad/film}"
N="${1:-3}"
TOTAL="${FILM_FRAMES:-2040}"
NAME="${FILM_NAME:-ludora-trailer}"
mkdir -p "$OUT/frames" "$OUT/logs" "$OUT/out" "$OUT/audio"
rm -f "$OUT"/frames/*.jpg
pids=()
for i in $(seq 0 $((N - 1))); do
  from=$((TOTAL * i / N)); to=$((TOTAL * (i + 1) / N))
  node tools/film/render.mjs --from "$from" --to "$to" --out "$OUT/frames" > "$OUT/logs/render-$i.log" 2>&1 &
  pids+=($!)
done
fail=0
for p in "${pids[@]}"; do wait "$p" || fail=1; done
[ "$fail" = 0 ] || { echo "a render worker failed: see $OUT/logs/render-*.log"; exit 1; }
have=$(ls "$OUT/frames" | wc -l)
[ "$have" = "$TOTAL" ] || { echo "expected $TOTAL frames, have $have"; exit 1; }
python3 tools/film/score/score.py "$OUT/audio/score.wav"
ffmpeg -y -loglevel error -framerate 30 -start_number 0 -i "$OUT/frames/%05d.jpg" -i "$OUT/audio/score.wav" \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high -level 4.1 -movflags +faststart \
  -c:a aac -b:a 256k -shortest "$OUT/out/$NAME.mp4"
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,width,height,r_frame_rate -of compact "$OUT/out/$NAME.mp4"
echo "wrote $OUT/out/$NAME.mp4"
