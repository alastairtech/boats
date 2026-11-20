extends RefCounted
## Procedurally generates one river route: terrain grid, towns, scenery and wildlife.
## Grid coordinates: x runs across the river, y runs downstream.

enum T { DEEP, WATER, SHALLOW, SAND, GRASS, FOREST, FIELD, TOWN, DOCK }

const W := 96
const L := 420
const TILE_W := 16
const TILE_H := 8

const NAME_A := ["Mill", "Wil", "Ash", "Brook", "Fern", "Hazel", "Otter", "Kings", "Pebble", "Wren",
	"Bram", "Elder", "Thistle", "Moss", "Heron", "Lark", "Apple", "Rush", "Clover", "Bell", "Puddle",
	"Honey", "Willow", "Badger", "Cobble", "Marigold", "Sorrel", "Tansy", "Rook", "Kettle"]
const NAME_B := ["brook", "ford", "bury", "wick", "mere", "stead", "ton", "haven", "dale", "holm",
	"bridge", "wold", "combe", "by", "sey", "worth", "hythe", "minster", "field", "well"]
const RIVER_A := ["Wen", "Am", "Sil", "Tam", "Lu", "Do", "Ka", "Mar", "El", "Ris", "Bel", "Oon", "Fen", "Ash"]
const RIVER_B := ["dle", "bry", "wy", "ver", "nell", "rin", "sa", "low", "brook", "mere", "ith", "wenna"]
const SPECIALTIES := ["cheese", "wool", "apples", "pottery", "honey", "cider", "lanterns", "tea",
	"bread", "quilts", "smoked fish", "timber", "flowers", "jam", "clocks", "candles", "baskets", "pies"]
const CULTURE := [
	"Every spring they roll a giant %s down to the river.",
	"The mayor is a very old tortoise. Nobody questions it.",
	"Home of the annual duck parade.",
	"They ring the bell whenever a boat arrives. Wave back!",
	"The bakery opens at dawn and is sold out by six.",
	"Famous for its lantern festival on the longest night.",
	"Locals swear the river here sings at midnight.",
	"There's a fiddle band on the quay every evening.",
	"The village cat has its own little boat.",
	"Their %s won first prize at the county fair.",
	"Children race paper boats from the bridge every Sunday.",
	"Known for terrible puns and excellent %s.",
	"The tea house has a view of the herons' nests.",
	"Every house has a window box overflowing with flowers.",
	"Old sailors trade stories by the harbour wall.",
]
const REASONS := ["visiting grandma", "off to the fair", "a new job at the mill", "on honeymoon",
	"a fishing trip", "selling paintings", "joining the choir", "seeing the lighthouse", "a wedding",
	"delivering a letter", "studying herons", "returning home", "a pie contest", "an apprenticeship"]
const FIRST_NAMES := ["Mabel", "Otis", "Hattie", "Fern", "Arlo", "Wilf", "Ivy", "Bea", "Percy", "Nell",
	"Rufus", "Tilly", "Albie", "Rosa", "Edie", "Hugo", "Pip", "Clem", "Dot", "Ned"]
const WALLS := [Color("#f2e6c9"), Color("#f7f3ea"), Color("#f2c9c0"), Color("#c9dcef"), Color("#f4e19c"),
	Color("#d8e8c4"), Color("#e8d0b0"), Color("#ffffff")]
const ROOFS := [Color("#b5533c"), Color("#4f6380"), Color("#c9a050"), Color("#5f7f4a"), Color("#8b3a3a"),
	Color("#6a4f7a"), Color("#a86a3a")]
const SHIRTS := [Color("#d94f4f"), Color("#4f7fd9"), Color("#f2c14e"), Color("#5fae5f"), Color("#a05fd9"),
	Color("#f28c3c"), Color("#ffffff"), Color("#2e4a6b"), Color("#e87fb0")]
const SKINS := [Color("#f5d0b0"), Color("#e0ac85"), Color("#b97f55"), Color("#8a5a3a"), Color("#5e3b24")]
const HAIRS := [Color("#3a2a1a"), Color("#7a4a20"), Color("#e8c060"), Color("#202020"), Color("#c0c0c0"), Color("#a03a20")]

