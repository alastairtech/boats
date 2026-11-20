extends Node2D
## Animals and people that wander, flee from the boat, follow a leader, or wave.

const Gen = preload("res://scripts/river_gen.gd")

const SPEEDS := {"duck": 0.7, "duckling": 1.6, "swan": 0.4, "heron": 0.3, "person": 0.8, "kid": 1.1,
	"deer": 1.0, "sheep": 0.3, "cow": 0.25, "goat": 0.4, "rabbit": 1.6, "fox": 1.0, "hedgehog": 0.3,
	"butterfly": 1.0, "rowboat": 0.5, "otter": 1.2, "cat": 0.6, "dog": 1.2, "hen": 0.5, "gull": 2.0, "fisher": 0.0}
const SKITTISH := ["duck", "swan", "heron", "deer", "rabbit", "fox", "otter", "hen"]
const WAVERS := ["person", "kid", "fisher", "rowboat"]

var d: Dictionary
var world
var g := Vector2()
var target := Vector2()
var wait := 0.0
var t := 0.0
var facing := 1.0
var moving := false
var waving := false
var fleeing := false
var dive := 0.0


func _ready() -> void:
	g = d.g
	target = g
	t = randf() * 10.0
	wait = randf() * 3.0
	if d.has("face"):
		facing = d.face
	position = Gen.iso(g).round()


func _speed() -> float:
	return SPEEDS.get(d.k, 0.5)


func _process(delta: float) -> void:
	var bp: Vector2 = world.boat.g
	if absf(bp.y - g.y) > 28.0 or absf(bp.x - g.x) > 40.0:
		return
	t += delta
	var away := g - bp
	var bd := away.length()
	var spd := _speed()
	moving = false
	fleeing = false
	if d.get("still", false) or spd == 0.0:
		pass
	elif d.leader >= 0:
		var lead = world.critter_nodes[d.leader]
		var slot: int = d.get("slot", 0)
		var behind: Vector2 = Vector2(-0.35 * (slot + 1), 0.25 * ((slot % 2) * 2 - 1)).rotated(lead.target.angle_to_point(lead.g) + PI)
		target = lead.g + behind
		_move(delta, spd * clampf((target - g).length() * 2.0, 0.0, 1.5))
	else:
		if d.k in SKITTISH and bd < 3.0:
			target = g + away.normalized() * 2.5
			fleeing = true
			wait = 0.0
			if d.k == "otter":
				dive = 1.5
		if wait > 0.0:
			wait -= delta
		elif (target - g).length() < 0.08:
			wait = randf_range(1.0, 4.0)
			var cand: Vector2 = d.home + Vector2(randf_range(-1, 1), randf_range(-1, 1)) * d.radius
			if world.gen.zone_ok(d.zone, cand):
				target = cand
		else:
			_move(delta, spd * (2.5 if fleeing else 1.0))
	dive = maxf(dive - delta, 0.0)
	waving = d.k in WAVERS and bd < 6.0 and not moving
	if waving:
		facing = signf(Gen.iso(bp).x - Gen.iso(g).x + 0.01)
	position = Gen.iso(g).round()
	queue_redraw()


func _move(delta: float, spd: float) -> void:
	var to := target - g
	if to.length() < 0.02:
		return
	var step := to.normalized() * minf(spd * delta, to.length())
	var np := g + step
	if world.gen.zone_ok(d.zone, np) or d.leader >= 0:
		g = np
		moving = true
		var sx := Gen.iso(step).x
		if absf(sx) > 0.001:
			facing = signf(sx)
	else:
		target = g


func px(x: float, y: float, w: float, h: float, c: Color) -> void:
	draw_rect(Rect2(x, y, w, h), c)


func _person(scale_: float, off := Vector2.ZERO) -> void:
	var shirt: Color = d.get("shirt", Color.RED)
	var skin: Color = d.get("skin", Color("#f5d0b0"))
	var hair: Color = d.get("hair", Color("#3a2a1a"))
	var pants: Color = d.get("pants", Color("#3a3a5a"))
	draw_set_transform(off, 0, Vector2(facing * scale_, scale_))
	px(-2, -1, 5, 1, Color(0, 0, 0, 0.2))
	if d.get("sitting", false):
		px(-1, -2, 4, 2, pants)
		px(-1, -5, 3, 3, shirt)
		px(-1, -7, 3, 2, skin)
		px(-1, -8, 3, 1, hair)
		px(2, -4, 1, 1, skin)
		return
	var step := int(t * 8.0) % 2 if moving else 0
	px(-1, -3 + step, 1, 3 - step, pants)
	px(1, -3 + (1 - step) * int(moving), 1, 3 - (1 - step) * int(moving), pants)
	px(-1, -6, 3, 3, shirt)
	px(-1, -8, 3, 2, skin)
	px(-1, -9, 3, 1, hair)
	px(-2, -8, 1, 2, hair)
	if waving:
		var up := int(t * 6.0) % 2
		px(2, -9 - up, 1, 3, skin)
	else:
		px(2, -6, 1, 2, skin)
	px(-2, -6, 1, 2, shirt.darkened(0.2))


