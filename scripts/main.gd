extends Control
## Root: renders the world into a low-resolution SubViewport for crisp pixels, with the HUD on top.

const World = preload("res://scripts/world.gd")
const Hud = preload("res://scripts/hud.gd")
const PIXEL_SCALE := 3


func _ready() -> void:
	var container := SubViewportContainer.new()
	container.stretch = true
	container.stretch_shrink = PIXEL_SCALE
	container.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	container.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(container)
	var vp := SubViewport.new()
	vp.snap_2d_transforms_to_pixel = true
	vp.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
	container.add_child(vp)
	var world := World.new()
	var hud := Hud.new()
	hud.world = world
	world.hud = hud
	vp.add_child(world)
	add_child(hud)
	world.start_route(randi())


# Dev helper: `godot -- --shot=/path/prefix` saves screenshots then quits.
func _process(_d: float) -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shot="):
			var f := Engine.get_process_frames()
			if f in [120, 600, 1200]:
				get_viewport().get_texture().get_image().save_png("%s_%d.png" % [a.substr(7), f])
			if f > 1200:
				get_tree().quit()
