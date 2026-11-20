extends Node2D
## Builds a generated route into nodes and runs the delivery gameplay.

const Gen = preload("res://scripts/river_gen.gd")
const Terrain = preload("res://scripts/terrain_chunk.gd")
const Prop = preload("res://scripts/prop.gd")
const Critter = preload("res://scripts/critter.gd")
const Boat = preload("res://scripts/boat.gd")
const WaterFx = preload("res://scripts/water_fx.gd")
const SkyFx = preload("res://scripts/sky_fx.gd")
const CHUNK := 20

var hud
var gen
var boat
var camera: Camera2D
var water_fx
var sky_fx
var critter_nodes: Array = []
var sort_chunks: Array = []
var chimneys: Array = []
var coins := 0
var capacity := 4
var jobs: Array = []
var docked_town := -1
var route_done := false
var route_earned := 0
var rng := RandomNumberGenerator.new()


func start_route(seed_: int) -> void:
	for ch in get_children():
		remove_child(ch)
		ch.queue_free()
	critter_nodes.clear()
	sort_chunks.clear()
	chimneys.clear()
	jobs.clear()
	docked_town = -1
	route_done = false
	route_earned = 0
	rng.seed = seed_ + 7

	gen = Gen.new()
	gen.generate(seed_)

	var terrain := Node2D.new()
	terrain.z_index = -2
	add_child(terrain)
	for y0 in range(0, Gen.L, CHUNK):
		var ch := Terrain.new()
		ch.gen = gen
		ch.y0 = y0
		ch.y1 = mini(y0 + CHUNK, Gen.L)
		terrain.add_child(ch)

	water_fx = WaterFx.new()
	water_fx.world = self
	water_fx.z_index = -1
	add_child(water_fx)

	var sorted := Node2D.new()
	sorted.y_sort_enabled = true
	add_child(sorted)
	# Y-sorted sub-groups per band of rows so off-screen bands can be hidden.
	for i in range(0, Gen.L, CHUNK):
		var band := Node2D.new()
		band.y_sort_enabled = true
		sorted.add_child(band)
		sort_chunks.append(band)
	for p in gen.props:
		var n := Prop.new()
		n.d = p
		n.position = Gen.iso(p.g).round()
		_band(p.g.y).add_child(n)
		if p.k == "house" and p.get("chim", false):
			var a: float = p.get("a", 6.0)
			var h: float = p.get("h", 8.0)
			chimneys.append(n.position + Vector2(-a * 0.25 + 3, -h - a * 0.7 - 8))
	for c in gen.critters:
		var n := Critter.new()
		n.d = c
		n.world = self
		critter_nodes.append(n)
	boat = Boat.new()
	boat.world = self
	boat.g = Vector2(gen.centers[24], 24.5)
	boat.position = Gen.iso(boat.g)
	sorted.add_child(boat)
	for n in critter_nodes:
		_band(n.d.home.y).add_child(n)

	sky_fx = SkyFx.new()
	sky_fx.world = self
	sky_fx.z_index = 10
	add_child(sky_fx)

	camera = Camera2D.new()
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = 4.0
	camera.position = boat.position
	add_child(camera)
	camera.make_current()

	if hud:
		hud.hide_dock()
		hud.show_banner("The %s" % gen.river_name, 4.0)
		hud.show_message("%d towns between here and the sea. Dock at a town to find work." % (gen.towns.size()), 6.0)


func _band(y: float) -> Node2D:
	return sort_chunks[clampi(int(y) / CHUNK, 0, sort_chunks.size() - 1)]


func _cull() -> void:
	var vs := get_viewport_rect().size
	var reach := vs.y * 0.5 / Gen.TILE_H + vs.x * 0.5 / (Gen.TILE_W * 0.5) * 0.5 + 8.0
	var cy: float = Gen.iso_to_grid(camera.get_screen_center_position()).y
	for i in sort_chunks.size():
		var mid := i * CHUNK + CHUNK * 0.5
		var vis := absf(mid - cy) < reach + CHUNK * 0.5
		var band: Node2D = sort_chunks[i]
		if band.visible != vis:
			band.visible = vis
			band.process_mode = Node.PROCESS_MODE_INHERIT if vis else Node.PROCESS_MODE_DISABLED


func next_town_index() -> int:
	for i in gen.towns.size():
		if gen.towns[i].ty > boat.g.y - 2:
			return i
	return -1


func _nearby_town() -> int:
	for i in gen.towns.size():
		if boat.g.distance_to(gen.towns[i].berth) < 2.4:
			return i
	return -1


