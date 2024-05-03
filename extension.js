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

    #settings = null;
    #settingsCache = {};

    #desktopInterface = null;
    #powerProfileMonitor = null;

    #powerSupplyProxy = null;
    #batteryProxy = null;

    #settingsChangedSignalId = null;
    #powerProfileChangedSignalId = null;
    #powerSupplyChangedSingalId = null;
    #batteryChangedSingalId = null;

    constructor(metadata) {
        super(metadata);
    }

    async enable() {
        this.#settings = this.getSettings();

        this.#desktopInterface = this.getSettings(DESKTOP_INTERFACE_SETTINGS);
        this.#powerProfileMonitor = Gio.PowerProfileMonitor.dup_default();

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
                this.#batteryProxy = proxy;

                this.#batteryChangedSingalId = proxy.connect(
                    G_PROPERTIES_CHANGED_SIGNAL,
                    this.#update.bind(this)
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
                this.#powerSupplyProxy = proxy;

                this.#powerSupplyChangedSingalId = proxy.connect(
                    G_PROPERTIES_CHANGED_SIGNAL,
                    this.#update.bind(this)
                );
            }
        ).catch(
            e => {
                // TODO: add notifier for errors
            }
        );

        this.#settingsChangedSignalId = this.#settings.connect("changed", this.#onSettingsChanged.bind(this));
    
        this.#powerProfileChangedSignalId = this.#powerProfileMonitor.connect(
            NOTIFY_POWER_SAVER_ENABLED_SIGNAL, this.#update.bind(this)
        );

        this.#onSettingsChanged(this.#settings, null);
    }

    disable() {
        if (this.#settingsChangedSignalId) {
            this.#settings.disconnect(this.#settingsChangedSignalId);
            this.#settingsChangedSignalId = null;
        }
        if (this.#batteryChangedSingalId) {
            this.#batteryProxy.disconnect(this.#batteryChangedSingalId);
            this.#batteryChangedSingalId = null;
        }
        if (this.#powerSupplyChangedSingalId) {
            this.#powerSupplyProxy.disconnect(this.#powerSupplyChangedSingalId);
            this.#powerSupplyChangedSingalId = null;
        }
        if (this.#powerProfileChangedSignalId) {
            this.#powerProfileMonitor.disconnect(this.#powerProfileChangedSignalId);
            this.#powerProfileChangedSignalId = null;
        }

        this.#settings = null;
        this.#settingsCache = {};

        this.#desktopInterface = null;
        this.#powerProfileMonitor = null;

        this.#powerSupplyProxy = null;
        this.#batteryProxy = null;
    }

    #onSettingsChanged(settings, changed) {
        this.#settingsCache = {
            hideOnBatteryLevel: settings.get_int("hide-on-battery-level"),
            hideOnPowerSavingDisabled: settings.get_boolean("hide-on-power-saving-disabled"),
            hideOnPluggedIn: settings.get_boolean("hide-on-plugged-in")
        }

        this.#update();
    }

    #update() {
        let showBatteryPercentage = true;

        if (this.#hideOnBatteryLevel(this.#batteryProxy) 
            || this.#hideOnPluggedIn(this.#powerSupplyProxy) 
            || this.#hideOnPowerSavingDisabled(this.#powerProfileMonitor)) {
            showBatteryPercentage = false;
        }

        this.#setShowBatteryPercentage(showBatteryPercentage);
    }

    #hideOnPowerSavingDisabled(powerProfileMonitor) {
        if (!powerProfileMonitor) return false;

        return this.#settingsCache.hideOnPowerSavingDisabled && !powerProfileMonitor.get_power_saver_enabled();
    }

    #hideOnPluggedIn(proxy) {
        if (!proxy || proxy.Type !== UPowerGlib.DeviceKind.LINE_POWER) return false;

        return this.#settingsCache.hideOnPluggedIn && proxy.Online;
    }

    #hideOnBatteryLevel(proxy) {
        if (!proxy || proxy.Type !== UPowerGlib.DeviceKind.BATTERY) return false;

        return proxy.Percentage >= this.#settingsCache.hideOnBatteryLevel;
    }

    #setShowBatteryPercentage(value) {
        if (this.#desktopInterface.get_boolean(SHOW_BATTERY_PERCENTAGE_PROPERTY) === value) {
            return;
        }

        this.#desktopInterface.set_boolean(SHOW_BATTERY_PERCENTAGE_PROPERTY, value);
    }

}
