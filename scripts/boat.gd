extends Node2D
## The player's riverboat. Steers in screen directions; the current carries it downstream.

const Gen = preload("res://scripts/river_gen.gd")

const ACCEL := 3.4
const DRAG := 1.0
const HULL := [Vector2(1.0, 0), Vector2(0.65, 0.36), Vector2(-0.7, 0.38), Vector2(-0.85, 0.25),
	Vector2(-0.85, -0.25), Vector2(-0.7, -0.38), Vector2(0.65, -0.36)]
const CABIN := [Vector2(0.05, 0.24), Vector2(-0.55, 0.24), Vector2(-0.55, -0.24), Vector2(0.05, -0.24)]

var world
var g := Vector2()
var vel := Vector2()
var heading := PI * 0.5
var docked := false
var dock_target := Vector2()
var t := 0.0
var smoke_timer := 0.0
var wake_timer := 0.0
var hull_color := Color("#c0453a")


func _input_dir() -> Vector2:
	var v := Vector2.ZERO
	if Input.is_physical_key_pressed(KEY_LEFT) or Input.is_physical_key_pressed(KEY_A):
		v.x -= 1
	if Input.is_physical_key_pressed(KEY_RIGHT) or Input.is_physical_key_pressed(KEY_D):
		v.x += 1
	if Input.is_physical_key_pressed(KEY_UP) or Input.is_physical_key_pressed(KEY_W):
		v.y -= 1
	if Input.is_physical_key_pressed(KEY_DOWN) or Input.is_physical_key_pressed(KEY_S):
		v.y += 1
	return v


func _process(delta: float) -> void:
	t += delta
	if docked:
		g = g.lerp(dock_target, 1.0 - exp(-3.0 * delta))
		vel = Vector2.ZERO
	else:
		var inp := _input_dir()
		var dir := Vector2.ZERO
		if inp != Vector2.ZERO:
			dir = Gen.iso_to_grid(inp).normalized()
		var flow: Vector2 = world.gen.flow_at(g)
		vel += dir * ACCEL * delta
		vel = vel.lerp(flow, 1.0 - exp(-DRAG * delta))
		var np := g + vel * delta
		if world.gen.boat_ok(Vector2(np.x, g.y)):
			g.x = np.x
		else:
			vel.x *= -0.3
		if world.gen.boat_ok(Vector2(g.x, np.y)):
			g.y = np.y
		else:
			vel.y *= -0.3
		if vel.length() > 0.3:
			heading = lerp_angle(heading, vel.angle(), 1.0 - exp(-4.0 * delta))
	var speed := vel.length()
	wake_timer -= delta
	if speed > 0.6 and wake_timer <= 0.0:
		wake_timer = 0.07
		var back := Vector2.from_angle(heading) * -0.8
		world.water_fx.add_wake(Gen.iso(g + back), Gen.iso(Vector2.from_angle(heading + PI * 0.5)).normalized())
	smoke_timer -= delta
	if smoke_timer <= 0.0:
		smoke_timer = 0.25 if speed > 1.0 else 0.6
		world.sky_fx.add_smoke(position + _proj(Vector2(-0.35, 0)) + Vector2(0, -16))
	position = Gen.iso(g).round()
	queue_redraw()


func _proj(v: Vector2) -> Vector2:
	return Gen.iso(v.rotated(heading))


func _shape(pts: Array, lift: float, scale_ := 1.0) -> PackedVector2Array:
	var out := PackedVector2Array()
	for p in pts:
		out.append((_proj(p * scale_) + Vector2(0, -lift)).round())
	return out


func _stack(pts: Array, from: float, to: float, side: Color, top: Color, band := -1.0, band_c := Color.WHITE) -> void:
	var h := from
	while h < to:
		draw_colored_polygon(_shape(pts, h), band_c if absf(h - band) < 0.5 else side)
		h += 1.0
	draw_colored_polygon(_shape(pts, to), top)


func _draw() -> void:
	var bob := roundf(sin(t * 2.2) * 0.6)
	draw_set_transform(Vector2(0, bob))
	draw_colored_polygon(_shape(HULL, -1, 1.15), Color(0.1, 0.25, 0.4, 0.35))
	_stack(HULL, 0, 4, hull_color.darkened(0.25), Color("#d9b47a"), 2, Color("#f2f2f2"))
	draw_polyline(_shape(HULL + [HULL[0]], 4), hull_color)
	_stack(CABIN, 4, 10, Color("#2e5a7a"), Color("#f2ead8"), 7, Color("#9ad0f0"))
	draw_colored_polygon(_shape(CABIN, 11, 1.15), Color("#4f6f8f"))
	var chim := [Vector2(-0.28, 0.08), Vector2(-0.42, 0.08), Vector2(-0.42, -0.08), Vector2(-0.28, -0.08)]
	_stack(chim, 11, 16, Color("#303030"), Color("#202020"), 14, Color("#c0453a"))
	var jobs: Array = world.jobs
	var crates := 0
	var pax := 0
	for j in jobs:
		if j.kind == "goods":
			var c := Vector2(0.45 - (crates % 2) * 0.22, -0.12 + (crates / 2) * 0.24)
			var sq := [c + Vector2(0.09, 0.09), c + Vector2(-0.09, 0.09), c + Vector2(-0.09, -0.09), c + Vector2(0.09, -0.09)]
			_stack(sq, 4, 7, Color("#9a6a30"), Color("#c9a060"))
			crates += 1
		else:
			var p := _proj(Vector2(-0.72, -0.2 + pax * 0.14)) + Vector2(0, -4)
			var col: Color = j.color
			draw_rect(Rect2(p.x - 1, p.y - 4, 2, 3), col)
			draw_rect(Rect2(p.x - 1, p.y - 6, 2, 2), Color("#f5d0b0"))
			pax += 1
	var fp := _proj(Vector2(-0.82, 0)) + Vector2(0, -4)
	draw_line(fp, fp + Vector2(0, -8), Color("#dddddd"))
	var wv := sin(t * 5.0)
	draw_colored_polygon(PackedVector2Array([fp + Vector2(0, -8), fp + Vector2(5, -7 + wv), fp + Vector2(0, -5)]), Color("#f2c14e"))