var rng := RandomNumberGenerator.new()
var tiles := PackedByteArray()
var detail := PackedByteArray()
var centers := PackedFloat32Array()
var widths := PackedFloat32Array()
var lakes: Array = []
var towns: Array = []
var props: Array = []
var critters: Array = []
var occupied := {}
var river_name := ""
var n_biome := FastNoiseLite.new()
var n_kind := FastNoiseLite.new()


static func iso(g: Vector2) -> Vector2:
	return Vector2((g.x - g.y) * TILE_W * 0.5, (g.x + g.y) * TILE_H * 0.5)


static func iso_to_grid(s: Vector2) -> Vector2:
	return Vector2(s.x / TILE_W + s.y / TILE_H, s.y / TILE_H - s.x / TILE_W)


func get_t(x: int, y: int) -> int:
	if x < 0 or y < 0 or x >= W or y >= L:
		return -1
	return tiles[y * W + x]


func get_tf(p: Vector2) -> int:
	return get_t(int(floor(p.x)), int(floor(p.y)))


func set_t(x: int, y: int, t: int) -> void:
	if x >= 0 and y >= 0 and x < W and y < L:
		tiles[y * W + x] = t


func is_water(x: int, y: int) -> bool:
	var t := get_t(x, y)
	return t >= 0 and t <= T.SHALLOW


func boat_ok(p: Vector2) -> bool:
	for o in [Vector2(0.3, 0), Vector2(-0.3, 0), Vector2(0, 0.3), Vector2(0, -0.3)]:
		var q: Vector2 = p + o
		if not is_water(int(floor(q.x)), int(floor(q.y))):
			return false
	return true


func zone_ok(zone: String, p: Vector2) -> bool:
	var t := get_tf(p)
	match zone:
		"water":
			return t >= 0 and t <= T.SHALLOW
		"shallow":
			return t == T.SHALLOW or t == T.WATER
		"land":
			return t == T.GRASS or t == T.FOREST or t == T.FIELD or t == T.SAND
		"meadow":
			return t == T.GRASS or t == T.FIELD
		"forest":
			return t == T.FOREST or t == T.GRASS
		"town":
			return t == T.TOWN or t == T.SAND or t == T.GRASS
		"bank":
			return t == T.SAND or t == T.GRASS
		"air":
			return t >= 0
	return false


func flow_at(p: Vector2) -> Vector2:
	var y := clampi(int(p.y), 0, L - 2)
	var dc := centers[y + 1] - centers[y]
	var off := absf(p.x - centers[y]) / maxf(widths[y], 1.0)
	var speed := clampf(0.9 * (1.2 - 0.7 * off) * clampf(5.0 / widths[y], 0.35, 1.2), 0.15, 1.2)
	return Vector2(dc, 1.0).normalized() * speed


func pick(arr: Array):
	return arr[rng.randi() % arr.size()]


func _shuffle(arr: Array) -> void:
	for i in range(arr.size() - 1, 0, -1):
		var j := rng.randi_range(0, i)
		var tmp = arr[i]
		arr[i] = arr[j]
		arr[j] = tmp


func occ(x: int, y: int) -> bool:
	return occupied.has(Vector2i(x, y))


func _prop(k: String, g: Vector2, extra := {}) -> void:
	var d := {"k": k, "g": g}
	d.merge(extra)
	props.append(d)
	occupied[Vector2i(int(floor(g.x)), int(floor(g.y)))] = true


func _critter(k: String, g: Vector2, zone: String, extra := {}) -> Dictionary:
	var d := {"k": k, "g": g, "zone": zone, "home": g, "radius": 3.0, "leader": -1}
	d.merge(extra, true)
	critters.append(d)
	return d


func _person_look() -> Dictionary:
	return {"shirt": pick(SHIRTS), "skin": pick(SKINS), "hair": pick(HAIRS), "pants": pick([Color("#3a3a5a"), Color("#5a4030"), Color("#2a4a3a"), Color("#6a6a7a")])}


