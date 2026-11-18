# Ludora OS

Ludora OS turns one computer into a locked-down Ludora server. It is Rocky Linux 10.3 with a layer on top that
installs Ludora, closes everything Ludora does not need, watches the network for attacks and answers them by itself,
and gives the person in charge a console they can use without knowing Linux.

It is built for the attack a school server actually gets: one from inside the school. A student laptop on the same
network scanning for open ports, guessing passwords, flooding the site during a game, or pretending to be the
gateway. The code is in `apps/ludora/os/`.

Read "What was tested" and "What it does not protect against" before you rely on it. Both are specific.

## What you get

- **A sealed start.** A fresh install accepts no connections at all. Nothing opens until someone at the server's own
  screen sets the administrator password ("claiming" it).
- **One firewall that refuses by default**, in both directions. In: only HTTPS (and HTTP, which only redirects) from
  the networks you name, and SSH only if you switch it on, only from the addresses you name. Out: only DNS, time, and
  HTTPS. A break-in to the app cannot scan the school or send mail.
- **The sentinel**, a small guard service. It bans addresses that touch decoy ports, guess SSH or Ludora passwords,
  probe for files like `/.env` and `/wp-login.php`, or flood the site. A first ban lasts 15 minutes, a second an hour, and
  later ones four hours. It raises a threat level, and tightens every limit ("shield") when many addresses misbehave at once.
- **Ludora in three containers** (database, app, HTTPS proxy) with no extra privileges, read-only file systems, and
  the database on a network that cannot be reached from outside the server.
- **A console** on the server's screen: status, who is banned and why, lockdown, backups, updates, remote access.
- **Support access**: a way to let someone help you over SSH for a few hours, from one address, with one key, able
  to run a short list of commands and nothing else.
- **Encrypted nightly backups**, automatic security updates at 03:00, and a self-check that tells you when any
  protection has stopped working.

## Install

You need a 64-bit PC or virtual machine (x86-64-v3, so roughly 2013 or newer), 4 GB of memory, 40 GB of disk, and a
wired network connection. Everything on the disk you pick is erased.

### 1. Build the install image

On any Linux machine with `lorax` and `pykickstart` (on Rocky or Fedora: `sudo dnf install lorax pykickstart`):

```bash
# from https://rockylinux.org/download : the boot ISO, CHECKSUM and CHECKSUM.asc for Rocky Linux 10
cd apps/ludora/os
bash build-iso.sh --iso Rocky-10.3-x86_64-boot.iso --checksum CHECKSUM
```

The script refuses an ISO that does not match Rocky's checksum, and checks the checksum file's signature when the
Rocky release key is on the build machine. It writes `LudoraOS-1.0.0-x86_64.iso`, which carries Ludora OS and
Ludora's source at the commit you built from.

Options: `--timezone Australia/Sydney`, `--keyboard us`, `--lang en_AU.UTF-8`, `--images DIR` (carry container
images so setup needs no internet), `--no-encrypt` (test machines only).

A boot ISO downloads Rocky's packages during the install, so the server needs internet for that hour. Give
`build-iso.sh` the DVD ISO instead to install offline.

### 2. Install

Start the computer from the image. It asks two things and then runs by itself:

1. **Which disk to erase.** It lists the disks; you type the name back to confirm.
2. **A passphrase for the disk.** The disk is encrypted, so a stolen server or disk cannot be read. You type this
   passphrase at every start. Write it down and keep it somewhere safe: there is no way round it.

The computer restarts when it is done. Remove the install media.

### 3. Claim the server

The first start shows a setup screen on the server itself. Until it is finished the server answers nothing on the
network. It asks:

| Question | What to answer |
|---|---|
| The address people will type | The server's name or IP address. The default is its own address. |
| Who runs it, and a contact | Shown on Ludora's privacy page. |
| Staff addresses | Machines that are never banned or slowed: the IT office, the teacher's desk. Keep it small. |
| School networks | Who may open Ludora at all. Leave empty to allow anyone who can reach the server. |
| One address for many students? | Say yes if students reach the server through a router that hides their addresses. The sentinel then records but does not ban, because one ban would lock out the whole school. |
| Administrator password | At least 12 characters. This is for the console, not for Ludora. |
| Boot menu password | Recommended. Stops someone at the keyboard editing the boot line. |

Setup then builds Ludora, starts it, and only then opens the firewall. If anything fails, the server stays sealed
and tells you what failed.

