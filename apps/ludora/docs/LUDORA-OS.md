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
five right answers each within a quarter of a second of the question appearing, five messages the game's own
screens never send, or three players connected at once from one browser. It never goes by network address, because
a whole class often shares one. The fair-play list is told which game and which player names, and staff also see it
in Ludora's audit log. It is a signal, not proof: Ludora never punishes, slows or tells a player by itself.

### The staff dashboard

A web page for the school's own staff, styled like a terminal: the state of the server at a glance, who is banned
and why, shield and lockdown, the self-check, backups, logs, and a three-step setup for the school's domain, its
email and who gets alerts. It is off until you switch it on at the server:

```bash
ludoractl dash password        # at least 12 characters; separate from the console's password
ludoractl dash code on         # recommended: also ask for a six-digit code from an authenticator app
ludoractl dash on              # then open https://<the server's address>:8443 from a staff machine
```

The same is in the console under **Remote access > Staff dashboard**.

How it is kept safe:

- **Who can reach it.** Only the staff addresses (`TRUSTED_NETS` and `ADMIN_NETS`). The firewall refuses everyone
  else before the page is ever served, and it cannot be switched on while those lists are empty. Someone let in for
  support over SSH is not thereby let in here. The server's own containers are refused too: if the game itself were
  broken into, it could not walk into the dashboard, and the dashboard's sign-in cookie is removed from every
  request before the game sees it.
- **Who can sign in.** A password, and an authenticator code as well if you set one up. Five wrong tries from one
  address pause that address for fifteen minutes and alert the security list; twenty from anywhere pause everyone.
  Tries are counted before they are checked, so forty sent in the same instant are still five tries. The password
  is checked by the root helper: the web service never holds its stored form.
- **What a session is.** A random token in a cookie that scripts cannot read, tied to the address it began at, ended
  after fifteen idle minutes or eight hours. Changing the password signs everyone out. The page refreshes itself
  every few seconds, and the server does not count that as someone using it: a tab left open is signed out all the
  same.
- **What it never does is guess.** If the sentinel is stopped, or has said nothing for two minutes, the page shows
  the threat level as "not known", never as "calm".
- **What a web page elsewhere can do to a signed-in browser.** Nothing: every change must come from the
  dashboard's own page, and the page may load nothing from anywhere else.
- **What the dashboard can do at all.** The web service runs as its own user with no privileges and no route to
  anywhere but the proxy. For every reading and every action it asks one root helper, which will do only what is
  on a fixed list (`dashops.py`): show status, events, the self-check and logs; ban and unban; shield and lockdown;
  back up; restart the app or the proxy; change the site's name, the mail settings and the alert lists. It cannot
  read any secret, touch SSH or administrators' keys, change who is trusted, switch the firewall or the sentinel
  off, or run a command of anyone's choosing. So even someone who broke into the web service would be held to
  that list. Everything done from the dashboard is written to the event log with the address it came from.
- **What a signed-in person cannot quietly do.** Take people off the alert lists without them hearing of it (the
  list as it was is told first); point the mail server somewhere else and collect the mail password (changing
  the mail server forgets the password, and it has to be entered again); read a phone-push topic back (they are
  shown masked); ban the staff's or an administrator's own address; push out the restore points by making backup
  after backup (one every ten minutes at most); or open an outgoing port other than a mail port.

Changing the site's address or certificate restarts the proxy, which cuts the dashboard's own connection. So the
server answers first ("open the new address in about a minute"), then makes the change and checks that the site
answers. If it does not, the old settings are put back without anyone doing anything, and the dashboard says why
the next time someone signs in. An address that is not the server's own, or a name the server cannot find, is
refused before anything is touched.

### Easy setup: your school's domain and email

The dashboard's **Setup** page walks through three steps, each of which can also be done with `ludoractl set`:

1. **Your school's domain.** Choose a name, such as `play.yourschool.nsw.edu.au`. The page shows the exact record
   to ask for (an A record for that name pointing at the server's address) and a **Check** button that looks the
   name up and says in plain words whether it points here yet. The record itself is created by whoever manages the
   school's domain (the IT provider or the Department's DNS), not on this server. Once it points here, choose the
   certificate: a free public one when the name is reachable from the internet, or the server's own for a name
   used only inside the school.