func bank_x(y: int, side: int) -> int:
	var x := int(centers[clampi(y, 0, L - 1)])
	while x > 0 and x < W - 1 and is_water(x, y):
		x += side
	return x


func make_town_name() -> String:
	var n: String = pick(NAME_A) + pick(NAME_B)
	for t in towns:
		if t.name == n:
			return make_town_name()
	return n


func generate(seed_: int) -> void:
	rng.seed = seed_
	tiles.resize(W * L)
	detail.resize(W * L)
	for i in W * L:
		detail[i] = rng.randi() & 255
	centers.resize(L)
	widths.resize(L)
	river_name = "River " + pick(RIVER_A) + pick(RIVER_B)

	var n_center := FastNoiseLite.new()
	n_center.seed = rng.randi()
	n_center.frequency = 0.008
	n_center.fractal_octaves = 3
	var n_width := FastNoiseLite.new()
	n_width.seed = rng.randi()
	n_width.frequency = 0.04
	var n_bank := FastNoiseLite.new()
	n_bank.seed = rng.randi()
	n_bank.frequency = 0.15
	n_biome.seed = rng.randi()
	n_biome.frequency = 0.045
	n_kind.seed = rng.randi()
	n_kind.frequency = 0.03

	var lake_count := rng.randi_range(2, 4)
	for i in lake_count:
		var ly := lerpf(50.0, L - 90.0, (i + rng.randf_range(0.2, 0.8)) / lake_count)
		lakes.append({"y": ly, "r": rng.randf_range(9.0, 16.0), "w": rng.randf_range(5.0, 10.0)})

	var sea_start := L - 34
	for y in L:
		var c := W * 0.5 + n_center.get_noise_1d(y) * 24.0
		c = clampf(c, 36.0, W - 36.0)
		var w := 3.0 + (n_width.get_noise_1d(y) + 1.0) * 0.9
		for lk in lakes:
			var d: float = (y - lk.y) / lk.r
			if absf(d) < 1.0:
				w += lk.w * (1.0 - d * d)
		if y > sea_start:
			var t := float(y - sea_start) / 34.0
			c = lerpf(c, W * 0.5, t)
			w = lerpf(w, W * 0.8, t * t)
		centers[y] = c
		widths[y] = w

	for y in L:
		for x in W:
			var d := absf(x + 0.5 - centers[y]) - widths[y] - n_bank.get_noise_2d(x, y) * 0.9
			var t: int
			if d < -2.2:
				t = T.DEEP
			elif d < -0.9:
				t = T.WATER
			elif d < 0.0:
				t = T.SHALLOW
			elif d < 1.3:
				t = T.SAND
			elif n_biome.get_noise_2d(x, y) > 0.05:
				t = T.FOREST
			else:
				t = T.GRASS
			tiles[y * W + x] = t

	_make_islands()
	_make_towns()
	_make_points_of_interest()
	_make_scenery()
	_make_wildlife()


func _make_islands() -> void:
	for lk in lakes:
		if lk.w < 6.5:
			continue
		var ly := int(lk.y)
		var ic := Vector2(centers[ly], ly + 0.5)
		var r := rng.randf_range(1.6, 2.6)
		for y in range(ly - 6, ly + 7):
			for x in range(int(ic.x) - 4, int(ic.x) + 5):
				var dd := Vector2(x + 0.5 - ic.x, (y + 0.5 - ic.y) * 0.5).length()
				if dd < r - 0.9:
					set_t(x, y, T.GRASS)
				elif dd < r:
					set_t(x, y, T.SAND)
				elif dd < r + 0.7 and is_water(x, y):
					set_t(x, y, T.SHALLOW)
		var feature = pick(["hut", "shrine", "ruin", "tree"])
		if feature == "tree":
			_prop("tree", ic, {"s": 1.3, "c": Color("#5f9e40")})
		else:
			_prop(feature, ic, {"wall": pick(WALLS), "roof": pick(ROOFS), "a": 5.0, "h": 7.0, "chim": true})
			_prop("tree", ic + Vector2(0.9, 0.9), {"s": 1.0, "c": Color("#6aae45")})
		_critter("heron", ic + Vector2(r + 0.4, 0), "shallow", {"radius": 1.5})


