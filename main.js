#!/usr/bin/env gjs

imports.gi.versions.Gtk = '3.0';
const {Gtk, Gdk, GdkPixbuf, Gio, GLib, Soup} = imports.gi;
const cairo = imports.cairo;

// Import modules
import('./screenshot-editor.js');
import('./main-app.js');

Gtk.init(null);
new MainApp();
Gtk.main();
