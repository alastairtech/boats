extends Node2D
## A static scenery object (tree, house, landmark...). Origin is the base of the object.

const TRUNK := Color("#6b4a2b")
const STONE := Color("#9a9a9a")
const WINDOW := Color("#f7e08a")
const SHADOW := Color(0, 0, 0, 0.18)

var d: Dictionary
var t := 0.0


func _ready() -> void:
	t = randf() * 10.0
	var animated: bool = d.k in ["windmill", "lighthouse", "campfire", "flag", "reeds", "crane"]
	set_process(animated)


func _process(delta: float) -> void:
	t += delta
	queue_redraw()


func px(x: float, y: float, w: float, h: float, c: Color) -> void:
	draw_rect(Rect2(roundf(x), roundf(y), w, h), c)


func ellipse(c: Vector2, rx: float, ry: float, col: Color) -> void:
	var pts := PackedVector2Array()
	for i in 12:
		var a := TAU * i / 12.0
		pts.append(c + Vector2(cos(a) * rx, sin(a) * ry))
	draw_colored_polygon(pts, col)


func poly(pts: Array, c: Color) -> void:
	draw_colored_polygon(PackedVector2Array(pts), c)


## An isometric box with base centred at o.
func box(o: Vector2, a: float, h: float, wall: Color, top := true) -> void:
	var L := o + Vector2(-a, 0)
	var F := o + Vector2(0, a * 0.5)
	var R := o + Vector2(a, 0)
	var B := o + Vector2(0, -a * 0.5)
	var up := Vector2(0, -h)
	poly([L, F, F + up, L + up], wall.darkened(0.18))
	poly([F, R, R + up, F + up], wall)
	if top:
		poly([L + up, F + up, R + up, B + up], wall.lightened(0.15))


func pyramid(o: Vector2, a: float, h: float, r: float, roof: Color) -> void:
	var up := Vector2(0, -h)
	var apex := o + up + Vector2(0, -r)
	poly([o + Vector2(-a - 1, 0) + up, o + Vector2(0, a * 0.5 + 1) + up, apex], roof.darkened(0.15))
	poly([o + Vector2(0, a * 0.5 + 1) + up, o + Vector2(a + 1, 0) + up, apex], roof)


func house(o: Vector2, a: float, h: float, wall: Color, roof: Color, chim: bool, windows := true) -> void:
	var L := o + Vector2(-a, 0)
	var F := o + Vector2(0, a * 0.5)
	var R := o + Vector2(a, 0)
	var B := o + Vector2(0, -a * 0.5)
	var up := Vector2(0, -h)
	var r := a * 0.7 + 2.0
	var P1 := (L + B) * 0.5 + up + Vector2(0, -r)
	var P2 := (F + R) * 0.5 + up + Vector2(0, -r)
	ellipse(o + Vector2(0, 1), a + 2, a * 0.5 + 1, SHADOW)
	poly([L, F, F + up, L + up], wall.darkened(0.18))
	poly([F, R, R + up, F + up], wall)
	poly([P1, P2, R + up, B + up], roof.darkened(0.35))
	poly([F + up, R + up, P2], wall.lightened(0.05))
	if chim:
		var c := P1.lerp(P2, 0.25) + Vector2(2, 2)
		px(c.x, c.y - 5, 2, 5, Color("#8a4a3a"))
	poly([L + up + Vector2(-1, 1), F + up + Vector2(0, 2), P2, P1], roof)
	draw_line(P1, P2, roof.lightened(0.25))
	if windows:
		for i in 2:
			var p := L.lerp(F, 0.3 + 0.4 * i) + Vector2(0, -h * 0.6)
			px(p.x - 1, p.y - 1, 2, 2, WINDOW)
		var dp := F.lerp(R, 0.35)
		px(dp.x - 1, dp.y - 5, 2, 4, Color("#5a3a2a"))
		var wp := F.lerp(R, 0.75) + Vector2(0, -h * 0.6)
		px(wp.x - 1, wp.y - 1, 2, 2, WINDOW)