func _make_towns() -> void:
	var y := 38.0 + rng.randf_range(0, 8)
	var side := -1 if rng.randf() < 0.5 else 1
	while y < L - 80:
		_place_town(int(y), side, false)
		y += rng.randf_range(40, 55)
		if rng.randf() < 0.7:
			side = -side
	_place_town(L - 46, -side, true)


func _place_town(ty: int, side: int, harbour: bool) -> void:
	var bx := bank_x(ty, side)
	if bx <= 4 or bx >= W - 5:
		side = -side
		bx = bank_x(ty, side)
		if bx <= 4 or bx >= W - 5:
			return
	var pier_len := 2 if harbour else 1
	for k in range(0, pier_len + 1):
		set_t(bx - side * k, ty, T.DOCK)
		occupied[Vector2i(bx - side * k, ty)] = true
	var town := {
		"name": make_town_name(), "specialty": pick(SPECIALTIES), "ty": ty, "side": side,
		"berth": Vector2(bx - side * (pier_len + 1) + 0.5, ty + 0.5),
		"dock": Vector2(bx + 0.5, ty + 0.5), "harbour": harbour,
		"festival": rng.randf() < 0.45, "offers": null,
	}
	if harbour:
		town.name = town.name.replace("brook", "port") + " Harbour"
	var cl: String = pick(CULTURE)
	town.culture = cl % town.specialty if cl.contains("%s") else cl
	towns.append(town)

	var walls := [pick(WALLS), pick(WALLS)]
	var roofs := [pick(ROOFS), pick(ROOFS)]
	var ry := 9 if harbour else 7
	var rx := 14 if harbour else 10
	var cells: Array = []
	var fields: Array = []
	for yy in range(ty - ry - 4, ty + ry + 5):
		if yy < 0 or yy >= L:
			continue
		var x0 := bank_x(yy, side)
		for k in range(0, rx + 6):
			var xx := x0 + side * k
			if xx < 0 or xx >= W:
				break
			var tt := get_t(xx, yy)
			if tt <= T.SHALLOW or tt == T.DOCK:
				continue
			var e := pow(float(yy - ty) / ry, 2) + pow(float(k) / rx, 2)
			if e < 1.0:
				if tt == T.SAND and not harbour:
					continue
				set_t(xx, yy, T.TOWN)
				cells.append(Vector2i(xx, yy))
			elif e < 1.8 and (tt == T.GRASS or tt == T.FOREST):
				set_t(xx, yy, T.FIELD)
				fields.append(Vector2i(xx, yy))
	_shuffle(cells)
	_shuffle(fields)
	var dock_cell := Vector2i(bx, ty)
	var free_cells: Array = []
	var buildings := {}

	# Landmark furthest-ish from the water
	var landmark: String = pick(["church", "tower", "church", "well"])
	for c in cells:
		if absi(c.x - bx) >= 4 and absi(c.y - ty) <= 3:
			_prop(landmark, Vector2(c.x + 0.5, c.y + 0.5), {"wall": pick(WALLS), "roof": pick(ROOFS)})
			buildings[c] = true
			break

	# Market stalls and quayside clutter near the dock
	var stalls := 0
	for c in cells:
		if buildings.has(c) or occ(c.x, c.y):
			continue
		var dist: int = absi(c.x - dock_cell.x) + absi(c.y - dock_cell.y)
		if dist <= 3 and stalls < 3:
			_prop("stall", Vector2(c.x + 0.5, c.y + 0.5), {"c": pick([Color("#d94f4f"), Color("#4f7fd9"), Color("#5fae5f"), Color("#f2a03c")])})
			buildings[c] = true
			stalls += 1
	for k in rng.randi_range(2, 4):
		var p := Vector2(bx + 0.5 + side * rng.randf_range(0.0, 1.5), ty + 0.5 + rng.randf_range(-1.6, 1.6))
		if not occ(int(p.x), int(p.y)):
			_prop(pick(["crate", "barrel", "crate"]), p)

	var house_target := rng.randi_range(18, 24) if harbour else rng.randi_range(9, 14)
	var houses := 0
	for c in cells:
		if houses >= house_target:
			free_cells.append(c)
			continue
		if occ(c.x, c.y):
			continue
		var blocked := false
		for o in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			if buildings.has(c + o):
				blocked = true
		if blocked:
			free_cells.append(c)
			continue
		var kind := "house"
		if harbour and rng.randf() < 0.3:
			kind = "warehouse"
		_prop(kind, Vector2(c.x + 0.5, c.y + 0.5), {
			"wall": walls[rng.randi() % 2], "roof": roofs[rng.randi() % 2],
			"a": rng.randf_range(5.0, 7.0), "h": rng.randf_range(6.0, 10.0), "chim": rng.randf() < 0.6})
		buildings[c] = true
		houses += 1

	var extras := ["lamp", "lamp", "lamp", "tree", "tree", "bench", "flowerbed", "flowerbed"]
	if town.festival:
		extras += ["flag", "flag", "flag", "flag", "flag"]
	for e in extras:
		while not free_cells.is_empty():
			var c: Vector2i = free_cells.pop_back()
			if occ(c.x, c.y):
				continue
			_prop(e, Vector2(c.x + rng.randf_range(0.3, 0.7), c.y + rng.randf_range(0.3, 0.7)),
				{"s": 0.9, "c": pick([Color("#e85050"), Color("#f2c14e"), Color("#4f9fe8"), Color("#e87fb0"), Color("#ffffff")]) if e != "tree" else Color("#6aae45")})
			break

	# Windmill in the fields
	for f in fields:
		if not occ(f.x, f.y) and rng.randf() < 0.5:
			_prop("windmill", Vector2(f.x + 0.5, f.y + 0.5))
			break
	for i in mini(fields.size(), 6):
		var f: Vector2i = fields[i]
		if not occ(f.x, f.y):
			_prop(pick(["haybale", "haybale", "scarecrow"]), Vector2(f.x + 0.5, f.y + 0.5))

	if harbour:
		var lx := bank_x(ty + 5, side)
		_prop("lighthouse", Vector2(lx + 0.5, ty + 5.5))
		_prop("crane", Vector2(bx + side + 0.5, ty - 0.5))
		for k in 4:
			_critter("gull", Vector2(bx - side * rng.randf_range(2, 8), ty + rng.randf_range(-6, 6)), "air", {"radius": 6.0})

	# Townsfolk
	var people := 14 if harbour else rng.randi_range(7, 10)
	for i in people:
		if free_cells.is_empty():
			break
		var c: Vector2i = free_cells[rng.randi() % free_cells.size()]
		var look := _person_look()
		look.radius = 4.0
		_critter("person", Vector2(c.x + 0.5, c.y + 0.5), "town", look)
	for i in 2:
		var by := ty + rng.randi_range(-4, 4)
		var kx := bank_x(by, side) + side
		var look := _person_look()
		look.radius = 2.0
		_critter("kid", Vector2(kx + 0.5, by + 0.5), "town", look)
	var worker := _person_look()
	worker.still = true
	_critter("person", Vector2(bx + 0.5, ty + 0.5), "town", worker)
	if not free_cells.is_empty():
		var c: Vector2i = free_cells[0]
		_critter(pick(["cat", "dog"]), Vector2(c.x + 0.5, c.y + 0.5), "town", {"radius": 3.0})


