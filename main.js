#!/usr/bin/env gjs

imports.gi.versions.Gtk = '3.0';
const {Gtk, Gdk, GdkPixbuf, Gio, GLib, Soup} = imports.gi;
const cairo = imports.cairo;

class ScreenshotEditor {
    constructor(pixbuf, options = {}) {
        this.original_pixbuf = pixbuf;
        this.pixbuf = pixbuf.copy();
        this.strokes = [];
        this.drawing = false;
        this.last_x = 0;
        this.last_y = 0;
        this.brush_color = [1, 0, 0]; // Red
        this.brush_size = 10;
        this.options = options;

        this.init_ui();
        if (this.options.auto_upload) {
            // Auto upload after a short delay
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                this.upload_image();
                return false;
            });
        }
    }

    init_ui() {
        this.window = new Gtk.Window({title: "Kiru - Edit Screenshot"});
        this.window.set_default_size(800, 600);
        this.window.set_resizable(true);

        // Header bar
        this.header = new Gtk.HeaderBar();
        this.header.set_show_close_button(true);
        this.header.title = "Kiru";

        this.upload_btn = new Gtk.Button({label: "Upload"});
        this.upload_btn.connect("clicked", () => this.upload_image());
        this.header.pack_start(this.upload_btn);

        this.clear_btn = new Gtk.Button({label: "Clear"});
        this.clear_btn.connect("clicked", () => this.clear_drawings());
        this.header.pack_start(this.clear_btn);

        this.window.set_titlebar(this.header);

        // Main box
        let main_box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});

        // Drawing area
        this.drawing_area = new Gtk.DrawingArea();
        this.drawing_area.set_size_request(this.pixbuf.get_width(), this.pixbuf.get_height());
        this.drawing_area.connect("draw", (widget, cr) => this.on_draw(widget, cr));
        this.drawing_area.connect("button-press-event", (widget, event) => this.on_button_press(widget, event));
        this.drawing_area.connect("motion-notify-event", (widget, event) => this.on_motion_notify(widget, event));
        this.drawing_area.connect("button-release-event", (widget, event) => this.on_button_release(widget, event));
        this.drawing_area.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.BUTTON_RELEASE_MASK | Gdk.EventMask.POINTER_MOTION_MASK);
        let scrolled = new Gtk.ScrolledWindow();
        scrolled.add(this.drawing_area);
        main_box.pack_start(scrolled, true, true, 0);

        // Controls
        let controls_box = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 10});
        controls_box.set_margin_top(10);
        controls_box.set_margin_bottom(10);
        controls_box.set_margin_start(10);
        controls_box.set_margin_end(10);

        let color_label = new Gtk.Label({label: "Color:"});
        controls_box.pack_start(color_label, false, false, 0);

        this.color_btn = new Gtk.ColorButton();
        this.color_btn.set_rgba(new Gdk.RGBA({red: 1, green: 0, blue: 0, alpha: 1}));
        this.color_btn.set_size_request(60, 30);
        this.color_btn.connect("color-set", () => this.choose_color());
        controls_box.pack_start(this.color_btn, false, false, 0);

        let size_label = new Gtk.Label({label: "Size:"});
        controls_box.pack_start(size_label, false, false, 0);

        this.size_value_label = new Gtk.Label({label: "10"});
        controls_box.pack_start(this.size_value_label, false, false, 0);

        this.size_scale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({value: 10, lower: 1, upper: 50, step_increment: 1})
        });
        this.size_scale.set_size_request(150, -1);
        this.size_scale.connect("value-changed", () => this.change_size());
        controls_box.pack_start(this.size_scale, false, false, 0);

        main_box.pack_start(controls_box, false, false, 0);

        this.window.add(main_box);
        this.window.show_all();
        this.window.connect("destroy", () => Gtk.main_quit());
    }

    on_draw(widget, cr) {
        Gdk.cairo_set_source_pixbuf(cr, this.pixbuf, 0, 0);
        cr.paint();

        // Draw strokes
        for (let stroke of this.strokes) {
            cr.setSourceRGB(...stroke.color);
            cr.setLineWidth(stroke.size);
            cr.setLineCap(cairo.LineCap.ROUND);
            cr.moveTo(stroke.x1, stroke.y1);
            cr.lineTo(stroke.x2, stroke.y2);
            cr.stroke();
        }
    }

    on_button_press(widget, event) {
        if (event.get_button()[1] === 1) {
            let [ok, x, y] = event.get_coords();
            if (ok) {
                this.drawing = true;
                this.last_x = x;
                this.last_y = y;
            }
        }
        return true;
    }

    on_motion_notify(widget, event) {
        if (this.drawing) {
            let [ok, x, y] = event.get_coords();
            if (ok) {
                this.strokes.push({
                    x1: this.last_x,
                    y1: this.last_y,
                    x2: x,
                    y2: y,
                    color: [...this.brush_color],
                    size: this.brush_size
                });
                this.last_x = x;
                this.last_y = y;
                this.drawing_area.queue_draw();
            }
        }
        return true;
    }

    on_button_release(widget, event) {
        if (event.get_button()[1] === 1) {
            this.drawing = false;
        }
        return true;
    }

    choose_color() {
        let rgba = this.color_btn.get_rgba();
        this.brush_color = [rgba.red, rgba.green, rgba.blue];
    }

    change_size() {
        this.brush_size = this.size_scale.get_value();
        this.size_value_label.set_text(this.brush_size.toString());
    }

    clear_drawings() {
        this.strokes = [];
        this.drawing_area.queue_draw();
    }

    upload_image() {
        console.log('Uploading image...');
        // Render strokes to pixbuf
        let surface = new cairo.ImageSurface(cairo.Format.ARGB32, this.pixbuf.get_width(), this.pixbuf.get_height());
        let cr = new cairo.Context(surface);
        Gdk.cairo_set_source_pixbuf(cr, this.pixbuf, 0, 0);
        cr.paint();

        for (let stroke of this.strokes) {
            cr.setSourceRGB(...stroke.color);
            cr.setLineWidth(stroke.size);
            cr.setLineCap(cairo.LineCap.ROUND);
            cr.moveTo(stroke.x1, stroke.y1);
            cr.lineTo(stroke.x2, stroke.y2);
            cr.stroke();
        }

        let final_pixbuf = Gdk.pixbuf_get_from_surface(surface, 0, 0, surface.getWidth(), surface.getHeight());

        let temp_path = '/tmp/kiru_screenshot.png';
        final_pixbuf.savev(temp_path, 'png', [], []);
        console.log('Saved to', temp_path);

        let api_key = this.options.api_key || 'YOUR_IMGBB_KEY';
        console.log('Using API key:', api_key.substring(0, 10) + '...');

        let cmd = `curl -s -X POST -F "key=${api_key}" -F "image=@${temp_path}" https://api.imgbb.com/1/upload`;
        console.log('Running command:', cmd.replace(api_key, '***'));

        let [success, stdout, stderr] = GLib.spawn_command_line_sync(cmd);
        console.log('Command success:', success);
        if (stderr && stderr.length > 0) {
            console.log('Stderr:', stderr);
        }
        if (success && stdout) {
            try {
                let decoder = new TextDecoder('utf-8');
                let text = decoder.decode(stdout);
                let data = JSON.parse(text);
                if (data.success) {
                    let link = data.data.url;
                    console.log('Uploaded link:', link);
                    if (this.options.copy_clipboard) {
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                    GLib.spawn_command_line_sync(`wl-copy "${link}"`);
                    console.log('Copied to clipboard');
                    return false;
                    });
                    }
                    if (this.options.auto_delete && this.options.file_path) {
                        let file = Gio.File.new_for_path(this.options.file_path);
                        file.delete(null);
                        console.log('Deleted file:', this.options.file_path);
                    }
                    let dialog = new Gtk.MessageDialog({
                        transient_for: this.window,
                        modal: true,
                        message_type: Gtk.MessageType.INFO,
                        buttons: Gtk.ButtonsType.OK,
                        text: `Uploaded: ${link}${this.options.copy_clipboard ? ' (copied to clipboard)' : ''}`
                    });
                    dialog.run();
                    dialog.destroy();
                    if (this.options.auto_upload) {
                        // Close window after auto upload
                        this.window.destroy();
                    }
                } else {
                    console.log('Upload failed:', data.error ? data.error.message : 'Unknown error');
                    let dialog = new Gtk.MessageDialog({
                        transient_for: this.window,
                        modal: true,
                        message_type: Gtk.MessageType.ERROR,
                        buttons: Gtk.ButtonsType.OK,
                        text: `Upload failed: ${data.error ? data.error.message : 'Unknown error'}`
                    });
                    dialog.run();
                    dialog.destroy();
                }
            } catch (e) {
                console.log('JSON parse error:', e, 'Output:', stdout);
                let dialog = new Gtk.MessageDialog({
                    transient_for: this.window,
                    modal: true,
                    message_type: Gtk.MessageType.ERROR,
                    buttons: Gtk.ButtonsType.OK,
                    text: "Upload failed: Invalid response"
                });
                dialog.run();
                dialog.destroy();
            }
        } else {
            console.log('Command failed');
            let dialog = new Gtk.MessageDialog({
                transient_for: this.window,
                modal: true,
                message_type: Gtk.MessageType.ERROR,
                buttons: Gtk.ButtonsType.OK,
                text: "Upload failed"
            });
            dialog.run();
            dialog.destroy();
        }
    }
}

class MainApp {
    constructor() {
        this.config_dir = GLib.get_home_dir() + '/.kiru';
        this.config_file = this.config_dir + '/conf.json';
        this.current_version = '1.0.0'; // Update this with actual version
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

    init_monitor() {
        this.update_monitor();
    }

    update_monitor() {
        if (this.monitor) {
            this.monitor.cancel();
        }
        this.screenshots_dir = this.config.folder || this.folder_entry.get_text();
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
        let update_btn = new Gtk.Button({label: "Check for Updates"});
        update_btn.connect("clicked", () => this.check_for_updates());
        box.pack_start(update_btn, false, false, 0);

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
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                        GLib.spawn_command_line_sync(`wl-copy "${link}"`);
                        console.log('Auto-uploaded and copied:', link);
                        return false;
                    });
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

Gtk.init(null);
new MainApp();
Gtk.main();
