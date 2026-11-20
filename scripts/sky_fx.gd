extends Node2D
## Effects drawn above everything: chimney smoke and passing flocks of birds.

const Gen = preload("res://scripts/river_gen.gd")

var world
var puffs: Array = []
var flocks: Array = []
var chimney_timer := 0.0
var flock_timer := 3.0


func add_smoke(p: Vector2) -> void:
	puffs.append({"p": p, "life": 2.0, "v": Vector2(randf_range(-2, 4), -7)})


func _process(delta: float) -> void:
	chimney_timer -= delta
	if chimney_timer <= 0.0:
		chimney_timer = 0.35
		var bp: Vector2 = world.boat.position
		var near: Array = world.chimneys.filter(func(c): return c.distance_to(bp) < 260.0)
		if not near.is_empty():
			add_smoke(near[randi() % near.size()])
	for p in puffs:
		p.life -= delta
		p.p += p.v * delta
	puffs = puffs.filter(func(p): return p.life > 0.0)
	flock_timer -= delta
	if flock_timer <= 0.0:
		flock_timer = randf_range(6.0, 14.0)
		var cam: Vector2 = world.camera.get_screen_center_position()
		var dir := 1.0 if randf() < 0.5 else -1.0
		var birds: Array = []
		for i in randi_range(3, 6):
			birds.append(Vector2(-absf(i - 2.0) * 6.0 * dir * -1.0, i * 4.0))
		flocks.append({"p": cam + Vector2(-280.0 * dir, randf_range(-120, 40)), "v": Vector2(40.0 * dir, -6.0), "birds": birds, "life": 16.0, "t": 0.0})
	for f in flocks:
		f.life -= delta
		f.t += delta
		f.p += f.v * delta
	flocks = flocks.filter(func(f): return f.life > 0.0)
	queue_redraw()


func _draw() -> void:
	for p in puffs:
		var k: float = 1.0 - p.life / 2.0
		draw_circle(p.p.round(), 1.5 + k * 3.0, Color(0.92, 0.92, 0.95, 0.55 * (1.0 - k)))
	for f in flocks:
		for i in f.birds.size():
			var b: Vector2 = (f.p + f.birds[i]).round()
			var flap := int(f.t * 6.0 + i) % 2
			draw_line(b + Vector2(-2, -flap), b, Color("#303040"))
			draw_line(b, b + Vector2(2, -flap), Color("#303040"))