func _near_town(y: float, margin: float) -> bool:
	for t in towns:
		if absf(y - t.ty) < margin:
			return true
	return false


func _make_points_of_interest() -> void:
	var y := 14.0
	while y < L - 50:
		y += rng.randf_range(12, 20)
		var yi := int(y)
		if _near_town(y, 13) or yi >= L:
			continue
		var side := -1 if rng.randf() < 0.5 else 1
		var x := bank_x(yi, side) + side * rng.randi_range(2, 5)
		var tt := get_t(x, yi)
		if tt != T.GRASS and tt != T.FOREST:
			continue
		var g := Vector2(x + 0.5, yi + 0.5)
		var kind: String = pick(["picnic", "camp", "cottage", "stones", "beehives", "chapel", "ruin", "fisher_hut", "orchard"])
		match kind:
			"picnic":
				_prop("blanket", g)
				for i in rng.randi_range(2, 3):
					var look := _person_look()
					look.still = true
					look.sitting = true
					_critter("person", g + Vector2(rng.randf_range(-0.5, 0.5), rng.randf_range(-0.5, 0.5)), "land", look)
				_prop("tree", g + Vector2(-side * 1.5, -1.0), {"s": 1.3, "c": Color("#5f9e40")})
			"camp":
				_prop("tent", g, {"c": pick([Color("#e8a040"), Color("#4f9fe8"), Color("#d94f4f")])})
				_prop("campfire", g + Vector2(-side * 1.0, 1.0))
				var look := _person_look()
				look.still = true
				look.sitting = true
				_critter("person", g + Vector2(-side * 1.0, 1.7), "land", look)
			"cottage", "fisher_hut":
				_prop("house", g, {"wall": pick(WALLS), "roof": pick(ROOFS), "a": 6.0, "h": 7.0, "chim": true})
				_prop("flowerbed", g + Vector2(0, 1.2), {"c": pick(SHIRTS)})
				_prop("flowerbed", g + Vector2(-side, 1.2), {"c": pick(SHIRTS)})
				var look := _person_look()
				look.radius = 1.5
				_critter("person", g + Vector2(-side, 0), "land", look)
				_critter(pick(["cat", "dog", "hen", "hen"]), g + Vector2(0, -1.2), "land", {"radius": 1.5})
			"stones":
				for i in 7:
					var a := TAU * i / 7.0
					_prop("standing_stone", g + Vector2(cos(a), sin(a)) * 1.6)
			"beehives":
				for i in 3:
					_prop("beehive", g + Vector2(i * 0.8, 0))
				for i in 4:
					_critter("butterfly", g, "air", {"radius": 1.8, "c": Color("#f2c14e")})
			"chapel":
				_prop("shrine", g, {"wall": Color("#e8e0d0"), "roof": pick(ROOFS)})
				_prop("lamp", g + Vector2(-side, 1))
			"ruin":
				_prop("ruin", g)
				_prop("bush", g + Vector2(1, 0.5))
			"orchard":
				for i in 3:
					for j in 2:
						_prop("fruit_tree", g + Vector2(i * 1.2, j * 1.4), {"c": pick([Color("#e04040"), Color("#f0a020"), Color("#f0e040")])})
				var look := _person_look()
				look.radius = 2.0
				_critter("person", g + Vector2(1, 0.7), "land", look)