func _process(_delta: float) -> void:
	if gen == null:
		return
	camera.position = boat.position + Vector2(0, -10)
	_cull()
	if docked_town >= 0:
		hud.set_prompt("")
		return
	var near := _nearby_town()
	if near >= 0:
		hud.set_prompt("Press E to dock at %s" % gen.towns[near].name)
	elif route_done:
		hud.set_prompt("Press N to sail a new river")
	else:
		hud.set_prompt("")


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey and event.pressed and not event.echo):
		return
	match event.physical_keycode:
		KEY_E, KEY_SPACE, KEY_ENTER:
			if docked_town >= 0:
				_cast_off()
			else:
				var near := _nearby_town()
				if near >= 0:
					_dock(near)
		KEY_1, KEY_2, KEY_3:
			if docked_town >= 0:
				_accept(event.physical_keycode - KEY_1)
		KEY_U:
			if docked_town >= 0 and gen.towns[docked_town].harbour:
				var cost := _upgrade_cost()
				if coins >= cost:
					coins -= cost
					capacity += 1
					hud.show_message("Hold upgraded! Capacity %d" % capacity)
					_refresh_dock()
				else:
					hud.show_message("Need %d coins for an upgrade" % cost)
		KEY_N:
			if route_done or event.shift_pressed:
				start_route(randi())
			else:
				hud.show_message("Reach the harbour first (Shift+N skips this river)")


func _upgrade_cost() -> int:
	return 120 * (capacity - 3)


func _make_offers(i: int) -> Array:
	var town: Dictionary = gen.towns[i]
	var out: Array = []
	var last: int = gen.towns.size() - 1
	if i >= last:
		return out
	for k in 3:
		var dest := rng.randi_range(i + 1, last)
		var dist: float = gen.towns[dest].ty - town.ty
		if rng.randf() < 0.45:
			var nm: String = Gen.FIRST_NAMES[rng.randi() % Gen.FIRST_NAMES.size()]
			var why: String = Gen.REASONS[rng.randi() % Gen.REASONS.size()]
			out.append({"kind": "passenger", "label": "%s (%s)" % [nm, why], "dest": dest,
				"reward": int(15 + dist * 0.45 + rng.randi_range(0, 10)),
				"color": Gen.SHIRTS[rng.randi() % Gen.SHIRTS.size()]})
		else:
			out.append({"kind": "goods", "label": "Crate of %s" % town.specialty, "dest": dest,
				"reward": int(10 + dist * 0.35 + rng.randi_range(0, 8)), "color": Color.WHITE})
	return out


func _dock(i: int) -> void:
	docked_town = i
	boat.docked = true
	boat.dock_target = gen.towns[i].berth
	var town: Dictionary = gen.towns[i]
	var delivered: Array = []
	for j in jobs.duplicate():
		if j.dest == i:
			coins += j.reward
			route_earned += j.reward
			jobs.erase(j)
			delivered.append(j)
	town.delivered = delivered
	if town.offers == null:
		town.offers = _make_offers(i)
	if town.harbour and not route_done:
		route_done = true
		hud.show_banner("Route complete!", 5.0)
	_refresh_dock()


func _refresh_dock() -> void:
	var town: Dictionary = gen.towns[docked_town]
	var s := "[b]%s[/b]\n[color=#d9b47a]Famous for its %s.[/color]\n[i]%s[/i]\n\n" % [town.name, town.specialty, town.culture]
	for j in town.get("delivered", []):
		var thanks := "\"Thank you, captain!\"" if j.kind == "passenger" else "Signed for."
		s += "[color=#8fe08f]Delivered %s  +%d coins[/color]  %s\n" % [j.label, j.reward, thanks]
	if town.harbour:
		s += "\n[b]You've reached the sea![/b]\nEarned on this river: %d coins.\n" % route_earned
		s += "[U] Upgrade cargo hold to %d slots (%d coins)\n" % [capacity + 1, _upgrade_cost()]
		s += "[N] Sail a new river\n"
	else:
		s += "\nWork available  (hold %d/%d):\n" % [jobs.size(), capacity]
		var offers: Array = town.offers
		if offers.is_empty():
			s += "  [color=#999999]Nothing left today.[/color]\n"
		for k in offers.size():
			var o: Dictionary = offers[k]
			var tag := "Passenger" if o.kind == "passenger" else "Goods"
			s += "  [color=#f2c14e][%d][/color] %s: %s  ->  %s   [color=#8fe08f]+%d[/color]\n" % [k + 1, tag, o.label, gen.towns[o.dest].name, o.reward]
	s += "\n[color=#aaaaaa][E] Cast off[/color]"
	hud.show_dock(s)


func _accept(k: int) -> void:
	var offers: Array = gen.towns[docked_town].offers
	if k >= offers.size():
		return
	if jobs.size() >= capacity:
		hud.show_message("Your hold is full!")
		return
	var o: Dictionary = offers[k]
	jobs.append(o)
	offers.remove_at(k)
	hud.show_message("%s aboard, bound for %s" % [o.label, gen.towns[o.dest].name])
	_refresh_dock()


func _cast_off() -> void:
	var town: Dictionary = gen.towns[docked_town]
	town.delivered = []
	docked_town = -1
	boat.docked = false
	boat.vel = (town.berth - town.dock).normalized() * 1.2
	hud.hide_dock()
