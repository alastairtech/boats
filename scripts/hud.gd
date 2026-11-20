extends Control
## On-screen interface drawn at full window resolution over the pixel-art world.

var world
var settings := LabelSettings.new()
var small := LabelSettings.new()
var title_settings := LabelSettings.new()
var coins_label: Label
var cargo_label: Label
var next_label: Label
var prompt_label: Label
var msg_label: Label
var help_label: Label
var banner: Label
var dock_panel: PanelContainer
var dock_text: RichTextLabel
var route_bar: Control
var msg_time := 0.0
var banner_time := 0.0


class RouteBar extends Control:
	var world

	func _process(_d: float) -> void:
		queue_redraw()

	func _draw() -> void:
		if world == null or world.gen == null:
			return
		var w := size.x
		var y := size.y * 0.5
		var L: float = world.gen.L
		draw_line(Vector2(0, y), Vector2(w, y), Color(0.25, 0.55, 0.8, 0.9), 6)
		for i in world.gen.towns.size():
			var town: Dictionary = world.gen.towns[i]
			var x: float = town.ty / L * w
			var col := Color("#f2c14e")
			for j in world.jobs:
				if j.dest == i:
					col = Color("#e85050")
			if town.harbour:
				col = Color("#ffffff")
			draw_circle(Vector2(x, y), 7, Color(0.1, 0.1, 0.15))
			draw_circle(Vector2(x, y), 5, col)
		var bx: float = world.boat.g.y / L * w
		draw_colored_polygon(PackedVector2Array([Vector2(bx - 7, y - 16), Vector2(bx + 7, y - 16), Vector2(bx, y - 6)]), Color("#ffffff"))


func _make_label(ls: LabelSettings) -> Label:
	var l := Label.new()
	l.label_settings = ls
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(l)
	return l


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	for ls in [settings, small, title_settings]:
		ls.outline_color = Color(0.08, 0.1, 0.15)
		ls.font_color = Color("#fff8e8")
	settings.font_size = 22
	settings.outline_size = 7
	small.font_size = 16
	small.outline_size = 5
	title_settings.font_size = 44
	title_settings.outline_size = 12

	coins_label = _make_label(settings)
	coins_label.position = Vector2(18, 12)
	cargo_label = _make_label(small)
	cargo_label.position = Vector2(18, 46)

	next_label = _make_label(settings)
	next_label.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	next_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	next_label.offset_left = -700
	next_label.offset_right = -18
	next_label.offset_top = 12

	prompt_label = _make_label(settings)
	prompt_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt_label.offset_left = -400
	prompt_label.offset_right = 400
	prompt_label.offset_top = -110
	prompt_label.offset_bottom = -80

	msg_label = _make_label(settings)
	msg_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	msg_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	msg_label.offset_left = -500
	msg_label.offset_right = 500
	msg_label.offset_top = 70

	banner = _make_label(title_settings)
	banner.set_anchors_preset(Control.PRESET_CENTER)
	banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	banner.offset_left = -600
	banner.offset_right = 600
	banner.offset_top = -330
	banner.offset_bottom = -250

	help_label = _make_label(small)
	help_label.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	help_label.offset_top = -30
	help_label.offset_left = 18
	help_label.text = "WASD / Arrows: steer    E: dock / cast off    1-3: take job    U: upgrade hold (harbour)    N: new river"

	route_bar = RouteBar.new()
	route_bar.world = world
	route_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	route_bar.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	route_bar.offset_left = -360
	route_bar.offset_right = 360
	route_bar.offset_top = -64
	route_bar.offset_bottom = -36
	add_child(route_bar)

	dock_panel = PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.13, 0.17, 0.22, 0.92)
	sb.border_color = Color("#d9b47a")
	sb.set_border_width_all(3)
	sb.set_corner_radius_all(10)
	sb.set_content_margin_all(22)
	dock_panel.add_theme_stylebox_override("panel", sb)
	dock_panel.set_anchors_preset(Control.PRESET_CENTER)
	dock_panel.offset_left = -400
	dock_panel.offset_right = 400
	dock_panel.offset_top = -170
	dock_panel.offset_bottom = -100
	dock_panel.grow_vertical = Control.GROW_DIRECTION_BOTH
	dock_text = RichTextLabel.new()
	dock_text.bbcode_enabled = true
	dock_text.fit_content = true
	dock_text.scroll_active = false
	dock_text.add_theme_font_size_override("normal_font_size", 19)
	dock_text.add_theme_font_size_override("bold_font_size", 26)
	dock_panel.add_child(dock_text)
	dock_panel.visible = false
	add_child(dock_panel)


func show_message(text: String, dur := 3.0) -> void:
	msg_label.text = text
	msg_time = dur


func show_banner(text: String, dur := 4.0) -> void:
	banner.text = text
	banner_time = dur


func set_prompt(text: String) -> void:
	prompt_label.text = text


func show_dock(bbcode: String) -> void:
	dock_text.text = bbcode
	dock_panel.visible = true


func hide_dock() -> void:
	dock_panel.visible = false


func _process(delta: float) -> void:
	msg_time -= delta
	msg_label.modulate.a = clampf(msg_time, 0.0, 1.0)
	banner_time -= delta
	banner.modulate.a = clampf(banner_time, 0.0, 1.0)
	if world == null or world.gen == null:
		return
	coins_label.text = "Coins: %d     %s" % [world.coins, world.gen.river_name]
	var lines := ["Hold %d/%d" % [world.jobs.size(), world.capacity]]
	for j in world.jobs:
		lines.append("  %s  ->  %s  (+%d)" % [j.label, world.gen.towns[j.dest].name, j.reward])
	cargo_label.text = "\n".join(lines)
	var nxt: int = world.next_town_index()
	if nxt >= 0:
		var town: Dictionary = world.gen.towns[nxt]
		var dist := int(town.ty - world.boat.g.y)
		next_label.text = "Next: %s  (%d)" % [town.name, maxi(dist, 0)]
	else:
		next_label.text = "Out to sea!"
