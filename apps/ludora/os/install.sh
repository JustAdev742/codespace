#!/usr/bin/env bash
# Turns a freshly installed Rocky Linux 10 server into Ludora OS.
#
#   sudo bash install.sh [--src DIR] [--images DIR] [--kickstart] [--container-test] [--force]
#
#   --src DIR         Ludora's source (apps/ludora) to ship with the OS, so the first build needs no git
#   --images DIR      container image archives (*.tar) to load at first boot, for a server with no internet
#   --kickstart       setting up a freshly installed system from its installer (not the running system):
#                     write everything, start nothing
#   --container-test  running inside a test container: skip what needs a real kernel, bootloader or init
#   --force           run on a distribution other than Rocky / Alma / RHEL 10
#
# The kickstart runs this at the end of an install from the Ludora OS ISO. It can be run again:
# every step checks before it changes. It leaves the server SEALED (nothing may connect) until
# the first-boot setup on the server's own screen has made the administrator's password.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SRC="" IMAGES="" TEST=0 FORCE=0 RUNNING=1
while [ $# -gt 0 ]; do
  case "$1" in
    --src) SRC=${2:?--src needs a directory}; shift 2 ;;
    --images) IMAGES=${2:?--images needs a directory}; shift 2 ;;
    --container-test) TEST=1; RUNNING=0; shift ;;
    --kickstart) RUNNING=0; shift ;;
    --force) FORCE=1; shift ;;
    -h | --help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "install.sh: unknown option $1" >&2; exit 2 ;;
  esac
done

die() { echo "install.sh: $*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || die "run as root"
[ -d "$HERE/rootfs" ] || die "rootfs/ is missing next to this script"

# shellcheck disable=SC1091
. /etc/os-release
case "$ID:${VERSION_ID%%.*}" in
  rocky:10 | almalinux:10 | rhel:10) ;;
  *) [ "$FORCE" -eq 1 ] || die "this is $PRETTY_NAME; Ludora OS is built on Rocky Linux 10 (use --force to try anyway)" ;;
esac

step "Packages"
PACKAGES=(
  podman nftables audit aide usbguard openscap-scanner scap-security-guide dnf-automatic chrony
  policycoreutils policycoreutils-python-utils openssh-server openssh-clients gnupg2 sudo git-core tar
  libpwquality authselect iproute procps-ng NetworkManager-tui python3 openssl util-linux findutils less
)
# The install image has already put these on (its kickstart lists them), and inside the installer there may be no
# way to reach a package mirror: only ask for what is missing.
if ! rpm -q "${PACKAGES[@]}" >/dev/null 2>&1; then
  dnf -y install --setopt=install_weak_deps=False "${PACKAGES[@]}"
fi

step "Files"
# Copied without owners or modes from the source tree; both are set explicitly below.
cp -r --no-preserve=mode,ownership "$HERE/rootfs/." /
chown -R root:root /usr/lib/ludora-os /usr/libexec/ludora-os /etc/ludora-os
find /usr/lib/ludora-os -type d -exec chmod 755 {} +
find /usr/lib/ludora-os -type f -exec chmod 644 {} +
# The dashboard's pages (and the other shared files) are read by an unprivileged service: readable whatever the umask was.
find /usr/share/ludora-os -type d -exec chmod 755 {} +
find /usr/share/ludora-os -type f -exec chmod 644 {} +
chmod 755 /usr/libexec/ludora-os /usr/libexec/ludora-os/* /usr/local/sbin/ludoractl /usr/local/bin/ludora
chmod 755 /etc/ludora-os   # the folder is open; each file inside is locked down on its own (secrets 0600, settings 0640)
chmod 440 /etc/sudoers.d/50-ludora-os
chmod 600 /etc/audit/rules.d/50-ludora-os.rules /etc/audit/rules.d/99-ludora-os-lock.rules
chmod 644 /etc/sysctl.d/90-ludora-os.conf /etc/modprobe.d/ludora-os.conf /etc/modules-load.d/ludora-os.conf \
  /etc/security/faillock.conf /etc/security/pwquality.conf.d/50-ludora-os.conf /etc/security/limits.d/50-ludora-os.conf \
  /etc/profile.d/ludora-os.sh /etc/issue.net /etc/sysconfig/nftables.conf /etc/aide.d/ludora-os.conf
find /etc/systemd/system -maxdepth 2 \( -name 'ludora-*' -o -path '*ludora-os.conf' \) -type f -exec chmod 644 {} +
find /usr/lib/ludora-os -name '__pycache__' -type d -prune -exec rm -rf {} +
visudo -cf /etc/sudoers.d/50-ludora-os >/dev/null || die "the sudo rules did not pass visudo"
mkdir -p /var/lib/ludora-os /var/backups/ludora /etc/ssh/authorized_keys.d /etc/nftables /etc/containers/systemd /usr/share/doc/ludora-os
chmod 755 /var/lib/ludora-os /etc/ssh/authorized_keys.d
chmod 700 /var/backups/ludora
[ -f "$HERE/LUDORA-OS.md" ] && install -m 644 "$HERE/LUDORA-OS.md" /usr/share/doc/ludora-os/LUDORA-OS.md
if [ -n "$SRC" ]; then
  [ -f "$SRC/Dockerfile" ] || die "--src $SRC has no Dockerfile"
  rm -rf /usr/share/ludora-os/src
  mkdir -p /usr/share/ludora-os/src
  cp -r --no-preserve=mode,ownership "$SRC/." /usr/share/ludora-os/src/
fi
if [ -n "$IMAGES" ]; then
  mkdir -p /usr/share/ludora-os/images
  cp --no-preserve=mode,ownership "$IMAGES"/*.tar /usr/share/ludora-os/images/
fi

step "Accounts"
groupadd -f ludora-admins
groupadd -f ludora-support
if ! id ludora-admin >/dev/null 2>&1; then
  useradd --create-home --groups wheel,ludora-admins --comment "Ludora OS administrator" ludora-admin
  passwd -l ludora-admin >/dev/null   # no password until the first-boot setup makes one
else
  usermod --append --groups wheel,ludora-admins ludora-admin
fi
if ! id ludora-support >/dev/null 2>&1; then
  useradd --create-home --gid ludora-support --shell /bin/sh --comment "Ludora OS support access" ludora-support
fi
usermod --password '*' ludora-support   # never a password: only a short-lived key, when support access is open
if ! id ludora-sentinel >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --comment "Ludora OS sentinel" ludora-sentinel
fi
usermod --append --groups systemd-journal ludora-sentinel
if ! id ludora-dash >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --comment "Ludora OS staff dashboard" ludora-dash
fi
passwd -l root >/dev/null
chmod 750 /home/ludora-admin /home/ludora-support

step "Sign-in rules"
authselect select local with-faillock with-pwhistory without-nullok --force >/dev/null
# Only administrators may use su.
if ! grep -Eq '^auth\s+required\s+pam_wheel\.so' /etc/pam.d/su; then
  sed -i 's/^#\s*\(auth\s\+required\s\+pam_wheel\.so use_uid\)/\1/' /etc/pam.d/su
fi

step "SELinux"
if [ -f /etc/selinux/config ]; then
  sed -i 's/^SELINUX=.*/SELINUX=enforcing/' /etc/selinux/config
