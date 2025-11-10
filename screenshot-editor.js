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
            this.drawing = true;
            [this.last_x, this.last_y] = event.get_coords();
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
                        let clip_cmd = `echo "${link}" | wl-copy`;
                        GLib.spawn_command_line_sync(clip_cmd);
                        console.log('Copied to clipboard');
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
