// SPDX-License-Identifier: GPL-2.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {QuickToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const SYSTEMD = 'org.freedesktop.systemd1';
const SYSTEMD_PATH = '/org/freedesktop/systemd1';
const MANAGER = 'org.freedesktop.systemd1.Manager';
const UNIT = 'keep-awake.service';
const ICON = 'view-reveal-symbolic';

// Same command as the keep-awake fish function. The unit is the shared state,
// so the toggle and the fish function can be mixed freely.
const START = ['systemd-run', '--user', '--quiet', '--collect', '--unit=keep-awake',
    'systemd-inhibit', '--what=sleep:handle-lid-switch', '--why=keep awake', 'sleep', 'infinity'];
const STOP = ['systemctl', '--user', 'stop', 'keep-awake'];

// Manager signals that name the unit, and which argument holds the name.
const UNIT_ARG = {UnitNew: 0, UnitRemoved: 0, JobRemoved: 2};

const KeepAwakeToggle = GObject.registerClass(
class KeepAwakeToggle extends QuickToggle {
    _init() {
        super._init({
            title: 'Keep Awake',
            subtitle: 'Even with lid shut',
            iconName: ICON,
            toggleMode: false,
        });
    }
});

const KeepAwakeIndicator = GObject.registerClass(
class KeepAwakeIndicator extends SystemIndicator {
    _init() {
        super._init();

        this._indicator = this._addIndicator();
        this._indicator.iconName = ICON;
        this._indicator.visible = false;

        this._toggle = new KeepAwakeToggle();
        this._toggle.connect('clicked', () => this._spawn(this._toggle.checked ? STOP : START));
        this.quickSettingsItems.push(this._toggle);

        this._cancellable = new Gio.Cancellable();
        this._signalId = Gio.DBus.session.signal_subscribe(SYSTEMD, MANAGER, null, SYSTEMD_PATH,
            null, Gio.DBusSignalFlags.NONE, (_conn, _sender, _path, _iface, signal, params) => {
                const arg = UNIT_ARG[signal];
                if (arg !== undefined && params.get_child_value(arg).unpack() === UNIT)
                    this._sync();
            });

        // systemd only emits Manager signals while a client is subscribed. If
        // another user of the shell's bus connection already is, leave theirs alone.
        this._subscribed = false;
        this._call('Subscribe', null, null).then(() => {
            this._subscribed = true;
        }).catch(e => {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED) &&
                Gio.DBusError.get_remote_error(e) !== 'org.freedesktop.systemd1.AlreadySubscribed')
                this._logError(e);
        });

        // While keep-awake holds handle-lid-switch, logind ignores the lid and
        // nothing locks or blanks the screen, so lock it here. gsd-power blanks
        // the screen once the shield is up, and mutter counts opening the lid
        // as user activity, which wakes it to the lock screen.
        this._lidId = global.backend.connect('lid-is-closed-changed', (_backend, closed) => {
            if (closed && this._toggle.checked && !this._hasExternalMonitor())
                Main.screenShield.lock(false);
        });

        this._sync();
        Main.panel.statusArea.quickSettings.addExternalIndicator(this);
    }

    // With an external monitor, a closed lid means docked use: mutter moves to
    // the external screen, which should stay unlocked.
    _hasExternalMonitor() {
        return global.backend.get_monitor_manager().get_monitors().some(m => !m.is_builtin());
    }

    _call(method, params, replyType) {
        return new Promise((resolve, reject) => {
            Gio.DBus.session.call(SYSTEMD, SYSTEMD_PATH, MANAGER, method, params,
                replyType ? new GLib.VariantType(replyType) : null,
                Gio.DBusCallFlags.NONE, -1, this._cancellable, (conn, res) => {
                    try {
                        resolve(conn.call_finish(res));
                    } catch (e) {
                        reject(e);
                    }
                });
        });
    }

    // ListUnitsByPatterns only reports loaded units. ListUnitsByNames would load
    // the unit to answer, firing UnitNew/UnitRemoved and re-triggering this.
    async _sync() {
        try {
            const reply = await this._call('ListUnitsByPatterns',
                new GLib.Variant('(asas)', [[], [UNIT]]), '(a(ssssssouso))');
            const [units] = reply.deepUnpack();
            const active = units.some(unit => unit[3] === 'active');
            this._toggle.checked = active;
            this._indicator.visible = active;
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                this._logError(e);
        }
    }

    _spawn(argv) {
        try {
            const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
            proc.wait_check_async(null, (p, res) => {
                try {
                    p.wait_check_finish(res);
                } catch (e) {
                    this._logError(e);
                }
            });
        } catch (e) {
            this._logError(e);
        }
    }

    _logError(e) {
        logError(e, 'keep-awake');
    }

    destroy() {
        this._cancellable.cancel();
        global.backend.disconnect(this._lidId);
        Gio.DBus.session.signal_unsubscribe(this._signalId);
        if (this._subscribed) {
            Gio.DBus.session.call(SYSTEMD, SYSTEMD_PATH, MANAGER, 'Unsubscribe', null, null,
                Gio.DBusCallFlags.NONE, -1, null, null);
        }
        this.quickSettingsItems.forEach(item => item.destroy());
        super.destroy();
    }
});

// The shell's disable/re-enable "rebase" can repeat calls when its extension
// order list holds this uuid twice, so both must tolerate being called again.
export default class KeepAwakeExtension extends Extension {
    enable() {
        this._indicator ??= new KeepAwakeIndicator();
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