Afterwards, create your Ludora account in the browser and make it the first super administrator from the console:
**Ludora → Make an account a super administrator**.

### On an existing Rocky Linux 10 server

```bash
sudo bash apps/ludora/os/install.sh --src apps/ludora
sudo ludora            # the console; it starts with the same setup questions
```

This applies the same hardening, but cannot encrypt a disk that is already in use.

## Day to day

Sign in at the server's screen as `ludora-admin` and type `ludora`. Everything in the console is also a command:

```text
ludoractl status              one picture of the server
ludoractl doctor              check every protection is still in place
ludoractl events              what the sentinel has seen
ludoractl bans                who is banned right now
ludoractl ban 10.20.3.7       refuse an address       (unban to let it back)
ludoractl lockdown on         close Ludora to everyone outside the staff addresses
ludoractl shield on|off|auto  tighten every limit now, or let the sentinel decide
ludoractl backup              back up now             (backups, restore)
ludoractl update app          update Ludora; returns to the old version by itself if the new one is unhealthy
ludoractl update os           install operating system updates now
ludoractl set NAME value      change a setting, then: ludoractl apply
```

Settings live in `/etc/ludora-os/ludora-os.conf`. Every value is checked before it is used; a value that could
smuggle text into the firewall, SSH or proxy configuration is refused. `ludoractl get` lists them with a line of
explanation each.

### The site's certificate

By default the server makes its own certificate (`TLS_MODE=internal`), so browsers warn until they trust it. Either
install the server's root certificate on school devices (`ludoractl tls ca` prints it), or, if the server has a
public name, set `TLS_MODE=public` for a Let's Encrypt certificate, or `custom` to supply your own.

### Remote administration

SSH is off after setup. To switch it on you must first add a key and name the addresses allowed to connect; it is
never open to every address, and passwords are never accepted.

```bash
ludoractl admin add-key --key "ssh-ed25519 AAAA... you@laptop"
ludoractl set ADMIN_NETS 10.20.9.10
ludoractl set SSH_ENABLED yes && ludoractl apply
```

### Support access

When you want someone to help, open a window for them instead of giving them an account:

```bash
ludoractl support open --key "ssh-ed25519 AAAA... helper" --from 203.0.113.7 --hours 2
```

For those two hours, that one key, from that one address, can run: `status`, `doctor`, `events`, `bans`,
`logs app|db|proxy|sentinel`, `restart app`, `backup`, `update app`, `update os`. It gets no shell, no file transfer
and no port forwarding, and cannot change settings, unban anyone, read secrets or open more access. The window closes
by itself; `ludoractl support close` closes it now. The limit is 72 hours and one /24 network.

This is also how an AI assistant can be connected to the server safely: give it a support key. It can see what is
wrong and run the safe fixes, and it cannot do anything else.

### Alerts: who is told, and how

The server tells people when something happens, by ways that cost nothing. There are three lists, so each person
gets only what they need to know:

| List | Setting | What it gets |
|---|---|---|
| Security | `ALERT_SECURITY_TO` | Attacks: bans, floods, password guessing, impersonation, lockdown, support access opened. |
| Upkeep | `ALERT_UPKEEP_TO` | The server needs care: a backup or update failed, a protection stopped passing the self-check. |
| Fair play | `ALERT_CHEAT_TO` | Ludora spotted likely cheating in a game (see below). |

Each entry on a list is one of:

- **An email address.** Free, but the server needs a mail account to send through: the school's own, or a free one
  (for Gmail, make an "app password" for the account).
- **`ntfy:<topic>`: a push to a phone.** Install the free ntfy app, run `ludoractl alerts topic` to make a long random
  topic name, and subscribe to it in the app. No account is needed. Anyone who knows the topic name can read its
  messages, so treat it like a password; a school can also run its own ntfy server (`NTFY_SERVER`).
- **`telegram:<chat number>`: a Telegram message.** Make a bot with Telegram's BotFather, give its token to the
  server (`ludoractl alerts secret telegram-token`), and message the bot once so it may write to you.

A text message to a phone number is not offered. Every way of sending one costs money, and the free
email-to-text gateways that mobile carriers ran are being switched off. A push to the phone does the same job.