fi
if command -v restorecon >/dev/null 2>&1 && [ "$TEST" -eq 0 ]; then
  restorecon -RF /usr/lib/ludora-os /usr/libexec/ludora-os /usr/local/sbin/ludoractl /usr/local/bin/ludora /etc/ludora-os \
    /etc/ssh/authorized_keys.d /etc/sudoers.d /etc/systemd/system /etc/nftables /var/lib/ludora-os /var/backups/ludora || true
fi

step "Kernel and boot"
if [ "$TEST" -eq 0 ]; then
  [ "$RUNNING" -eq 1 ] && { sysctl -q --system || true; }
  if command -v grubby >/dev/null 2>&1; then
    grubby --update-kernel=ALL --args="init_on_alloc=1 init_on_free=1 slab_nomerge page_alloc.shuffle=1 randomize_kstack_offset=on vsyscall=none pti=on audit=1 audit_backlog_limit=8192 lockdown=integrity"
  fi
  if ! grep -Eq '^\S+\s+/dev/shm\s' /etc/fstab; then
    echo 'tmpfs /dev/shm tmpfs defaults,nodev,nosuid,noexec 0 0' >> /etc/fstab
  fi
else
  echo "(container test: kernel settings, boot arguments and mounts are skipped)"
fi

step "Services"
SYSTEMCTL=(systemctl)
[ "$RUNNING" -eq 0 ] && SYSTEMCTL=(systemctl --root=/)   # no init to talk to: change the links only
"${SYSTEMCTL[@]}" disable firewalld.service 2>/dev/null || true
# Masked by hand: `systemctl mask` refuses when a link is already there, as it is for ctrl-alt-del.target.
for unit in firewalld.service ctrl-alt-del.target debug-shell.service kdump.service; do
  ln -sfn /dev/null "/etc/systemd/system/$unit"
done
"${SYSTEMCTL[@]}" disable sshd.service aide-check.timer >/dev/null 2>&1 || true   # SSH stays off until an administrator switches it on
"${SYSTEMCTL[@]}" enable nftables.service auditd.service chronyd.service dnf-automatic.timer tmp.mount \
  ludora-sentinel.service ludora-firstboot.service ludora-housekeeping.timer ludora-doctor.timer ludora-backup.timer ludora-aide.timer >/dev/null
"${SYSTEMCTL[@]}" set-default multi-user.target >/dev/null

step "Settings and the sealed firewall"
if [ "$TEST" -eq 1 ]; then
  echo "(container test: run \`ludoractl apply --no-restart\` in a container that may use the kernel firewall)"
else
  if ! /usr/local/sbin/ludoractl apply --no-restart; then
    # Inside the installer the kernel firewall may not be usable. The server makes its rules at first start, and
    # loads refuse-everything rules if it cannot (firewall-up), so it is sealed either way.
    [ "$RUNNING" -eq 0 ] || die "the settings could not be applied"
    echo "(the firewall rules will be made when the server first starts)"
  fi
  if [ "$RUNNING" -eq 1 ]; then
    nft -f /etc/nftables/ludora-os.nft
    systemctl daemon-reload
    if [ ! -e /etc/ludora-os/claimed ]; then
      systemctl stop sshd.service 2>/dev/null || true
    fi
    systemctl restart ludora-sentinel.service 2>/dev/null || true
  fi
fi

step "Done"
if [ -e /etc/ludora-os/claimed ]; then
  echo "Ludora OS files are updated. Run: ludoractl apply"
else
  echo "Ludora OS is installed and SEALED: nothing on the network can connect to this server."
  echo "Restart it. The setup appears on the server's own screen (tty1)."
fi
