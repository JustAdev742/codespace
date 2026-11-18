#!/usr/bin/env bash
# Builds the Ludora OS install ISO from an official Rocky Linux 10 ISO.
#
#   bash build-iso.sh --iso Rocky-10.3-x86_64-boot.iso [options]
#
#   --iso FILE          the official Rocky Linux 10 ISO: boot (installs over the network) or dvd (installs offline)
#   --checksum FILE     Rocky's CHECKSUM file for that ISO; the build stops if the ISO does not match it
#   --out FILE          where to write the result (default: LudoraOS-<version>-x86_64.iso)
#   --source network|dvd  where the installer gets its packages (default: network for a boot ISO, dvd for a dvd ISO)
#   --timezone ZONE     default Australia/Sydney
#   --keyboard MAP      default us
#   --lang LOCALE       default en_AU.UTF-8
#   --no-encrypt        do not encrypt the disk (for a test machine; a stolen disk can then be read)
#   --images DIR        container image archives (*.tar) to carry on the ISO, for a server with no internet
#
# Needs: lorax (for mkksiso) and xorriso; pykickstart to check the kickstart. On Rocky/Fedora:
#   sudo dnf install lorax pykickstart
# Run it from a clone of the repository: it carries Ludora's source at the current commit.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
APP=$(cd "$HERE/.." && pwd)
VERSION=$(sed -n 's/^VERSION = "\(.*\)"/\1/p' "$HERE/rootfs/usr/lib/ludora-os/python/ludora_os/system.py")
ISO="" CHECKSUM="" OUT="" SOURCE="" TZ_NAME="Australia/Sydney" KEYBOARD="us" LANG_NAME="en_AU.UTF-8" ENCRYPT="yes" IMAGES=""
while [ $# -gt 0 ]; do
  case "$1" in
    --iso) ISO=${2:?}; shift 2 ;;
    --checksum) CHECKSUM=${2:?}; shift 2 ;;
    --out) OUT=${2:?}; shift 2 ;;
    --source) SOURCE=${2:?}; shift 2 ;;
    --timezone) TZ_NAME=${2:?}; shift 2 ;;
    --keyboard) KEYBOARD=${2:?}; shift 2 ;;
    --lang) LANG_NAME=${2:?}; shift 2 ;;
    --no-encrypt) ENCRYPT="no"; shift ;;
    --images) IMAGES=${2:?}; shift 2 ;;
    -h | --help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "build-iso.sh: unknown option $1" >&2; exit 2 ;;
  esac
done
die() { echo "build-iso.sh: $*" >&2; exit 1; }
[ -n "$ISO" ] && [ -f "$ISO" ] || die "give the Rocky Linux ISO with --iso FILE"
command -v mkksiso >/dev/null || die "mkksiso is missing (install lorax)"
case "$TZ_NAME" in *[!A-Za-z0-9_/+-]*) die "that time zone has characters a time zone never has" ;; esac
case "$KEYBOARD" in *[!A-Za-z0-9_-]*) die "that keyboard map has unexpected characters" ;; esac
case "$LANG_NAME" in *[!A-Za-z0-9_.@-]*) die "that locale has unexpected characters" ;; esac
OUT=${OUT:-LudoraOS-$VERSION-x86_64.iso}
if [ -z "$SOURCE" ]; then
  case "$(basename "$ISO")" in *dvd*) SOURCE=dvd ;; *) SOURCE=network ;; esac
fi

echo "== Checking the Rocky Linux ISO"
actual=$(sha256sum "$ISO" | cut -d' ' -f1)
if [ -n "$CHECKSUM" ]; then
  name=$(basename "$ISO")
  expected=$(sed -n "s/^SHA256 ($name) = \([0-9a-f]\{64\}\)$/\1/p" "$CHECKSUM" | head -1)
  [ -n "$expected" ] || die "$CHECKSUM has no SHA256 line for $name"
  [ "$expected" = "$actual" ] || die "the ISO does not match its checksum: expected $expected, got $actual. Do not use it."
  echo "   matches $CHECKSUM"
  sig=""
  for candidate in "$CHECKSUM.asc" "$CHECKSUM.sig"; do [ -f "$candidate" ] && sig=$candidate && break; done
  if [ -n "$sig" ] && command -v gpg >/dev/null && [ -f /etc/pki/rpm-gpg/RPM-GPG-KEY-Rocky-10 ]; then
    ring=$(mktemp -d)
    # The key file holds more than one key, and gpg stops at a kind it does not know. Import them one at a time.
    awk -v dir="$ring" '/BEGIN PGP PUBLIC KEY BLOCK/ { n++ } n { print > (dir "/key" n ".asc") }' /etc/pki/rpm-gpg/RPM-GPG-KEY-Rocky-10
    for key in "$ring"/key*.asc; do gpg --homedir "$ring" --quiet --import "$key" 2>/dev/null || true; done
    gpg --homedir "$ring" --quiet --verify "$sig" "$CHECKSUM" 2>/dev/null || die "the signature in $sig is not the Rocky Linux 10 release key's signature of $CHECKSUM. Do not use this ISO."
    rm -rf "$ring"
    echo "   and the checksum file is signed by the Rocky Linux 10 release key"
  else
    echo "   (signature not checked: needs $CHECKSUM.asc, gpg and the Rocky 10 release key on this machine)"
  fi