func _make_scenery() -> void:
	for y in L:
		var c := centers[y]
		var w := widths[y]
		for x in W:
			if occ(x, y) or absf(x + 0.5 - c) > w + 34:
				continue
			var t := get_t(x, y)
			var r := rng.randf()
			var g := Vector2(x + rng.randf_range(0.25, 0.75), y + rng.randf_range(0.25, 0.75))
			match t:
				T.FOREST:
					if r < 0.5:
						var kn := n_kind.get_noise_2d(x, y) + rng.randf_range(-0.15, 0.15)
						if kn > 0.1:
							_prop("pine", g, {"s": rng.randf_range(0.8, 1.3), "c": Color("#3f7a4a").lerp(Color("#2f5f3a"), rng.randf())})
						elif kn < -0.25:
							_prop("birch", g, {"s": rng.randf_range(0.8, 1.2)})
						else:
							_prop("tree", g, {"s": rng.randf_range(0.8, 1.3), "c": Color("#5f9e40").lerp(Color("#4a8a3a"), rng.randf())})
					elif r < 0.53:
						_prop("mushroom", g)
				T.GRASS:
					if r < 0.03:
						_prop("tree", g, {"s": rng.randf_range(0.9, 1.4), "c": Color("#6aae45").lerp(Color("#5a9e3a"), rng.randf())})
					elif r < 0.07:
						_prop("bush", g)
					elif r < 0.14:
						_prop("flowers", g, {"c": pick([Color("#f2f2f2"), Color("#f2c14e"), Color("#e87fb0"), Color("#a07fe0"), Color("#e85050")])})
					elif r < 0.15:
						_prop("rock", g)
				T.SAND:
					if r < 0.05:
						_prop("rock", g)
					elif r < 0.065:
						_prop("log", g)
				T.SHALLOW:
					if r < 0.18 and _next_to_land(x, y):
						_prop("reeds", g)
				T.FIELD:
					if r < 0.02:
						_prop("haybale", g)


