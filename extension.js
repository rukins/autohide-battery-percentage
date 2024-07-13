import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import UPowerGlib from 'gi://UPowerGlib';

// import * as FileUtils from "resource:///org/gnome/shell/misc/fileUtils.js";
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import * as FileUtils from "./fileUtils.js"


const G_PROPERTIES_CHANGED_SIGNAL = "g-properties-changed";
const NOTIFY_POWER_SAVER_ENABLED_SIGNAL = "notify::power-saver-enabled";

const LINE_POWER_ACAD_OBJECT_PATH = "/org/freedesktop/UPower/devices/line_power_ACAD";
const BATTERY_BAT1_OBJECT_PATH = "/org/freedesktop/UPower/devices/battery_BAT1";

const UPOWER_INTERFACE = "org.freedesktop.UPower";
const UPOWER_DEVICE_INTERFACE = "org.freedesktop.UPower.Device";

const DESKTOP_INTERFACE_SETTINGS = "org.gnome.desktop.interface";
const SHOW_BATTERY_PERCENTAGE_PROPERTY = "show-battery-percentage";

export default class AutohideBatteryPercentageExtension extends Extension {

    _settings = null;
    _settingsCache = {};

    _desktopInterface = null;
    _powerProfileMonitor = null;

    _powerSupplyProxy = null;
    _batteryProxy = null;

    _settingsChangedSignalId = null;
    _powerProfileChangedSignalId = null;
    _powerSupplyChangedSingalId = null;
    _batteryChangedSingalId = null;

    constructor(metadata) {
        super(metadata);
    }

    async enable() {
        this._settings = this.getSettings();

        this._desktopInterface = this.getSettings(DESKTOP_INTERFACE_SETTINGS);
        this._powerProfileMonitor = Gio.PowerProfileMonitor.dup_default();

        // https://gitlab.gnome.org/GNOME/gjs/-/blob/master/modules/core/overrides/Gio.js
        const UPowerDeviceProxyWrapper = Gio.DBusProxy.makeProxyWrapper(
            FileUtils.loadXML(
                UPOWER_DEVICE_INTERFACE, GLib.build_filenamev([this.metadata.path])
            )
        );

        await UPowerDeviceProxyWrapper.newAsync(
            Gio.DBus.system,
            UPOWER_INTERFACE,
            BATTERY_BAT1_OBJECT_PATH
        ).then(
            proxy => {
                this._batteryProxy = proxy;

                this._batteryChangedSingalId = proxy.connect(
                    G_PROPERTIES_CHANGED_SIGNAL,
                    this._update.bind(this)
                );
            }
        ).catch(
            e => {
                // TODO: add notifier for errors
            }
        );

        await UPowerDeviceProxyWrapper.newAsync(
            Gio.DBus.system,
            UPOWER_INTERFACE,
            LINE_POWER_ACAD_OBJECT_PATH
        ).then(
            proxy => {
                this._powerSupplyProxy = proxy;

                this._powerSupplyChangedSingalId = proxy.connect(
                    G_PROPERTIES_CHANGED_SIGNAL,
                    this._update.bind(this)
                );
            }
        ).catch(
            e => {
                // TODO: add notifier for errors
            }
        );

        this._settingsChangedSignalId = this._settings.connect("changed", this._onSettingsChanged.bind(this));
    
        this._powerProfileChangedSignalId = this._powerProfileMonitor.connect(
            NOTIFY_POWER_SAVER_ENABLED_SIGNAL, this._update.bind(this)
        );

        this._onSettingsChanged(this._settings, null);
    }

    disable() {
        if (this._settingsChangedSignalId) {
            this._settings.disconnect(this._settingsChangedSignalId);
            this._settingsChangedSignalId = null;
        }
        if (this._batteryChangedSingalId) {
            this._batteryProxy.disconnect(this._batteryChangedSingalId);
            this._batteryChangedSingalId = null;
        }
        if (this._powerSupplyChangedSingalId) {
            this._powerSupplyProxy.disconnect(this._powerSupplyChangedSingalId);
            this._powerSupplyChangedSingalId = null;
        }
        if (this._powerProfileChangedSignalId) {
            this._powerProfileMonitor.disconnect(this._powerProfileChangedSignalId);
            this._powerProfileChangedSignalId = null;
        }

        this._settings = null;
        this._settingsCache = {};

        this._desktopInterface = null;
        this._powerProfileMonitor = null;

        this._powerSupplyProxy = null;
        this._batteryProxy = null;
    }

    _onSettingsChanged(settings, changed) {
        this._settingsCache = {
            hideOnBatteryLevel: settings.get_int("hide-on-battery-level"),
            hideOnPowerSavingDisabled: settings.get_boolean("hide-on-power-saving-disabled"),
            hideOnPluggedIn: settings.get_boolean("hide-on-plugged-in")
        }

        this._update();
    }

    _update() {
        let showBatteryPercentage = true;

        if (this._hideOnBatteryLevel(this._batteryProxy) 
            || this._hideOnPluggedIn(this._powerSupplyProxy) 
            || this._hideOnPowerSavingDisabled(this._powerProfileMonitor)) {
            showBatteryPercentage = false;
        }

        this._setShowBatteryPercentage(showBatteryPercentage);
    }

    _hideOnPowerSavingDisabled(powerProfileMonitor) {
        if (!powerProfileMonitor) return false;

        return this._settingsCache.hideOnPowerSavingDisabled && !powerProfileMonitor.get_power_saver_enabled();
    }

    _hideOnPluggedIn(proxy) {
        if (!proxy || proxy.Type !== UPowerGlib.DeviceKind.LINE_POWER) return false;

        return this._settingsCache.hideOnPluggedIn && proxy.Online;
    }

    _hideOnBatteryLevel(proxy) {
        if (!proxy || proxy.Type !== UPowerGlib.DeviceKind.BATTERY) return false;

        return proxy.Percentage >= this._settingsCache.hideOnBatteryLevel;
    }

    _setShowBatteryPercentage(value) {
        if (this._desktopInterface.get_boolean(SHOW_BATTERY_PERCENTAGE_PROPERTY) === value) {
            return;
        }

        this._desktopInterface.set_boolean(SHOW_BATTERY_PERCENTAGE_PROPERTY, value);
    }

}