2. **Email.** Pick Google Workspace, Microsoft 365 or another mail server; enter the account, its password and the
   address alerts should come from; send a test. The password can be set but never read back.
3. **Who is told.** Put people on the security, upkeep and fair-play lists by email address, phone push (ntfy) or
   Telegram, and send each list a test.

### What the guard makes of it, and the optional AI model

Every security alert ends with a short reading of the whole batch of events:

```text
What the guard makes of it (worked out by fixed rules from what it recorded):
  - What it was: an attempt to overload the server.
  - How serious: needs a person to act now.
  - 5 devices were at it together.
```

**This reading comes from rules, not from a model.** The sentinel knows exactly what each event is, because a
rule of its own produced it. From the kinds of event, how many devices were banned and the threat level, it says
what happened, how serious it is (needs no action, worth a look today, needs a person now) and whether several
devices were at it together. It is exact, instant and always there, and nothing an attacker writes into a log
line can change it: only the kinds and the counts are read. It can make an alert more urgent, never less.

**The AI model is an optional extra line under that reading**, and it has to earn its place:

```bash
ludoractl ai install     # downloads the model (840 MB), builds the engine (several minutes; needs the internet once)
ludoractl ai on          # starts it, TESTS it on this server, and switches it off again if it fails the test
ludoractl ai bench       # the test on its own: 36 cases the rules know the answer to, and how long each takes
ludoractl ai status
```

It is a decision model, not a chat model: it is shown the event texts and one fixed question with five fixed
answers, and returns a probability for each. It never writes text, runs in its own container with no route to
any network, and its line changes nothing: not what the server does, not an alert's urgency, not whether an alert
is sent. When it disagrees with the rules its line says so, and says that the server acts on the rules.

