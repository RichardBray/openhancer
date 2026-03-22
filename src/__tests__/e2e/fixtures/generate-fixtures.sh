#!/bin/bash
# Generates tiny test fixtures for e2e tests
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"

# 1-second 64x64 red-to-blue gradient video (tiny, fast to process)
ffmpeg -y -f lavfi -i "color=c=red:s=64x64:d=1,format=yuv420p" \
  -c:v libx264 -preset ultrafast -crf 28 \
  "$DIR/test.mp4"

# 64x64 solid red PNG image
ffmpeg -y -f lavfi -i "color=c=red:s=64x64:d=1,format=rgb24" \
  -frames:v 1 \
  "$DIR/test.png"

# 1-second 64x64 video as .mov
ffmpeg -y -f lavfi -i "color=c=blue:s=64x64:d=1,format=yuv420p" \
  -c:v libx264 -preset ultrafast -crf 28 \
  "$DIR/test.mov"

echo "Fixtures generated."