```bash
ludoractl set SMTP_HOST smtp.gmail.com          # port 587 with STARTTLS is the default
ludoractl set SMTP_USER alerts@your-school.org
ludoractl set SMTP_FROM alerts@your-school.org
ludoractl alerts secret smtp-password           # asks for it; it is never given on the command line
ludoractl set ALERT_SECURITY_TO it@your-school.org,ntfy:ludora-Zk3v9qPq2xYw
ludoractl set ALERT_UPKEEP_TO it@your-school.org
ludoractl set ALERT_CHEAT_TO deputy@your-school.org
ludoractl apply
ludoractl alerts test                            # one test message to each list
```

The same is in the console under **Security > Alerts**.

An alert says what happened, what the server already did, and what to do, in plain words:

```text
[Ludora OS ludora-hills] Security: 2 addresses banned in the last few minutes

Details:
  - 10:42:07  10.20.3.3 connected to decoy port 3389. Banned for 15 min.
  - 10:42:31  10.20.3.4 probed for other software's weak spots. Banned for 60 min.

Decoy port touched. A device connected to a decoy port: a port with nothing real behind it, which only
something scanning the server finds.
  What to do: Usually nothing: the address is refused for the length of the ban. If it is a school machine
  that should not have been banned, run `ludoractl unban ADDRESS` ...

What the server did: Refused 2 addresses for up to 60 minutes. Staff addresses are never refused.
```

A burst of bans is one message, not fifty: the first goes after a minute, and later ones are saved up for
`ALERT_QUIET_MINUTES` (ten by default). Anything urgent (the server under attack, a failed backup) goes within a
minute. Mail is only ever sent encrypted. Names and addresses an outsider typed are cleaned before they go into a
message, so nobody can add lines to an alert. If a message cannot be delivered, the server carries on and records
why in `ludoractl events`.

**Cheating in a game.** Ludora itself reports play that a person at the ordinary game screen could not produce:
correct answers faster than anyone can read the question, moves the game does not allow, or one device playing
as several players. The fair-play list is told which game and which player names. It is a signal, not proof, and
Ludora never punishes or slows anyone by itself.

### The analyst: an optional AI second opinion

The server can run a small AI model that reads each batch of security events and adds a second opinion to the
alert: what it most likely was, how serious, and whether several devices seem to be working together.

```text
Second opinion, from the small AI model on this server (advice only; it decides nothing):
  - Most likely password guessing (84% sure).
  - Seriousness: needs a person to act now (1.6 on a scale of 0 to 2).
```

It is a **decision model**, not a chat model. It is given the events and three fixed questions and answers each
with a probability for every option, in one pass. It never writes text. That choice is deliberate:

- **Safety.** Attackers choose some of the words in a log (user names, page addresses). A chat model can be
  talked round by them. A decision model has nothing to say: the most a planted word can do is tilt a number. And
  the analyst only advises. The sentinel's rules ban and unban before it is ever asked; it can make an alert more
  urgent, never less; if it is slow or missing, the alert goes out without it.
- **Speed on an old computer.** A chat model good enough to trust writes a few words a second on an old office
  PC. A decision model has nothing to write: it reads several hundred tokens a second on a laptop processor and
  answers a whole alert in about a second there.
- **Privacy.** It runs in its own container with no route to any network and listens only on the server itself.
  Events never leave the building.

