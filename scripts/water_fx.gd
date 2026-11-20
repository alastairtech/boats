extends Node2D
## Water-surface effects drawn above terrain: sparkles drifting with the current, boat wake, jumping fish.

const Gen = preload("res://scripts/river_gen.gd")

var world
var sparkles: Array = []
var wakes: Array = []
var fish: Array = []
var fish_timer := 2.0


func add_wake(p: Vector2, perp: Vector2) -> void:
	wakes.append({"p": p, "perp": perp, "life": 1.4})


func _process(delta: float) -> void:
	var bg: Vector2 = world.boat.g
	while sparkles.size() < 110:
		var p := bg + Vector2(randf_range(-22, 22), randf_range(-22, 22))
		if world.gen.zone_ok("water", p):
			var life := randf_range(0.8, 2.2)
			sparkles.append({"g": p, "life": life, "max": life, "w": 2 + randi() % 3})
		else:
			sparkles.append({"g": p, "life": 0.0, "max": 1.0, "w": 0})
	for s in sparkles:
		s.life -= delta
		s.g += world.gen.flow_at(s.g) * 0.7 * delta
	sparkles = sparkles.filter(func(s): return s.life > 0.0)
	for w in wakes:
		w.life -= delta
	wakes = wakes.filter(func(w): return w.life > 0.0)
	fish_timer -= delta
	if fish_timer <= 0.0:
		fish_timer = randf_range(1.5, 4.0)
		var p := bg + Vector2(randf_range(-10, 10), randf_range(-10, 10))
		if world.gen.zone_ok("water", p) and p.distance_to(bg) > 2.5:
			fish.append({"p": Gen.iso(p).round(), "t": 0.0, "dir": 1.0 if randf() < 0.5 else -1.0})
	for f in fish:
		f.t += delta
	fish = fish.filter(func(f): return f.t < 1.2)
	queue_redraw()


func _draw() -> void:
	for s in sparkles:
		if s.w == 0:
			continue
		var a := sin(PI * s.life / s.max)
		var p := Gen.iso(s.g).round()
		draw_rect(Rect2(p.x, p.y, s.w, 1), Color(1, 1, 1, 0.55 * a))
	for w in wakes:
		var age: float = 1.4 - w.life
		var a: float = w.life / 1.4
		var spread: float = 2.0 + age * 7.0
		for sgn in [-1.0, 1.0]:
			var q: Vector2 = (w.p + w.perp * spread * sgn).round()
			draw_rect(Rect2(q.x, q.y, 2, 1), Color(1, 1, 1, 0.6 * a))
		if age < 0.4:
			draw_rect(Rect2(w.p.x - 1, w.p.y, 3, 1), Color(1, 1, 1, 0.5 * a))
	for f in fish:
		var k: float = f.t / 0.8
		if k < 1.0:
			var p: Vector2 = f.p + Vector2(f.dir * k * 8.0, -sin(k * PI) * 9.0)
			draw_rect(Rect2(round(p.x) - 1, round(p.y), 3, 1), Color("#a0b8c8"))
			draw_rect(Rect2(round(p.x) + (2 if f.dir < 0 else -2), round(p.y) - 1, 1, 1), Color("#a0b8c8"))
		var rp: Vector2 = f.p if f.t < 0.3 else f.p + Vector2(f.dir * 8.0, 0)
		var r: float = fmod(f.t, 0.8) * 6.0
		draw_arc(rp, r + 1.0, 0, TAU, 10, Color(1, 1, 1, 0.4 * (1.0 - fmod(f.t, 0.8) / 0.8)))
