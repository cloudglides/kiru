class MainApp {
    constructor() {
        this.config_dir = GLib.get_home_dir() + '/.kiru';
        this.config_file = this.config_dir + '/conf.json';
        this.current_version = '1.0.0'; // Hardcoded app version
        this.load_config();
        this.check_for_updates_on_startup();
        this.init_ui();
        this.init_monitor();
    }



    load_config() {
        try {
            let dir = Gio.File.new_for_path(this.config_dir);
            if (!dir.query_exists(null)) {
                dir.make_directory_with_parents(null);
            }
            let file = Gio.File.new_for_path(this.config_file);
            if (file.query_exists(null)) {
                let [success, contents] = file.load_contents(null);
                if (success) {
                    let decoder = new TextDecoder('utf-8');
                    let text = decoder.decode(contents);
                    this.config = JSON.parse(text);
                } else {
                    this.config = {};
                }
            } else {
                this.config = {};
            }
        } catch (e) {
            this.config = {};
            console.log('Error loading config:', e);
        }
    }

    save_config() {
        try {
            let dir = Gio.File.new_for_path(this.config_dir);
            if (!dir.query_exists(null)) {
                dir.make_directory_with_parents(null);
            }
            let file = Gio.File.new_for_path(this.config_file);
            let data = JSON.stringify(this.config, null, 2);
            let [, etag] = file.replace_contents(data, null, false, Gio.FileCreateFlags.NONE, null);
        } catch (e) {
            console.log('Error saving config:', e);
        }
    }

    check_for_updates_on_startup() {
        let session = new Soup.Session();
        let message = Soup.Message.new('GET', 'https://api.github.com/repos/cloudglides/kiru/releases/latest');

        session.send_message(message);
        if (message.status_code === 200) {
            try {
                let data = JSON.parse(message.response_body.data);
                let latest_version = data.tag_name.replace('v', '');
                if (latest_version > this.current_version) {
                    this.update_available = true;
                    this.latest_release = data;
                    console.log('Update available:', latest_version);
                } else {
                    this.update_available = false;
                }
            } catch (e) {
                console.log('Error checking updates:', e);
                this.update_available = false;
            }
        } else {
            console.log('Failed to check updates');
            this.update_available = false;
        }
    }

    handle_update() {
        if (this.update_available) {
            this.perform_update();
        } else {
            this.check_for_updates();
        }
    }

    check_for_updates() {
        console.log('Checking for updates...');
        let session = new Soup.Session();
        let message = Soup.Message.new('GET', 'https://api.github.com/repos/cloudglides/kiru/releases/latest');

        session.send_message(message);
        if (message.status_code === 200) {
            try {
                let data = JSON.parse(message.response_body.data);
                let latest_version = data.tag_name.replace('v', '');
                if (latest_version > this.current_version) {
                    let dialog = new Gtk.MessageDialog({
                        transient_for: this.window,
                        modal: true,
                        message_type: Gtk.MessageType.INFO,
                        buttons: Gtk.ButtonsType.YES_NO,
                        text: `New version available: ${latest_version}\n\nDo you want to download and install it?`
                    });
                    let response = dialog.run();
                    dialog.destroy();
                    if (response === Gtk.ResponseType.YES) {
                        this.latest_release = data;
                        this.perform_update();
                    }
                } else {
                    let dialog = new Gtk.MessageDialog({
                        transient_for: this.window,
                        modal: true,
                        message_type: Gtk.MessageType.INFO,
                        buttons: Gtk.ButtonsType.OK,
                        text: 'You are using the latest version.'
                    });
                    dialog.run();
                    dialog.destroy();
                }
            } catch (e) {
                console.log('Error parsing GitHub API response:', e);
                let dialog = new Gtk.MessageDialog({
                    transient_for: this.window,
                    modal: true,
                    message_type: Gtk.MessageType.ERROR,
                    buttons: Gtk.ButtonsType.OK,
                    text: 'Failed to check for updates.'
                });
                dialog.run();
                dialog.destroy();
            }
        } else {
            console.log('GitHub API request failed:', message.status_code);
            let dialog = new Gtk.MessageDialog({
                transient_for: this.window,
                modal: true,
                message_type: Gtk.MessageType.ERROR,
                buttons: Gtk.ButtonsType.OK,
                text: 'Failed to check for updates. Check your internet connection.'
            });
            dialog.run();
            dialog.destroy();
        }
    }

    perform_update() {
        let is_appimage = GLib.getenv('APPIMAGE') !== null;
        let asset_name_pattern = is_appimage ? /kiru-.*\.AppImage/ : (this.detect_package_manager() === 'rpm' ? /kiru-.*\.rpm/ : /kiru_.*\.deb/);
        let asset_url = null;

        for (let asset of this.latest_release.assets) {
            if (asset_name_pattern.test(asset.name)) {
                asset_url = asset.browser_download_url;
                break;
            }
        }

        if (!asset_url) {
            let dialog = new Gtk.MessageDialog({
                transient_for: this.window,
                modal: true,
                message_type: Gtk.MessageType.ERROR,
                buttons: Gtk.ButtonsType.OK,
                text: 'No compatible update package found.'
            });
            dialog.run();
            dialog.destroy();
            return;
        }

        let download_path = GLib.get_tmp_dir() + '/kiru_update';
        let download_cmd = `wget -O "${download_path}" "${asset_url}"`;

        let dialog = new Gtk.MessageDialog({
            transient_for: this.window,
            modal: true,
            message_type: Gtk.MessageType.INFO,
            buttons: Gtk.ButtonsType.OK,
            text: 'Downloading update...\nThis may take a few moments.'
        });
        dialog.show();

        // Download update
        let [success, stdout, stderr] = GLib.spawn_command_line_sync(download_cmd);
        dialog.destroy();

        if (!success) {
            let error_dialog = new Gtk.MessageDialog({
                transient_for: this.window,
                modal: true,
                message_type: Gtk.MessageType.ERROR,
                buttons: Gtk.ButtonsType.OK,
                text: 'Failed to download update.'
            });
            error_dialog.run();
            error_dialog.destroy();
            return;
        }

        if (is_appimage) {
            // Replace AppImage
            let appimage_path = GLib.getenv('APPIMAGE');
            let install_cmd = `chmod +x "${download_path}" && mv "${download_path}" "${appimage_path}" && exec "${appimage_path}"`;
            GLib.spawn_command_line_async(install_cmd);
            this.window.destroy();
        } else {
            // Install deb/rpm
            let package_type = this.detect_package_manager();
            let install_cmd = package_type === 'rpm' ?
                `sudo rpm -U "${download_path}"` :
                `sudo dpkg -i "${download_path}"`;
            let [install_success, install_stdout, install_stderr] = GLib.spawn_command_line_sync(install_cmd);
            if (install_success) {
                let success_dialog = new Gtk.MessageDialog({
                    transient_for: this.window,
                    modal: true,
                    message_type: Gtk.MessageType.INFO,
                    buttons: Gtk.ButtonsType.OK,
                    text: 'Update installed successfully!\nPlease restart the application.'
                });
                success_dialog.run();
                success_dialog.destroy();
                this.window.destroy();
            } else {
                console.log('Install stderr:', install_stderr);
                let error_dialog = new Gtk.MessageDialog({
                    transient_for: this.window,
                    modal: true,
                    message_type: Gtk.MessageType.ERROR,
                    buttons: Gtk.ButtonsType.OK,
                    text: 'Failed to install update. Check system logs for details.'
                });
                error_dialog.run();
                error_dialog.destroy();
            }
            GLib.spawn_command_line_sync(`rm "${download_path}"`);
        }
    }

    detect_package_manager() {
        // Simple detection: check if rpm or dpkg is available
        let [rpm_success] = GLib.spawn_command_line_sync('which rpm');
        return rpm_success ? 'rpm' : 'deb';
    }

    init_monitor() {
        this.update_monitor();
    }

    update_monitor() {
        if (this.monitor) {
            this.monitor.cancel();
        }
        this.screenshots_dir = this.config.folder || GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES) + "/Screenshots";
        let dir = Gio.File.new_for_path(this.screenshots_dir);
        if (!dir.query_exists(null)) {
            dir.make_directory_with_parents(null);
        }
        this.monitor = dir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        this.monitor.connect('changed', (monitor, file, other_file, event_type) => {
            if (event_type === Gio.FileMonitorEvent.CREATED && file.get_basename().endsWith('.png')) {
                // Delay a bit to ensure file is written
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                    try {
                        if (this.config.auto_upload_no_edit) {
                            this.upload_file_directly(file.get_path(), this.config.api_key);
                        } else {
                            let pixbuf = GdkPixbuf.Pixbuf.new_from_file(file.get_path());
                            new ScreenshotEditor(pixbuf, {
                                auto_delete: this.config.auto_delete,
                                copy_clipboard: this.config.copy_clipboard,
                                auto_upload: this.config.auto_upload,
                                file_path: file.get_path(),
                                api_key: this.config.api_key
                            });
                        }
                    } catch (e) {
                        // ignore
                    }
                    return false;
                });
            }
        });
    }

    upload_file_directly(file_path, api_key) {
        console.log('Auto-uploading', file_path);
        let cmd = `curl -s -X POST -F "key=${api_key}" -F "image=@${file_path}" https://api.imgbb.com/1/upload`;
        let [success, stdout, stderr] = GLib.spawn_command_line_sync(cmd);
        if (success && stdout) {
            try {
                let decoder = new TextDecoder('utf-8');
                let text = decoder.decode(stdout);
                let data = JSON.parse(text);
                if (data.success) {
                    let link = data.data.url;
                    let clip_cmd = `echo "${link}" | wl-copy`;
                    let [clip_success, , clip_stderr] = GLib.spawn_command_line_sync(clip_cmd);
                    if (clip_success) {
                        console.log('Auto-uploaded and copied:', link);
                    } else {
                        console.log('Clipboard copy failed:', clip_stderr);
                    }
                    // Delete if checked
                    if (this.auto_delete_check.get_active()) {
                        let file = Gio.File.new_for_path(file_path);
                        file.delete(null);
                        console.log('Deleted file:', file_path);
                    }
                } else {
                    console.log('Auto-upload failed:', data.error ? data.error.message : 'Unknown error');
                }
            } catch (e) {
                console.log('JSON parse error:', e);
            }
        } else {
            console.log('Auto-upload command failed');
        }
    }

    init_ui() {
        this.window = new Gtk.Window({title: "Kiru - Monitoring Screenshots"});
        this.window.set_default_size(400, 350);

        let box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 10});
        box.set_margin_top(20);
        box.set_margin_bottom(20);
        box.set_margin_start(20);
        box.set_margin_end(20);

        let label = new Gtk.Label({label: "Monitoring ~/Pictures/Screenshots for new screenshots.\nTake a screenshot with gnome-screenshot to edit."});
        label.set_line_wrap(true);
        box.pack_start(label, false, false, 0);

        // Update button
        this.update_btn = new Gtk.Button({label: this.update_available ? "Update Available!" : "Check for Updates"});
        this.update_btn.connect("clicked", () => this.handle_update());
        box.pack_start(this.update_btn, false, false, 0);

        // Settings
        let settings_label = new Gtk.Label({label: "Settings:"});
        settings_label.set_markup("<b>Settings:</b>");
        box.pack_start(settings_label, false, false, 0);

        this.auto_delete_check = new Gtk.CheckButton({label: "Auto-delete screenshots from gallery after editing"});
        this.auto_delete_check.set_active(this.config.auto_delete || false);
        this.auto_delete_check.connect('toggled', () => { this.config.auto_delete = this.auto_delete_check.get_active(); this.save_config(); });
        box.pack_start(this.auto_delete_check, false, false, 0);

        this.copy_clipboard_check = new Gtk.CheckButton({label: "Copy uploaded URL to clipboard"});
        this.copy_clipboard_check.set_active(this.config.copy_clipboard !== false);
        this.copy_clipboard_check.connect('toggled', () => { this.config.copy_clipboard = this.copy_clipboard_check.get_active(); this.save_config(); });
        box.pack_start(this.copy_clipboard_check, false, false, 0);

        this.auto_upload_check = new Gtk.CheckButton({label: "Auto-upload edited screenshots"});
        this.auto_upload_check.set_active(this.config.auto_upload || false);
        this.auto_upload_check.connect('toggled', () => { this.config.auto_upload = this.auto_upload_check.get_active(); this.save_config(); });
        box.pack_start(this.auto_upload_check, false, false, 0);

        this.auto_upload_no_edit_check = new Gtk.CheckButton({label: "Auto-upload screenshots without editing (copy to clipboard)"});
        this.auto_upload_no_edit_check.set_active(this.config.auto_upload_no_edit || false);
        this.auto_upload_no_edit_check.connect('toggled', () => { this.config.auto_upload_no_edit = this.auto_upload_no_edit_check.get_active(); this.save_config(); });
        box.pack_start(this.auto_upload_no_edit_check, false, false, 0);

        // API Key
        let api_box = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 5});
        let api_label = new Gtk.Label({label: "ImgBB API Key:"});
        api_box.pack_start(api_label, false, false, 0);
        this.api_entry = new Gtk.Entry();
        this.api_entry.set_text(this.config.api_key || "YOUR_IMGBB_KEY");
        this.api_entry.connect('changed', () => { this.config.api_key = this.api_entry.get_text(); this.save_config(); });
        api_box.pack_start(this.api_entry, true, true, 0);
        box.pack_start(api_box, false, false, 0);

        // Folder Path
        let folder_box = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 5});
        let folder_label = new Gtk.Label({label: "Screenshots Folder:"});
        folder_box.pack_start(folder_label, false, false, 0);
        this.folder_entry = new Gtk.Entry();
        this.folder_entry.set_text(this.config.folder || GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES) + "/Screenshots");
        this.folder_entry.connect('changed', () => { this.config.folder = this.folder_entry.get_text(); this.save_config(); });
        folder_box.pack_start(this.folder_entry, true, true, 0);
        box.pack_start(folder_box, false, false, 0);

        let update_btn = new Gtk.Button({label: "Update Settings"});
        update_btn.connect("clicked", () => this.update_monitor());
        box.pack_start(update_btn, false, false, 0);

        let manual_btn = new Gtk.Button({label: "Take Screenshot Manually"});
        manual_btn.connect("clicked", () => this.take_screenshot());
        box.pack_start(manual_btn, false, false, 0);

        this.window.add(box);
        this.window.show_all();
        this.window.connect("destroy", () => Gtk.main_quit());
    }

    take_screenshot() {
        let temp_path = GLib.get_tmp_dir() + '/kiru_manual_ss.png';
        GLib.spawn_command_line_sync(`gnome-screenshot -f ${temp_path}`);

        let pixbuf = GdkPixbuf.Pixbuf.new_from_file(temp_path);
        new ScreenshotEditor(pixbuf, {
            auto_delete: this.config.auto_delete,
            copy_clipboard: this.config.copy_clipboard,
            auto_upload: this.config.auto_upload,
            file_path: temp_path,
            api_key: this.config.api_key
        });
    }
}
