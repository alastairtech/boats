extends Node2D
## Draws a band of terrain rows once (cached by the renderer).

const Gen = preload("res://scripts/river_gen.gd")
const T = Gen.T

const COLORS := {
	T.DEEP: Color("#2f6f9f"), T.WATER: Color("#3f8fc0"), T.SHALLOW: Color("#6ab4d0"),
	T.SAND: Color("#dcc690"), T.GRASS: Color("#74b04c"), T.FOREST: Color("#4f8a3a"),
	T.FIELD: Color("#c9b45a"), T.TOWN: Color("#bdae94"), T.DOCK: Color("#9a6a3a"),
}
const CROPS := [[Color("#d9bf5a"), Color("#b89a3a")], [Color("#8fbf4a"), Color("#6a9a3a")],
	[Color("#9a7fc9"), Color("#6a8a4a")], [Color("#8a6a4a"), Color("#6a4f35")], [Color("#e8c83a"), Color("#5a8a3a")]]

var gen
var y0 := 0
var y1 := 0


func _quad(pts: PackedVector2Array, c: Color) -> void:
	draw_primitive(pts, PackedColorArray([c, c, c, c]), PackedVector2Array())


func _draw() -> void:
	for y in range(y0, y1):
		for x in Gen.W:
			var t: int = gen.tiles[y * Gen.W + x]
			var r: int = gen.detail[y * Gen.W + x]
			var top := Gen.iso(Vector2(x, y))
			var rt := Gen.iso(Vector2(x + 1, y))
			var bot := Gen.iso(Vector2(x + 1, y + 1))
			var lf := Gen.iso(Vector2(x, y + 1))
			var ctr := (top + bot) * 0.5
			var c: Color = COLORS[t]
			if t == T.FIELD:
				var crop: Array = CROPS[(int(x / 3) * 7 + int(y / 3) * 13) % CROPS.size()]
				_quad(PackedVector2Array([top, rt, bot, lf]), crop[0])
				for i in range(1, 4):
					var f := i / 4.0
					draw_line(top.lerp(lf, f), rt.lerp(bot, f), crop[1])
				continue
			c = c.darkened((r % 4) * 0.025)
			_quad(PackedVector2Array([top, rt, bot, lf]), c)
			var ox := float((r >> 2) % 9 - 4)
			var oy := float((r >> 5) % 4 - 2)
			match t:
				T.GRASS:
					if r % 3 == 0:
						draw_rect(Rect2(ctr.x + ox, ctr.y + oy - 1, 1, 2), c.darkened(0.2))
					if r % 29 == 0:
						draw_rect(Rect2(ctr.x - ox, ctr.y - oy, 1, 1), Color("#f2e04e"))
				T.FOREST:
					if r % 2 == 0:
						draw_rect(Rect2(ctr.x + ox, ctr.y + oy, 2, 1), c.darkened(0.2))
				T.SAND:
					if r % 3 == 0:
						draw_rect(Rect2(ctr.x + ox, ctr.y + oy, 1, 1), c.darkened(0.25))
				T.WATER, T.DEEP:
					if r % 6 == 0:
						draw_rect(Rect2(ctr.x + ox, ctr.y + oy, 3, 1), c.lightened(0.15))
				T.SHALLOW:
					if r % 7 == 0:
						draw_rect(Rect2(ctr.x + ox - 1, ctr.y + oy, 4, 2), Color("#4f9a4a"))
						if r % 2 == 0:
							draw_rect(Rect2(ctr.x + ox, ctr.y + oy, 1, 1), Color("#f2a0c0"))
					elif r % 5 == 0:
						draw_rect(Rect2(ctr.x + ox, ctr.y + oy, 2, 1), c.lightened(0.2))
				T.TOWN:
					for i in 3:
						var rr := (r >> i) % 11
						draw_rect(Rect2(ctr.x + rr - 5, ctr.y + (rr * 3) % 5 - 2, 2, 1), c.darkened(0.12))
				T.DOCK:
					draw_line(top.lerp(lf, 0.33), rt.lerp(bot, 0.33), c.darkened(0.3))
					draw_line(top.lerp(lf, 0.66), rt.lerp(bot, 0.66), c.darkened(0.3))
	# Bank faces: land tiles that drop into water on the camera-facing edges.
	for y in range(y0, y1):
		for x in Gen.W:
			var t: int = gen.tiles[y * Gen.W + x]
			if t <= T.SHALLOW:
				continue
			var face := Color("#a8895a") if t == T.SAND else Color("#6b4a2b")
			var h := 3.0
			if t == T.DOCK:
				face = Color("#5a3a1a")
				h = 2.0
			if gen.is_water(x, y + 1):
				var a := Gen.iso(Vector2(x, y + 1))
				var b := Gen.iso(Vector2(x + 1, y + 1))
				_quad(PackedVector2Array([a, b, b + Vector2(0, h), a + Vector2(0, h)]), face)
			if gen.is_water(x + 1, y):
				var a := Gen.iso(Vector2(x + 1, y))
				var b := Gen.iso(Vector2(x + 1, y + 1))
				_quad(PackedVector2Array([a, b, b + Vector2(0, h), a + Vector2(0, h)]), face.darkened(0.15))