func _next_to_land(x: int, y: int) -> bool:
	for o in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
		var t := get_t(x + o.x, y + o.y)
		if t == T.SAND or t == T.GRASS or t == T.FOREST:
			return true
	return false


func _find(y: int, zone: String, side: int, off_min: float, off_max: float) -> Vector2:
	for attempt in 12:
		var yy := clampi(y + rng.randi_range(-3, 3), 1, L - 2)
		var x := centers[yy] + side * (widths[yy] + rng.randf_range(off_min, off_max))
		var p := Vector2(x, yy + 0.5)
		if zone_ok(zone, p) and not occ(int(p.x), int(p.y)):
			return p
	return Vector2(-1, -1)


func _make_wildlife() -> void:
	var y := 8
	while y < L - 20:
		y += rng.randi_range(5, 9)
		var side := -1 if rng.randf() < 0.5 else 1
		var roll := rng.randf()
		if roll < 0.22:
			var p := _find(y, "water", side, -2.5, -1.0)
			if p.x < 0:
				continue
			var mom := _critter("duck", p, "water", {"radius": 3.0})
			var mi := critters.size() - 1
			for i in rng.randi_range(2, 5):
				_critter("duckling", p + Vector2(0, 0.3 * (i + 1)), "water", {"leader": mi, "slot": i})
		elif roll < 0.32:
			var p := _find(y, "shallow", side, -1.0, -0.2)
			if p.x > 0:
				_critter("heron", p, "shallow", {"radius": 1.5})
		elif roll < 0.42:
			var p := _find(y, "bank", side, 0.3, 1.2)
			if p.x > 0 and not _near_town(y, 9):
				var look := _person_look()
				look.still = true
				look.face = -side
				_critter("fisher", p, "bank", look)
		elif roll < 0.54:
			var p := _find(y, "forest", side, 3.0, 9.0)
			if p.x > 0 and not _near_town(y, 10):
				for i in rng.randi_range(1, 3):
					_critter("deer", p + Vector2(rng.randf_range(-1, 1), rng.randf_range(-1, 1)), "forest", {"radius": 4.0, "antlers": i == 0 and rng.randf() < 0.6})
		elif roll < 0.66:
			var p := _find(y, "meadow", side, 2.0, 10.0)
			if p.x > 0 and not _near_town(y, 9):
				var kind: String = pick(["sheep", "sheep", "cow", "goat"])
				for i in rng.randi_range(3, 6):
					_critter(kind, p + Vector2(rng.randf_range(-1.5, 1.5), rng.randf_range(-1.5, 1.5)), "meadow", {"radius": 3.5})
		elif roll < 0.78:
			var p := _find(y, "land", side, 1.5, 8.0)
			if p.x > 0:
				_critter(pick(["rabbit", "rabbit", "fox", "hedgehog"]), p, "land", {"radius": 3.0})
		elif roll < 0.86:
			var p := _find(y, "land", side, 1.0, 5.0)
			if p.x > 0:
				for i in 3:
					_critter("butterfly", p, "air", {"radius": 2.5, "c": pick([Color("#f2f2f2"), Color("#f2a03c"), Color("#7fb0f0"), Color("#e87fb0")])})
		elif roll < 0.92:
			var p := _find(y, "water", side, -3.5, -2.0)
			if p.x > 0:
				var look := _person_look()
				look.radius = 6.0
				_critter("rowboat", p, "water", look)
		elif roll < 0.97:
			var p := _find(y, "water", side, -3.0, -1.0)
			if p.x > 0:
				_critter("otter", p, "water", {"radius": 3.0})
	for lk in lakes:
		for i in 2:
			var p := _find(int(lk.y), "water", -1 if i == 0 else 1, -5.0, -2.5)
			if p.x > 0:
				_critter("swan", p, "water", {"radius": 3.0})
