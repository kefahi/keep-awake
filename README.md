# Awake & Locked

A GNOME Shell extension that keeps your machine awake, even with the lid
closed, and locks the screen when you close the lid.

## Why

Caffeine and similar extensions block *idle* suspend. Closing the lid is
handled by systemd-logind, and logind suspends anyway. Only a
`handle-lid-switch` inhibitor lock stops it. Once that lock is held, though,
nothing in GNOME reacts to the lid at all. The screen stays on and the
session stays unlocked inside your bag. This extension holds the lock and
does the locking itself.

## What it does

- **A Quick Settings toggle, "Keep Awake".** While it's on, an eye icon shows
  in the top bar.
- **On:** runs a transient systemd user unit, `keep-awake.service`, that holds
  `systemd-inhibit --what=sleep:handle-lid-switch`. That blocks suspend from
  idle, from the menu and from the lid.
- **Closing the lid while it's on** locks the screen, and GNOME blanks it.
  Opening the lid shows the lock screen. With an external monitor connected,
  closing the lid doesn't lock, so docked use keeps working.
- **Off:** stops the unit.

## Good to know

- While it's on, **Suspend** in the system menu asks for an administrator
  password, because logind sees the inhibitor. It isn't offered on the lock
  screen.
- Only suspend is blocked. The screen still blanks and locks when you're idle.
- The unit belongs to your login session, so it ends when you log out. The
  toggle always starts off after you log in.
- It needs systemd (`systemd-run`, `systemd-inhibit`).

## From a terminal

The toggle follows the unit, so the terminal and the toggle stay in sync:

```sh
# on
systemd-run --user --quiet --collect --unit=keep-awake \
    systemd-inhibit --what=sleep:handle-lid-switch --why="keep awake" sleep infinity
# off
systemctl --user stop keep-awake
```

For fish, copy `extras/keep-awake.fish` to `~/.config/fish/functions/` to get
a `keep-awake` command that toggles it.

## Install

From source:

```sh
git clone https://github.com/kefahi/keep-awake
cd keep-awake
gnome-extensions pack --force
gnome-extensions install --force awake-locked@kefahi.github.io.shell-extension.zip
```

Log out and back in, then enable it:

```sh
gnome-extensions enable awake-locked@kefahi.github.io
```

## Compatibility

Tested on GNOME Shell 51 (Fedora 45). Older versions haven't been tested, so
`metadata.json` lists only 51. Reports from other versions are welcome.

## License

GPL-2.0-or-later. See [LICENSE](LICENSE).