else
  echo "   SHA256 $actual"
  echo "   NOT VERIFIED. Compare it with the CHECKSUM file next to the ISO on rockylinux.org, or pass --checksum."
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
PAYLOAD="$WORK/ludora-os"
mkdir -p "$PAYLOAD/src"

echo "== Gathering Ludora OS $VERSION"
cp -r "$HERE/rootfs" "$HERE/install.sh" "$PAYLOAD/"
find "$PAYLOAD" -name '__pycache__' -type d -prune -exec rm -rf {} +
[ -f "$APP/docs/LUDORA-OS.md" ] && cp "$APP/docs/LUDORA-OS.md" "$PAYLOAD/LUDORA-OS.md"
# Ludora's source, exactly as committed: only what the container build reads.
if git -C "$APP" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git -C "$APP" archive HEAD Dockerfile .dockerignore package.json package-lock.json tsconfig.base.json packages server web | tar -x -C "$PAYLOAD/src"
  git -C "$APP" rev-parse HEAD > "$PAYLOAD/src/COMMIT"
  echo "   Ludora at commit $(cut -c1-12 "$PAYLOAD/src/COMMIT")"
else
  die "run this from a git clone, so the ISO carries a known commit of Ludora"
fi
if [ -n "$IMAGES" ]; then
  mkdir -p "$PAYLOAD/images"
  cp "$IMAGES"/*.tar "$PAYLOAD/images/"
  echo "   with $(find "$PAYLOAD/images" -name '*.tar' | wc -l) image archive(s) for offline setup"
fi

echo "== Writing the kickstart (packages from: $SOURCE; disk encryption: $ENCRYPT)"
VOLID="LudoraOS-${VERSION//./-}"
if [ "$SOURCE" = "dvd" ]; then
  source_lines="cdrom"
else
  source_lines='url --mirrorlist="https://mirrors.rockylinux.org/mirrorlist?arch=x86_64&repo=BaseOS-10"
repo --name=AppStream --mirrorlist="https://mirrors.rockylinux.org/mirrorlist?arch=x86_64&repo=AppStream-10"'
fi
KS="$WORK/ludora-os.ks"
# Plain text replacement: awk's own gsub would treat the "&" in the addresses as "the text that matched".
KS_SOURCE=$source_lines KS_TIMEZONE=$TZ_NAME KS_KEYBOARD=$KEYBOARD KS_LANG=$LANG_NAME KS_ENCRYPT=$ENCRYPT KS_VOLID=$VOLID awk '
  function put(line, mark, value,   at, out) {
    out = ""
    while ((at = index(line, mark)) > 0) { out = out substr(line, 1, at - 1) value; line = substr(line, at + length(mark)) }
    return out line
  }
  {
    $0 = put($0, "@@SOURCE@@", ENVIRON["KS_SOURCE"]); $0 = put($0, "@@TIMEZONE@@", ENVIRON["KS_TIMEZONE"])
    $0 = put($0, "@@KEYBOARD@@", ENVIRON["KS_KEYBOARD"]); $0 = put($0, "@@LANG@@", ENVIRON["KS_LANG"])
    $0 = put($0, "@@ENCRYPT@@", ENVIRON["KS_ENCRYPT"]); $0 = put($0, "@@VOLID@@", ENVIRON["KS_VOLID"])
    print
  }
' "$HERE/kickstart/ludora-os.ks.in" > "$KS"
if grep -v '^#' "$KS" | grep -q '@@'; then die "the kickstart still has an unfilled @@ mark: $(grep -v '^#' "$KS" | grep -n '@@' | head -1)"; fi
if command -v ksvalidator >/dev/null; then
  # The disk layout is written during the install, so give the checker a stand-in for it.
  check="$WORK/check.ks"
  sed 's#^%include /tmp/ludora-disk.ks#autopart#' "$KS" > "$check"
  ksvalidator -v RHEL10 "$check" || die "the kickstart did not pass ksvalidator"
  echo "   passes ksvalidator (RHEL10)"
else
  echo "   (ksvalidator not installed: the kickstart was not checked)"
fi

echo "== Building $OUT"
rm -f "$OUT"
mkksiso --ks "$KS" -a "$PAYLOAD" -V "$VOLID" -c "inst.text" -R "Install Rocky Linux" "Install Ludora OS (erases a disk) on Rocky Linux" "$ISO" "$OUT"
echo
echo "Built $OUT"
echo "SHA256 $(sha256sum "$OUT" | cut -d' ' -f1)"
echo "Write it to a USB stick (or attach it to a virtual machine) and start the computer from it."
