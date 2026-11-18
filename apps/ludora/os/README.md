# Ludora OS (source)

A hardened server appliance for Ludora, built on Rocky Linux 10.3. The guide for people who run one is
[`../docs/LUDORA-OS.md`](../docs/LUDORA-OS.md): what it does, how to install it, what was tested and what it does
not protect against. This file is for people changing it.

## Layout

| Path | What it is |
|---|---|
| `rootfs/` | Files copied onto the server as they are: `usr/lib/ludora-os/python/ludora_os/` (the logic), `etc/` (kernel, audit, sign-in, systemd settings), the `ludoractl` and `ludora` commands. |
| `install.sh` | Turns a Rocky Linux 10 system into Ludora OS. The install image runs it; it also runs by hand on an existing server. |
| `kickstart/ludora-os.ks.in` | The unattended install. Asks which disk to erase and the disk passphrase, nothing else. |
| `build-iso.sh` | Builds the install image from an official Rocky ISO, after checking the ISO against Rocky's signed checksum. |
| `tests/` | Unit tests, the network attack simulation, and the console screen tests. |

## How it fits together

One settings file (`/etc/ludora-os/ludora-os.conf`) is the only input. `config.py` validates every value against a
strict pattern, and `render.py` turns the settings into the firewall, the SSH configuration, the proxy configuration
and the container units. Nothing else writes those files, so `ludoractl doctor` can tell when one was changed by
hand. No value reaches a shell: every command is an argument list (`system.run`).

`sentinel.py` is split in two. `Brain` is pure logic: it is handed events (a decoy-port connection, an SSH log line,
a proxy log line, the neighbour table) and returns actions (ban, shield, event). `Daemon` does the I/O around it, as
an unprivileged user that holds only the right to edit the firewall's ban sets. Rules it must never break: a ban
needs evidence that cannot be forged from another address; staff addresses, the gateway, name servers and the
server's own addresses are never banned.

## Alerts and the analyst

`alerts.py` composes and delivers alerts (mail over TLS, ntfy, Telegram) for three audiences; `Outbox` is the
batching policy and is pure. The sentinel sends security and fair-play alerts off its main loop; commands send
upkeep alerts directly. `analyst.py` is the optional AI second opinion: a client for Colibri's
`POST /v1/systemone` on loopback, the three fixed questions, strict validation of the reply, the quiz used by
`ludoractl ai bench`, and the pinned install. Only the model's probabilities are ever used; no string from its
reply is shown to anyone. The real engine and model have not been run against this code yet.

## Tests

```bash
python3 -m unittest discover -s tests            # no root, no network
sudo python3 tests/attack_sim.py                 # needs root: builds network namespaces and loads the real firewall
pip install pyte && python3 tests/console_harness.py firstboot   # and: dashboard
```

`attack_sim.py` never touches the machine's own firewall: everything it loads goes into a network namespace it
creates and removes.

## How far the install image was taken

`build-iso.sh` was run against the official `Rocky-10.3-x86_64-boot.iso`: the ISO matched Rocky's checksum, the
checksum's signature verified against the Rocky Linux 10 release key, the kickstart passed `ksvalidator -v RHEL10`
(also with the disk layout the installer writes), and `mkksiso` produced a 980 MB image. The image was opened and
checked: volume label, the boot menu on the BIOS path and in the EFI boot partition (both start the installer with
the kickstart), the kickstart with its package sources filled in, and the Ludora OS payload with Ludora's source.
The installer's disk and passphrase questions were run with pretend disks: it skips removable disks, refuses a disk
under 40 GB, and stops unless `ERASE` is typed.

GitHub now builds the image on every change (`.github/workflows/ludora-os.yml`, on a normal kernel, with
`mkksiso` doing the EFI partition itself) and keeps it as the run's `LudoraOS-iso` artifact.

That GitHub-built image was started in QEMU without hardware acceleration: the boot menu appears on SeaBIOS and on
OVMF (UEFI), the installer loads, the kickstart's `%pre` runs, lists only the fixed disk, takes `ERASE` and the
passphrase, and Anaconda accepts the generated LUKS and LVM layout. Two faults showed up this way and are fixed: a
memory swap device was offered as a disk, and the installer has no `clear` command.

A **complete install has still not been run**: the emulator here had no network, so it stops where Anaconda
fetches packages, and everything after that (the `%post` step that runs `install.sh`, the first start, the
first-boot setup on a really installed system) is unproven. Install it in a virtual machine before putting it on
real hardware, and run `ludoractl doctor` on the result.