**What was measured, on the real model.** The engine is [Colibri](https://github.com/JustVugg/colibri)
(Apache-2.0) running [Laya](https://huggingface.co/convaiinnovations/laya) (Convai Innovations, Apache-2.0), a
general decision model, not one trained on security. Built, downloaded through `ludoractl`'s own installer code
(the checksum matched) and run on a 4-core cloud server:

- **How often it is right.** Asked the three questions this guide first shipped with, it got 8 of 14 cases
  right: it took password guessing for an honest mistake, missed impersonation, and was poor at judging
  seriousness (7 to 13 right of 36, depending on wording). With one question, reworded on half of a 72-case set
  and scored on the other half, it names the activity correctly on 31 of 36 held-out cases (26 of 36 on an
  earlier, differently drawn half). The rules are right on all of them. The pass mark is 33 of 36, so on this
  evidence `ludoractl ai on` switches the model off again and says why; `ludoractl ai on --anyway` keeps it,
  with its score printed beside its line on every alert.
- **How fast.** 513 ms for a typical alert, about 230 tokens read a second; it began at 1,620 ms. Three things
  changed: one question instead of three (each question is the whole text read again), shorter wording, and a
  faster engine.
- **The faster engine.** `analyst/patches/` holds changes to Colibri's matrix products, applied on top of the
  pinned commit when the engine is built: the weights are stored once in the layout the kernel reads instead of
  being re-shuffled for every product, the loops are ordered so a block of activations stays in the fast cache,
  and processors with 512-bit instructions get a wider kernel. Every answer is **bit for bit the same** as the
  unmodified engine's, and Colibri's own 26 oracle tests pass. Measured side by side: 1.23 and 1.59 times
  faster on two cloud servers with 512-bit instructions, 1.12 times faster on a build limited to what a
  2013-2017 desktop processor has. It is not more than that because the engine was already close to what the
  hardware can do with exact arithmetic: 85% of its time is matrix products, and the original kernel ran at
  about nine tenths of the old instruction set's ceiling.

**Not measured:** an old EliteDesk itself (the 1.12 figure is the same instructions on newer hardware); a
graphics card (not used: an old card's driver means outside kernel code on a locked-down server); the container
build under `ludoractl ai install` on Rocky Linux (the engine was built and run directly here, not through
Podman). It needs about 2 GB of memory while it runs, so use it on a server with 8 GB or more.

**A security-trained model.** Small models trained on security text exist (RedSage and Foundation-Sec, both 8
billion parameters). They are chat models: on an old office PC they would write a few words a second, and they
can be talked round by text an attacker plants in a log, so they are not used to judge alerts here. One could be
added as an "explain this incident" button for staff; that is not built.

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
- **The staff dashboard**, on the same real system: it refuses to switch on without a password; a staff machine
  signs in over HTTPS and reads the server's state; a ban and an unban made from it take effect on the student
  machine; requests without the dashboard's own origin are refused; the student machine cannot reach its port, and
  nobody can reach its service around the proxy. From inside, as the dashboard's own user: every secret and the
  settings file are unreadable, the root helper refuses anything off its list, no other user can open the helper's
  socket, and five wrong passwords pause that address. Its authenticator code is covered by unit tests against the
  standard's own examples, not yet by a real phone app.
- **The dashboard's pages, in a real browser against the real system** (`tests/` has the pretend server used while
  building them; this run used the real one), at desktop and phone widths: sign in, with a wrong password refused;
  ban the student machine and let it back in; a staff address refused; the self-check; a backup; the logs; the
  name check; saving mail settings. No Content-Security-Policy violation, no request left the dashboard's own
  address, neither password remained anywhere in the page, and the old session was refused after signing out.
  With the sentinel stopped the page said "not known". The pages were also driven against the pretend server
  with hostile text in every field (markup, very long strings, right-to-left overrides): nothing was interpreted.
  Not checked: a real screen reader, and the pages on a real phone.
- **A second independent review, of the dashboard alone.** It found nine problems, two of them serious: a signed-in
  person could have pointed the mail server at their own machine and collected the school's mail password, and a
  broken-into game container could have reached the dashboard's service directly while claiming to be a staff
  address. All nine are fixed, each with a test, and the attacks were then tried again on the real system: from
  inside the game's container the dashboard is unreachable by every route (refused by the proxy, dropped by the
  firewall), the cookie is stripped by the real proxy software, the mail password is gone after the mail server
  changes and no sign-in is attempted without one, forty wrong passwords sent at once came back as five refusals
  and thirty-five "paused", and a second backup straight after the first is refused.
- **What trying it for real found that the tests had not**: the proxy could not start, because the game's container
  had been handed the address reserved for it (the two now draw from separate ranges, and a container network
  that does not match the settings is rebuilt by `ludoractl apply`); a backup started from the dashboard failed,
  because the encryption tool wanted a folder the helper is not allowed to see (it now has its own); and a new
  site address that could not work was accepted and never undone, because the change cut the request that asked
  for it. With the answer-first design described above, on the real system: an address the server does not have and
  a name that does not exist are refused at once; a public certificate that could not be issued was put back by the
  server after about seventy seconds, with the reason shown at the next sign-in; and a name that does point at the
  server took effect, with the dashboard and the game both answering under it.
- **An independent security review** of the code, by a reviewer given the code and the threat model but not the
  author's conclusions. It found seven problems and several suspicions; all seven are fixed and have tests (among
  them: a padded request could hide from the sentinel, changing a setting could stop the sentinel, a decoy touch
  could ban a whole school behind one shared address, and a web page could get its visitor banned). The
  hardware-address check against impersonation is covered by unit tests only, not by a live attack.
- **The console**: every setup screen and the main menus, driven in a pretend terminal
  (`python3 tests/console_harness.py firstboot`).
- **The install image**: GitHub builds it on every change (the "Ludora OS" workflow) and keeps it for download.
  That image was started in an emulated PC: it shows the Ludora OS boot menu on both old-style (BIOS) and UEFI
  firmware, loads the installer, asks which disk to erase (offering only the real disk) and for the passphrase, and
  the installer accepts the encrypted disk layout. Doing this found and fixed two installer faults. See
  `apps/ludora/os/README.md`.

Not tested, because the test machine could not do it: a complete install to a disk and the first start of the
installed system (the emulator had no network and no hardware acceleration, so the run stops where the installer
downloads its packages); disk encryption and the boot menu password on real hardware; SELinux in enforcing mode with the containers
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
