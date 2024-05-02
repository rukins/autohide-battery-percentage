import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';


export default class AutohideBatteryPercentagePreferences extends ExtensionPreferences {

    constructor(metadata) {
        super(metadata);
    }

    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;

        const page = new Adw.PreferencesPage();
        window.add(page);

        const group = new Adw.PreferencesGroup();
        page.add(group);

        const hideOnBatteryLevelRow = new Adw.SpinRow({
            title: _("Hide on battery level above"),
            adjustment: new Gtk.Adjustment({
                "value": settings.get_int("hide-on-battery-level"),
                "step-increment": 1,
                "lower": 0,
                "upper": 100,
            })
        });
        group.add(hideOnBatteryLevelRow);

        const hideOnPluggedInRow = new Adw.SwitchRow({
            title: _("Hide on plugged in"),
            active: settings.get_boolean("hide-on-plugged-in")
        });
        group.add(hideOnPluggedInRow);

        const hideOnPowerSavingDisabledRow = new Adw.SwitchRow({
            title: _("Hide on power saving disabled"),
            active: settings.get_boolean("hide-on-power-saving-disabled")
        });
        group.add(hideOnPowerSavingDisabledRow);

        window._settings.bind("hide-on-battery-level", hideOnBatteryLevelRow, "value", Gio.SettingsBindFlags.DEFAULT);
        window._settings.bind("hide-on-plugged-in", hideOnPluggedInRow, "active", Gio.SettingsBindFlags.DEFAULT);
        window._settings.bind("hide-on-power-saving-disabled", hideOnPowerSavingDisabledRow, "active", Gio.SettingsBindFlags.DEFAULT);
    }

}