The engine is [Colibri](https://github.com/JustVugg/colibri) (Apache-2.0), running
[Laya](https://huggingface.co/convaiinnovations/laya) (Convai Innovations, Apache-2.0; 840 MB), through Colibri's
decision endpoint. Both are fetched at pinned versions; the model's main file is checked against a pinned
checksum, and the engine is built from its pinned source inside a container, so no compiler is left on the server.

```bash
ludoractl ai install     # downloads the model, builds the engine (several minutes; needs the internet once)
ludoractl ai on
ludoractl ai bench       # 14 cases with known answers, three times over: how many it gets right, and how fast
ludoractl ai status
```

It needs about 2 GB of memory while it runs, so use it on a server with 8 GB or more. It is held to a small share
of the processor so it can never slow a game.

**What has and has not been checked.** The server's side is tested against a stand-in for the model: what is
sent, that a reply which is not exactly what was asked for is thrown away, that nothing the model returns except
its numbers can reach a person, that it can raise urgency but never lower it, and that a model file which does not
match its checksum is not installed. **The real model has not been run by the author**: building and running the
engine was not possible in the environment this was written in. So `ludoractl ai install` and the container build
are unproven, and nobody has yet measured how well Laya judges these events. Run `ludoractl ai bench` first: it
answers both questions on your own machine, and if the model does badly on the 14 cases, leave it off.

**How fast, and the graphics card.** Colibri's authors measured this model at about 0.9 seconds for three
questions on a laptop processor (an i7-1355U). An older desktop will be slower, perhaps two to four seconds an
alert; that is an estimate, not a measurement, and alerts are sent a minute apart at the closest, so it is fast
enough either way. "Tokens a second" does not really apply, because nothing is generated. A small, old graphics
card is not used: Colibri can run this model on an NVIDIA card, but the driver for an old card means loading
outside kernel code on a locked-down server, and the processor is already fast enough for the job.

### USB devices

After setup, plug in the keyboard and anything else that belongs, then run `ludoractl usb init`. Devices plugged in
later are refused. USB storage is switched off entirely.

## How it defends against an attack from inside the school

| The attacker does this | What happens |
|---|---|
| Scans the server for open ports | Only 80 and 443 answer. The usual targets (Telnet, file sharing, remote desktop, databases, and SSH while it is off) are decoys: completing a connection to one is a ban. |
| Tries to reach the database or the app directly | Both are on private container networks. The firewall also drops it. |
| Guesses SSH passwords | SSH takes keys only, from named addresses only, six new connections a minute. Five failures in ten minutes is a ban. |
| Guesses Ludora passwords | Ludora has its own limits; on top, the sentinel bans an address after 20 refused sign-ins in five minutes. |
| Probes for `/.env`, `/wp-login.php`, `/.git/config` | Three such requests in five minutes is a ban. Ludora has none of those files. |
| Floods the site during a game | Each address is limited to 40 new connections a second and 200 at once, before the traffic reaches Ludora. More than 600 requests in ten seconds is a ban. Many attackers at once raises the shield, which quarters the limits for everyone outside the staff addresses. |
| Floods it with connection attempts from thousands of made-up addresses | Past 1,000 new attempts a second from everyone together, further attempts are refused before they use any memory. Connections already open, such as a game in progress, carry on. |
| Forges another machine's address to get it banned | A ban needs a completed connection, which a forged packet cannot make. A device that takes over a classmate's address outright is caught differently: an address that moved to a different device in the last ten minutes is not banned, and an alert is raised instead. Staff addresses, the gateway, the name servers and the server itself are never banned whatever the logs say. |
| Shares a link to a page that makes the visitor's own browser attack Ludora (to get the visitor banned, or to act as them) | Browsers mark requests that a page caused. The proxy refuses the ones another site caused, apart from simply following a link, and the sentinel never counts page-caused requests towards a ban for probing. |
| Pretends to be the gateway (ARP spoofing) | The sentinel remembers the gateway's hardware address and raises an alert when it changes. See the limits below: it can warn, not prevent. |
| Sends forged or malformed packets | Dropped before any other rule: packets from impossible addresses, invalid flag combinations, and replies to connections that do not exist. |
| Plugs in a USB stick or a fake keyboard | Refused once `ludoractl usb init` has run. |
| Restarts the server from a USB stick, or edits the boot line | The disk is encrypted, and the boot menu takes a password. Ctrl-Alt-Del does nothing. |
| Gets into the app through a bug in it | The app runs with no privileges and a read-only file system, cannot reach the school network, and cannot read the server's secrets. |

When the sentinel bans the wrong machine, `ludoractl unban ADDRESS` lets it back and `ludoractl events` says why it
was banned. Add the machine to the staff addresses if it should never be banned.

## What was tested

Tested on Rocky Linux 10.3 (kernel 6.12, Podman 6.1, nftables 1.1.5, OpenSSH 9.9) running as a full system with
systemd inside a container, with separate "student" and "staff" machines on the same network.

- **Unit tests** (`python3 -m unittest discover -s tests`): settings validation against hostile values, every
  generated file, the sentinel's decisions, key handling, the support command list.
- **Alerts**: unit tests for the messages, the batching and the mail conversation (against a stand-in mail
  server), and one real alert sent through the public ntfy.sh service and read back. No email has been sent to a
  real mailbox and no Telegram message has been sent: run `ludoractl alerts test` once they are set up.
- **Attack simulation** (`sudo python3 tests/attack_sim.py`, 42 checks): builds a small school network out of
  network namespaces, loads the real firewall and sentinel, and attacks it: port scan, decoy ports, floods,
  connection exhaustion, 12,000 forged connection attempts, framing a classmate with forged packets, reaching the
  database, a compromised container trying to get out, shield, lockdown.
- **A real server, end to end**: install, claim, Ludora answering over HTTPS; app and database ports unreachable; a
  student probing for `/.env` banned through the real proxy log; a decoy-port touch banned; a staff machine doing
  the same spared and logged; unban; encrypted backup and restore; support access over real SSH (allowed commands
  work; a shell, chained commands, settings changes, file transfer, port forwarding and the administrator account
  are all refused; it stops working when closed); restart, after which the firewall, the bans and Ludora came back
  by themselves, and a ban that had been lifted stayed lifted; a failed first start leaves the server sealed; a
  missing firewall file is made again at start, and with broken settings the server refuses every connection
  rather than starting open. A real browser signed up and moved around the site through the proxy with no refused
  request, while a second site's hidden form and hidden pictures aimed at Ludora were refused.
- **An independent security review** of the code, by a reviewer given the code and the threat model but not the
  author's conclusions. It found seven problems and several suspicions; all seven are fixed and have tests (among
  them: a padded request could hide from the sentinel, changing a setting could stop the sentinel, a decoy touch
  could ban a whole school behind one shared address, and a web page could get its visitor banned). The
  hardware-address check against impersonation is covered by unit tests only, not by a live attack.
- **The console**: every setup screen and the main menus, driven in a pretend terminal
  (`python3 tests/console_harness.py firstboot`).
- **The install image**: see `apps/ludora/os/README.md` for exactly how far the image build was taken.

Not tested, because the test machine could not do it: starting a computer from the install image and installing to a
real disk; disk encryption and the boot menu password on real hardware; SELinux in enforcing mode with the containers
running (the test system had SELinux off); USBGuard with real devices; auditing. These are configured the standard
Rocky way, and `ludoractl doctor` reports each of them, so run it after the first real install and read every line.

## What it does not protect against

- **A flood bigger than the server's network connection.** The server drops the traffic, but the link is still full.
  That has to be stopped at the switch or router.
- **Attacks on other machines.** ARP spoofing, rogue DHCP and Wi-Fi tricks work against students' own devices, not
  the server. The server notices when its gateway changes, and HTTPS means an eavesdropper sees nothing useful, but
  preventing these takes switch features (DHCP snooping, dynamic ARP inspection, port isolation). Ask whoever runs
  the school network to turn them on.
- **A patient impersonator.** A student who clones a classmate's hardware address as well as their network
  address, or holds the address for more than ten minutes, can still get that one device banned for a while. Staff
  addresses cannot be banned this way. Switch port security stops it properly.
- **A scanner that pretends to be a browser.** Because page-caused requests never count towards a probing ban, a
  scanning tool can add the same browser mark to dodge that ban. It gains little: what it looks for is not there,
  the firewall's limits and the flood ban do not depend on the mark, and sign-in guessing is still counted.
- **IPv6 bans are per address.** With IPv6 switched on (it is off by default), a device can move to a new address
  inside its own network to shed a ban.
- **A quiet scan.** A scan that never completes a connection is not banned, on purpose: banning on a single
  unanswered packet would let anyone get anyone else banned by forging their address. It finds nothing but ports 80
  and 443.
- **Many students behind one address.** With "one address for many students" on, the sentinel cannot ban without
  locking out the school, so it records and alerts instead. Ludora's own sign-in limits still apply.
- **A stolen teacher password.** That is a Ludora account matter: see `SECURITY.md`.
- **Someone with the disk passphrase and the administrator password**, or hours alone with the opened server.
- **Bugs in Ludora itself.** The containers limit the damage; they do not make the app correct.

The disk passphrase must be typed at every start, so the server will not come back by itself after a power cut.
Binding the disk to the machine's TPM chip removes that (`systemd-cryptenroll --tpm2-device=auto` on the encrypted
partition) at the cost that a thief who takes the whole machine can start it. It is left as your decision.

## Where things are

| Path on the server | What it is |
|---|---|
| `/etc/ludora-os/ludora-os.conf` | The settings. |
| `/etc/ludora-os/secrets.env` | Database password, backup passphrase. Root only. Keep a copy of the backup passphrase off the server: without it the backups cannot be read. |
| `/etc/nftables/ludora-os.nft` | The firewall, generated. Edits are overwritten and reported by `doctor`. |
| `/var/lib/ludora-os/sentinel/` | Bans and the event log. |
| `/var/backups/ludora/` | Encrypted backups, 14 kept. Copy them off the server. |
| `/usr/lib/ludora-os/` | Ludora OS itself. |