func _draw() -> void:
	var bob := roundf(sin(t * 3.0) * 0.5)
	match d.k:
		"person":
			_person(1.0)
		"kid":
			_person(0.75)
		"fisher":
			d.sitting = true
			_person(1.0)
			draw_line(Vector2(2, -4), Vector2(9, -10), Color("#6b4a2b"))
			var tug := sin(t * 2.0) * 1.0
			draw_line(Vector2(9, -10), Vector2(13, 3 + tug), Color(1, 1, 1, 0.6))
			px(12, 2 + tug, 2, 2, Color("#e04040"))
			draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)
		"duck", "duckling":
			draw_set_transform(Vector2(0, bob), 0, Vector2(facing, 1))
			px(-3, 0, 6, 1, Color(1, 1, 1, 0.3))
			if d.k == "duck":
				px(-2, -2, 5, 2, Color("#8a6a4a"))
				px(-3, -2, 1, 1, Color("#5a4a3a"))
				px(2, -4, 2, 2, Color("#2f7a4a"))
				px(4, -3, 1, 1, Color("#f2a03c"))
			else:
				px(-1, -1, 3, 1, Color("#f2e04e"))
				px(1, -2, 1, 1, Color("#f2e04e"))
		"swan":
			draw_set_transform(Vector2(0, bob), 0, Vector2(facing, 1))
			px(-4, 0, 8, 1, Color(1, 1, 1, 0.3))
			px(-3, -3, 6, 3, Color.WHITE)
			px(-4, -4, 2, 1, Color.WHITE)
			px(2, -7, 1, 4, Color.WHITE)
			px(2, -8, 2, 1, Color.WHITE)
			px(4, -8, 1, 1, Color("#f28c3c"))
		"otter":
			if dive > 0.0:
				px(-2, 0, 4, 1, Color(1, 1, 1, 0.5))
				return
			draw_set_transform(Vector2(0, bob), 0, Vector2(facing, 1))
			px(-3, 0, 6, 1, Color(1, 1, 1, 0.3))
			px(-2, -2, 4, 2, Color("#6a4a2a"))
			px(1, -3, 2, 2, Color("#7a5a3a"))
			px(2, -3, 1, 1, Color("#202020"))
		"heron":
			draw_set_transform(Vector2.ZERO, 0, Vector2(facing, 1))
			px(0, -4, 1, 4, Color("#e0c050"))
			px(-2, -7, 4, 3, Color("#9aa0aa"))
			px(-3, -6, 1, 1, Color("#606570"))
			var neck := 4 if fleeing else 3
			px(1, -7 - neck, 1, neck, Color("#e8e8ea"))
			px(1, -9 - neck + 1, 2, 1, Color("#e8e8ea"))
			px(3, -8 - neck + 1, 2, 1, Color("#e0c050"))
		"gull":
			var h := 18.0 + sin(t * 0.7) * 3.0
			px(-1, 0, 3, 1, Color(0, 0, 0, 0.12))
			var flap := int(t * 5.0) % 2
			draw_line(Vector2(-3, -h - flap), Vector2(0, -h + 1), Color.WHITE)
			draw_line(Vector2(0, -h + 1), Vector2(3, -h - flap), Color.WHITE)
		"butterfly":
			var h := 5.0 + sin(t * 4.0) * 2.0
			var c: Color = d.get("c", Color.WHITE)
			var flap := int(t * 12.0) % 2
			px(-1 + flap, -h, 1, 1, c)
			px(1 - flap, -h, 1, 1, c)
		"deer":
			draw_set_transform(Vector2.ZERO, 0, Vector2(facing, 1))
			px(-3, -1, 7, 1, Color(0, 0, 0, 0.18))
			var st := int(t * 10.0) % 2 if moving else 0
			for lx in [-2, 2]:
				px(lx + st, -3, 1, 3, Color("#6a4a2a"))
			px(-3, -6, 6, 3, Color("#a8703a"))
			px(-4, -6, 1, 1, Color.WHITE)
			px(2, -8, 2, 2, Color("#a8703a"))
			px(3, -9, 2, 2, Color("#a8703a"))
			px(5, -8, 1, 1, Color("#202020"))
			if d.get("antlers", false):
				px(2, -12, 1, 3, Color("#d8c8a0"))
				px(1, -12, 1, 1, Color("#d8c8a0"))
				px(4, -12, 1, 2, Color("#d8c8a0"))
		"sheep", "goat":
			draw_set_transform(Vector2.ZERO, 0, Vector2(facing, 1))
			px(-3, -1, 7, 1, Color(0, 0, 0, 0.18))
			var col := Color("#f4f2ea") if d.k == "sheep" else Color("#c9b49a")
			px(-2, -2, 1, 2, Color("#303030"))
			px(1, -2, 1, 2, Color("#303030"))
			draw_circle(Vector2(-1, -4), 2.2, col)
			draw_circle(Vector2(1, -4), 2.2, col)
			px(3, -5, 2, 2, Color("#303030") if d.k == "sheep" else col.darkened(0.2))
			if d.k == "goat":
				px(4, -7, 1, 2, Color("#d8d0c0"))
		"cow":
			draw_set_transform(Vector2.ZERO, 0, Vector2(facing, 1))
			px(-4, -1, 9, 1, Color(0, 0, 0, 0.18))
			for lx in [-3, 2]:
				px(lx, -3, 1, 3, Color("#303030"))
			px(-4, -7, 8, 4, Color("#f4f2ea"))
			px(-2, -7, 2, 2, Color("#303030"))
			px(1, -5, 2, 1, Color("#303030"))
			px(4, -7, 2, 3, Color("#f4f2ea"))
			px(5, -5, 2, 1, Color("#f2b0b0"))
		"rabbit":
			draw_set_transform(Vector2.ZERO, 0, Vector2(facing, 1))
			var hop := -int(t * 8.0) % 2 if moving else 0
			px(-1, -2 + hop, 3, 2, Color("#9a8270"))
			px(1, -4 + hop, 1, 2, Color("#9a8270"))
			px(-2, -2 + hop, 1, 1, Color.WHITE)
		"fox":
			draw_set_transform(Vector2.ZERO, 0, Vector2(facing, 1))
			px(-2, -1, 1, 1, Color("#303030"))
			px(1, -1, 1, 1, Color("#303030"))
			px(-2, -3, 4, 2, Color("#e07a2a"))
			px(-5, -3, 3, 1, Color("#e07a2a"))
			px(-6, -3, 1, 1, Color.WHITE)
			px(2, -4, 2, 2, Color("#e07a2a"))
			px(3, -5, 1, 1, Color("#e07a2a"))
		"hedgehog":
			draw_set_transform(Vector2.ZERO, 0, Vector2(facing, 1))
			px(-2, -2, 4, 2, Color("#6a5040"))
			px(-1, -3, 2, 1, Color("#6a5040"))
			px(2, -1, 1, 1, Color("#202020"))
		"cat":
			draw_set_transform(Vector2.ZERO, 0, Vector2(facing, 1))
			px(-1, -2, 3, 2, Color("#e09040"))
			px(1, -4, 2, 2, Color("#e09040"))
			px(1, -5, 1, 1, Color("#e09040"))
			px(-2, -4 + int(t * 2.0) % 2, 1, 2, Color("#e09040"))
		"dog":
			draw_set_transform(Vector2.ZERO, 0, Vector2(facing, 1))
			px(-2, -1, 1, 1, Color("#5a3a20"))
			px(2, -1, 1, 1, Color("#5a3a20"))
			px(-2, -3, 5, 2, Color("#8a5a30"))
			px(2, -5, 2, 2, Color("#8a5a30"))
			px(3, -4, 2, 1, Color("#5a3a20"))
			px(-3, -4 - int(t * 10.0) % 2, 1, 1, Color("#8a5a30"))
		"hen":
			draw_set_transform(Vector2.ZERO, 0, Vector2(facing, 1))
			px(-1, -3, 3, 2, Color("#f4f2ea"))
			px(1, -4, 1, 1, Color("#f4f2ea"))
			px(1, -5, 1, 1, Color("#e04040"))
			px(2, -4, 1, 1, Color("#f2a03c"))
		"rowboat":
			draw_set_transform(Vector2(0, bob), 0, Vector2(facing, 1))
			px(-6, 1, 12, 1, Color(1, 1, 1, 0.3))
			px(-5, -2, 10, 3, Color("#8a5a30"))
			px(-4, -2, 8, 1, Color("#b08050"))
			var row := sin(t * 3.0) * 2.0 if not waving else 0.0
			draw_line(Vector2(0, -3), Vector2(-4 + row, 1), Color("#c9a070"))
			d.sitting = true
			_person(1.0, Vector2(0, bob - 1))