func _draw() -> void:
	match d.k:
		"tree":
			var s: float = d.get("s", 1.0)
			var c: Color = d.get("c", Color("#5f9e40"))
			ellipse(Vector2(0, 0), 5 * s, 2 * s, SHADOW)
			px(-1, -5 * s, 2, 5 * s, TRUNK)
			draw_circle(Vector2(0, -9 * s), 5 * s, c.darkened(0.25))
			draw_circle(Vector2(-1, -10 * s), 4 * s, c)
			draw_circle(Vector2(-2, -11 * s), 1.6 * s, c.lightened(0.2))
		"fruit_tree":
			var c: Color = d.c
			ellipse(Vector2.ZERO, 4, 2, SHADOW)
			px(-1, -4, 2, 4, TRUNK)
			draw_circle(Vector2(0, -7), 4, Color("#4f8f3a"))
			draw_circle(Vector2(-1, -8), 3, Color("#62a845"))
			for p in [Vector2(-2, -8), Vector2(1, -6), Vector2(2, -9), Vector2(-1, -5)]:
				px(p.x, p.y, 1, 1, c)
		"pine":
			var s: float = d.get("s", 1.0)
			var c: Color = d.get("c", Color("#3f7a4a"))
			ellipse(Vector2.ZERO, 4 * s, 2 * s, SHADOW)
			px(-1, -3, 2, 3, TRUNK)
			for i in 3:
				var base := -3.0 - i * 4.0 * s
				var hw := (5.0 - i) * s
				var top := base - 7.0 * s
				poly([Vector2(-hw, base), Vector2(hw, base), Vector2(0, top)], c.darkened(0.15))
				poly([Vector2(0, base), Vector2(hw, base), Vector2(0, top)], c)
		"birch":
			var s: float = d.get("s", 1.0)
			ellipse(Vector2.ZERO, 4, 2, SHADOW)
			px(0, -9 * s, 2, 9 * s, Color("#eeeeea"))
			px(0, -4 * s, 1, 1, Color("#333333"))
			px(1, -7 * s, 1, 1, Color("#333333"))
			draw_circle(Vector2(1, -11 * s), 3.5 * s, Color("#9ac44a"))
			draw_circle(Vector2(0, -12 * s), 2.2 * s, Color("#b8d860"))
		"bush":
			ellipse(Vector2.ZERO, 4, 1.5, SHADOW)
			draw_circle(Vector2(-1, -2), 2.5, Color("#4f8f3a"))
			draw_circle(Vector2(1, -2.5), 2.5, Color("#5fa045"))
			if int(d.g.x * 10) % 3 == 0:
				px(0, -4, 1, 1, Color("#e05050"))
		"flowers":
			var c: Color = d.c
			for i in 4:
				var o := Vector2((i * 5) % 7 - 3, (i * 3) % 4 - 2)
				px(o.x, o.y, 1, 1, Color("#3f7a3a"))
				px(o.x, o.y - 1, 1, 1, c)
		"flowerbed":
			var c: Color = d.get("c", Color("#e87fb0"))
			box(Vector2.ZERO, 3, 1, Color("#7a5a3a"))
			for i in 4:
				px(-2 + i, -2 - (i % 2), 1, 1, c)
		"mushroom":
			px(0, -2, 1, 2, Color("#f2eadc"))
			px(-1, -3, 3, 1, Color("#d94040"))
			px(0, -3, 1, 1, Color("#ffffff"))
		"rock":
			ellipse(Vector2(0, 0), 3, 1, SHADOW)
			poly([Vector2(-3, 0), Vector2(-2, -3), Vector2(1, -4), Vector2(3, -1), Vector2(2, 0)], STONE)
			px(-1, -3, 2, 1, STONE.lightened(0.3))
		"log":
			px(-4, -2, 8, 2, Color("#7a5530"))
			px(3, -2, 1, 2, Color("#c9a070"))
		"reeds":
			var sway := sin(t * 1.5 + d.g.x) * 0.8
			for i in 4:
				var x := -2.0 + i * 1.3
				var tip := Vector2(x + sway, -5.0 - (i % 2) * 2)
				draw_line(Vector2(x, 0), tip, Color("#5f8f3a"))
				if i % 2 == 0:
					px(tip.x, tip.y, 1, 2, Color("#6b4a2b"))
		"haybale":
			ellipse(Vector2.ZERO, 4, 1.5, SHADOW)
			draw_circle(Vector2(0, -3), 3, Color("#d9b84a"))
			draw_arc(Vector2(0, -3), 1.5, 0, TAU, 8, Color("#b8983a"))
		"scarecrow":
			px(0, -10, 1, 10, TRUNK)
			px(-3, -8, 7, 1, TRUNK)
			px(-1, -8, 3, 4, Color("#4f7fd9"))
			px(-1, -11, 3, 2, Color("#e8c890"))
			px(-2, -12, 5, 1, Color("#8a6a3a"))
		"house", "hut":
			house(Vector2.ZERO, d.get("a", 6.0), d.get("h", 8.0), d.wall, d.roof, d.get("chim", false))
		"warehouse":
			house(Vector2.ZERO, 7.5, 10, Color("#a07050"), Color("#6a4f3a"), false)
		"church":
			var wall: Color = Color("#e8e0d0")
			box(Vector2(-3, -2), 3, 18, wall)
			pyramid(Vector2(-3, -2), 3, 18, 9, Color("#4f6380"))
			px(-4, -14, 2, 3, Color("#5a5a7a"))
			house(Vector2(2, 1), 6, 9, wall, d.roof, false)
		"tower":
			box(Vector2.ZERO, 4, 20, Color("#c9b89a"))
			pyramid(Vector2.ZERO, 4, 20, 6, d.roof)
			draw_circle(Vector2(2, -15), 2, Color("#f2f2f2"))
			px(2, -16, 1, 2, Color("#333333"))
		"well":
			ellipse(Vector2.ZERO, 5, 2, SHADOW)
			box(Vector2.ZERO, 3, 3, STONE)
			px(-1, -4, 2, 1, Color("#3f6f9f"))
			px(-3, -10, 1, 7, TRUNK)
			px(3, -10, 1, 7, TRUNK)
			poly([Vector2(-5, -9), Vector2(5, -9), Vector2(0, -13)], d.roof)
		"shrine":
			box(Vector2.ZERO, 4, 6, d.wall)
			pyramid(Vector2.ZERO, 4, 6, 6, d.roof)
			px(0, -4, 1, 2, WINDOW)
		"ruin":
			box(Vector2(-2, 0), 3, 12, STONE.darkened(0.1), false)
			poly([Vector2(-5, -12), Vector2(-2, -10.5), Vector2(1, -12), Vector2(1, -14), Vector2(-3, -16), Vector2(-5, -13)], STONE.lightened(0.1))
			box(Vector2(4, 1), 2, 4, STONE.darkened(0.2))
			px(-4, -7, 1, 4, Color("#4f8a3a"))
		"stall":
			var c: Color = d.c
			box(Vector2.ZERO, 4, 3, Color("#8a6a3a"))
			for p in [Vector2(-4, 0), Vector2(4, 0), Vector2(0, 2)]:
				px(p.x, p.y - 9, 1, 9, TRUNK)
			var up := Vector2(0, -9)
			poly([Vector2(-5, 0) + up, Vector2(0, 2.5) + up, Vector2(5, 0) + up, Vector2(0, -2.5) + up], c)
			draw_line(Vector2(-2.5, 1.25) + up, Vector2(2.5, -1.25) + up, Color.WHITE)
			for i in 4:
				px(-2 + i, -4, 1, 1, [Color("#e04040"), Color("#f2c14e"), Color("#5fae5f"), Color("#f28c3c")][i])
		"crate":
			box(Vector2.ZERO, 2.5, 4, Color("#b08040"))
		"barrel":
			px(-2, -5, 4, 5, Color("#8a5a30"))
			px(-2, -4, 4, 1, Color("#555555"))
			px(-2, -2, 4, 1, Color("#555555"))
		"lamp":
			px(0, -10, 1, 10, Color("#333340"))
			px(-1, -12, 3, 2, WINDOW)
			draw_circle(Vector2(0.5, -11), 4, Color(1, 0.9, 0.5, 0.12))
		"bench":
			px(-3, -3, 6, 1, Color("#8a5a30"))
			px(-3, -2, 1, 2, Color("#5a3a20"))
			px(2, -2, 1, 2, Color("#5a3a20"))
		"flag":
			var c: Color = d.get("c", Color("#e85050"))
			px(0, -16, 1, 16, Color("#dddddd"))
			var wv := sin(t * 4.0) * 1.0
			poly([Vector2(1, -16), Vector2(7, -14 + wv), Vector2(1, -12)], c)
		"windmill":
			box(Vector2.ZERO, 4, 16, Color("#efe6d6"))
			pyramid(Vector2.ZERO, 4, 16, 6, Color("#8b3a3a"))
			px(-1, -4, 2, 4, Color("#5a3a2a"))
			var hub := Vector2(-2, -15)
			for i in 4:
				var a := t * 1.2 + i * PI * 0.5
				var dir := Vector2(cos(a), sin(a))
				var perp := Vector2(-dir.y, dir.x)
				draw_line(hub, hub + dir * 11, TRUNK)
				poly([hub + dir * 3, hub + dir * 11, hub + dir * 11 + perp * 3, hub + dir * 3 + perp * 3], Color("#f2ead8"))
			px(hub.x - 1, hub.y - 1, 2, 2, Color("#333333"))
		"lighthouse":
			ellipse(Vector2.ZERO, 7, 3, SHADOW)
			for i in 7:
				box(Vector2(0, -i * 4), 4 - i * 0.15, 4, Color("#d94040") if i % 2 == 0 else Color("#f7f3ea"), i == 6)
			box(Vector2(0, -28), 3, 4, Color("#333340"))
			var glow := 0.5 + 0.5 * sin(t * 2.0)
			px(-2, -31, 4, 2, Color(1, 0.95, 0.5))
			draw_circle(Vector2(0, -30), 8, Color(1, 0.9, 0.4, 0.15 + glow * 0.2))
			pyramid(Vector2(0, -28), 3, 4, 4, Color("#333340"))
		"crane":
			px(0, -24, 2, 24, Color("#7a5530"))
			var a := sin(t * 0.3) * 0.4
			var arm := Vector2(cos(a), sin(a) * 0.5) * 14
			draw_line(Vector2(1, -23), Vector2(1, -23) + arm, Color("#7a5530"), 2)
			var hook := Vector2(1, -23) + arm
			draw_line(hook, hook + Vector2(0, 10), Color("#333333"))
			box(hook + Vector2(0, 14), 2, 3, Color("#b08040"))
		"blanket":
			poly([Vector2(-7, 0), Vector2(0, 3.5), Vector2(7, 0), Vector2(0, -3.5)], Color("#d94f4f"))
			draw_line(Vector2(-3.5, 1.75), Vector2(3.5, -1.75), Color.WHITE)
			draw_line(Vector2(-3.5, -1.75), Vector2(3.5, 1.75), Color.WHITE)
			px(2, -1, 3, 2, Color("#c9a050"))
			px(-3, -2, 1, 1, Color("#e04040"))
		"tent":
			var c: Color = d.c
			ellipse(Vector2.ZERO, 7, 3, SHADOW)
			poly([Vector2(-6, 0), Vector2(0, 3), Vector2(0, -7), Vector2(-4, -8)], c.darkened(0.2))
			poly([Vector2(0, 3), Vector2(6, 0), Vector2(2, -9), Vector2(0, -7)], c)
			poly([Vector2(0, 3), Vector2(2, 2), Vector2(1, -4)], Color("#3a2a1a"))
		"campfire":
			for p in [Vector2(-3, 0), Vector2(1, -1)]:
				px(p.x, p.y, 3, 1, TRUNK)
			var f := int(t * 8.0)
			draw_circle(Vector2(0, -2), 7, Color(1, 0.6, 0.2, 0.12))
			px(-1, -3 - f % 2, 2, 3 + f % 2, Color("#f28c3c"))
			px(0, -5 - (f / 2) % 2, 1, 2, Color("#f2e04e"))
		"standing_stone":
			ellipse(Vector2.ZERO, 3, 1, SHADOW)
			box(Vector2.ZERO, 2, 9, Color("#8a8a90"))
		"beehive":
			box(Vector2.ZERO, 2.5, 3, Color("#f2f2e8"))
			box(Vector2(0, -3), 2.5, 3, Color("#f2c14e"))
			pyramid(Vector2(0, -3), 2.5, 3, 2, Color("#8a6a3a"))
