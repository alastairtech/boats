// The captains: affectionate parodies of famous fictional skippers. Every boat needs one.
// Stats: speed (boat speed multiplier), care (wear multiplier; lower is gentler), haggle (pay multiplier).
// Quirks: 'fogproof' ignores fog, 'stormlover' sails faster in storms, 'stormproof' isn't slowed by storms.

export const CAPTAINS = [
  {
    id: 'ahob', name: 'Captain Ahob', face: '🐋', wage: 4200, speed: 1.05, care: 1.25, haggle: 1, quirk: 'stormproof',
    bio: 'Lost a leg to a white whale called Gerald. Has mentioned Gerald in every conversation since.',
    lines: ['Has anyone seen Gerald? Big. White. Smug.', 'From hell\'s heart I deliver this {cargo}.', 'I would sail round the Horn and round the Horn again to get to {town}. Is there a Horn here?', 'The {boat} creaks. It creaks like Gerald laughing.', 'I have nailed a gold coin to the mast. Whoever sees Gerald first gets it. Also it was your coin.', 'Every barrel of {cargo} could be hiding a whale. I check them all. Personally.'],
    storm: ['A storm! Gerald is near. I can FEEL it.', 'Lash me to the mast! No, the other mast. We only have one mast? Fine.'],
    broken: ['Gerald did this.', 'The engine is fine. It is GERALD who is broken. Spiritually.'],
    paid: ['Money. Pah. It cannot buy back a leg. It can buy a nicer leg though.'],
  },
  {
    id: 'nemoh', name: 'Captain Nemoh', face: '🐙', wage: 6000, speed: 1.08, care: 0.85, haggle: 1, quirk: 'fogproof',
    bio: 'Brilliant, aloof, and quietly furious that you won\'t let him take the boat underwater.',
    lines: ['I have installed an organ in the {boat}. I will be playing it at 3am.', 'Twenty thousand leagues? We are doing about four. Disappointing.', 'The land people of {town} bore me. Their fish are nicer.', 'If you let me submerge, I could avoid all the weather. Just a thought. A rational thought.', 'I have named the engine Nautilus. It is not a Nautilus. Let me have this.', 'I eat only seaweed now. I am thriving. Do not look at me.'],
    storm: ['A storm on the surface. How quaint. Down below, it\'s perfectly calm. Just saying.'],
    broken: ['This would not happen in a submarine.'],
  },
  {
    id: 'silverfish', name: 'Long Jon Silverfish', face: '🦜', wage: 3300, speed: 1, care: 1, haggle: 1.08,
    bio: 'Cook, captain, and suspected pirate. Comes with a parrot who handles the accounts.',
    lines: ['Pieces of eight! Pieces of eight! (The parrot wants a raise.)', 'Arr, I\'m an honest sea cook now. Ask anyone. Don\'t ask the parrot.', 'I\'ve buried some of the {cargo} for safekeeping. On an island. Which island? Ha ha. Arr.', 'The parrot says the {boat} is undervalued and you should sell it to him.', 'Fifteen men on a dead man\'s chest! It\'s a game. We\'re playing it in the hold.', 'Got a map here with an X on it. Probably {town}. Probably treasure.'],
    paid: ['The parrot has counted the money twice and says it\'s all there. I believe the parrot.'],
  },
  {
    id: 'hooke', name: 'Captain Hooke', face: '🪝', wage: 2700, speed: 1, care: 1.1, haggle: 1.02,
    bio: 'Fashionably dressed. Afraid of ticking sounds. Has asked that the engine be "less tick-y".',
    lines: ['Is that a clock? Who brought a clock aboard? THROW IT OVERBOARD.', 'I do NOT trust the crocodiles of {town}. They look hungry and punctual.', 'A boy in green keeps flying over the {boat}. I\'d like it to stop.', 'Splendid hat, isn\'t it? I wore it to deliver {cargo}. The {cargo} was impressed.', 'Good form requires I deliver this cargo on time. Good form! But no clocks.'],
    broken: ['The engine went tick... tick... and I panicked and hit it with my hook. Sorry.'],
  },
  {
    id: 'sparrowhawk', name: 'Captain Jock Sparrowhawk', face: '🏴‍☠️', wage: 3600, speed: 1.15, care: 1.35, haggle: 1.05,
    bio: 'Swaggers sideways. Somehow always arrives. Nobody, including him, knows how.',
    lines: ['This is the day you will always remember as the day you ALMOST lost the {boat}.', 'I have a compass that points to what I want most. It points to {town}. Or lunch.', 'Savvy? No? Good. Neither am I.', 'Why is the {cargo} gone? Oh. Right. It\'s been delivered. Well done, me.', 'I\'ve got a jar of dirt! ...It\'s for a client in {town}.', 'Captain. CAPTAIN Jock Sparrowhawk. Please update the paperwork.'],
    storm: ['Lovely weather for a bit of improvised navigation!'],
    broken: ['I may have steered into a pier. Or the pier steered into me. Investigations ongoing.'],
  },
  {
    id: 'kork', name: 'Captain Jim T. Kork', face: '🖖', wage: 4800, speed: 1.1, care: 1, haggle: 1.03,
    bio: 'Bold explorer of strange new towns. Has never met a local official he couldn\'t charm.',
    lines: ['Captain\'s log, stardate... Tuesday. We are... approaching {town}.', 'To boldly go where no mail boat... has gone... before.', 'I don\'t believe in the no-win scenario. Or in waiting for a full load.', 'I have fallen in love with the harbourmaster at {town}. Again.', 'My shirt has torn. Dramatically. During loading.', 'Ship\'s engineer says she cannae take much more. We have no engineer. I said it myself, in an accent.'],
    storm: ['Shields up! We don\'t have shields. Umbrellas up!'],
    broken: ['Engine room, I need more power! ...We have no engine room either, do we.'],
  },
  {
    id: 'pickard', name: 'Captain Jean-Lucas Pickard', face: '🫖', wage: 5400, speed: 1, care: 0.75, haggle: 1.04,
    bio: 'Diplomatic, careful, deeply serious about tea. Will recite Shakespeare to the cargo.',
    lines: ['Tea. Earl Grey. Hot. ...Why does nobody on this boat know how to make tea?', 'Make it so. Make it so to {town}.', 'I have read the {cargo} a sonnet. I believe it was moved.', 'There are four lights. On the jetty. I counted.', 'Number One, engage. We don\'t have a Number One. Engage anyway.', 'I have a ready room now. It is a cupboard with a chair.'],
    storm: ['Steady as she goes. And somebody please secure the teapot.'],
    paid: ['The economics of the future are somewhat different. But I will take the money.'],
  },
  {
    id: 'jayneway', name: 'Captain Kathryn Jayneway', face: '☕', wage: 5100, speed: 1.06, care: 0.85, haggle: 1.02,
    bio: 'Runs on coffee and the conviction she\'ll get her crew home. Home is wherever the cargo goes.',
    lines: ['There\'s coffee in that nebula. I mean that cloud. I mean, has anyone got coffee?', 'We\'re seventy thousand light years from home. Or seven kilometres from {town}. Similar vibes.', 'I will get this {cargo} home if it takes seven years.', 'Set a course... for home. And by home I mean {town}.', 'I made a deal with a local trader. It was a bad deal. I regret nothing.'],
    broken: ['Reroute power from the... from the... kettle. Fine. No coffee. Just get us moving.'],
  },
  {
    id: 'halibut', name: 'Captain Archie Halibut', face: '🧔', wage: 2400, speed: 0.95, care: 1.05, haggle: 1,
    bio: 'Short-tempered, big-hearted, and owner of the most creative insults on the seven seas.',
    lines: ['Thundering thimbles! Who put the {cargo} on my hat?', 'Ten thousand tangled trawlers! {town} again?', 'Bashi-bazouks! Barnacle-brained barge-botherers!', 'I have sworn off grog. I have sworn at the grog. Different things.', 'A young reporter with a quiff and a little white dog keeps stowing away. Is that normal?', 'Jumping jellyfish! The {boat} is GORGEOUS today.'],
    storm: ['Billowing bilge-buckets! Hold on to your trousers!'],
    broken: ['Coconut-crunching cog-wobblers! The engine\'s gone!'],
  },
  {
    id: 'quintessential', name: 'Captain Quint-Essential', face: '🦈', wage: 3000, speed: 1, care: 1.15, haggle: 1.06,
    bio: 'Grizzled shark hunter. Scrapes his nails down the chalkboard before every route meeting.',
    lines: ['We\'re going to want a larger vessel.', 'I\'ll deliver your {cargo} for you, but I\'ll want ten thousand for it. Each way.', 'Y\'know the thing about a shark? Nah. Never mind. Load the {cargo}.', 'I\'ve sung a sea shanty about {town}. It\'s nine hours long.', 'Here\'s to swimmin\' with bow-legged women. And on-time deliveries.'],
    paid: ['Proper money. Now let\'s go find a bigger boat to spend it on.'],
  },
  {
    id: 'bligh', name: 'Captain Blighty', face: '🍞', wage: 2100, speed: 1.04, care: 0.95, haggle: 0.97,
    bio: 'Cheap, strict and deeply suspicious of his crew. The crew is a man called Derek.',
    lines: ['I sense mutiny. Derek, are you mutinying?', 'Breadfruit! We should be carrying breadfruit. Why aren\'t we carrying breadfruit?', 'Rations are cut to half a biscuit. Morale is excellent. Derek?', 'Last time I was set adrift in a rowing boat I still made it to {town}. Don\'t test me.', 'Derek has been asking about "wages" again. I have locked him in the hold with the {cargo}.'],
    storm: ['A storm! Derek, stop cheering.'],
  },
  {
    id: 'squawk', name: 'Captain Squawk', face: '🐦', wage: 1800, speed: 1, care: 1, haggle: 0.95,
    bio: 'A parrot. Holds a valid captain\'s licence. Nobody can work out how. Wage paid in crackers.',
    lines: ['SQUAWK! {town}! SQUAWK!', 'Pretty boat. Pretty boat. Pretty {boat}.', 'Pieces of eight. Pieces of {cargo}.', 'Who\'s a good captain? Who\'s a good captain? SQUAWK.', '*bites the ship\'s wheel*', 'Cracker. Cracker. Cracker. Profit. Cracker.'],
    storm: ['SQUAWK! SQUAWK! SQUAAAAWK!'],
    broken: ['*has eaten an important wire*'],
  },
  {
    id: 'smythe', name: 'Captain Ed Smythe', face: '🧊', wage: 3900, speed: 1.12, care: 1.3, haggle: 1,
    bio: 'Calm, distinguished, and extremely relaxed about obstacles. Insists his boats are unsinkable.',
    lines: ['Full speed ahead. Ice? There\'s no ice in an archipelago. Probably.', 'The {boat} is unsinkable. I\'ve said it in writing.', 'The band will play on. We don\'t have a band. I am humming.', 'Lifeboats are a cluttering eyesore. I have removed them to make room for {cargo}.', 'Lovely calm night. Absolutely nothing could go wrong.'],
    broken: ['A minor scrape. Mostly cosmetic. Possibly the iceberg\'s fault.'],
  },
  {
    id: 'adamant', name: 'Admiral Bill Adamant', face: '🛰️', wage: 5700, speed: 1.02, care: 0.8, haggle: 1.02,
    bio: 'Gruff old soldier leading a ragtag fleet across hostile waters. The waters are not that hostile.',
    lines: ['So say we all. Say it. All of you. Derek, say it.', 'We are on a quest to find a mythical place called {town}. It is on the map. It\'s still a quest.', 'Action stations! Sorry. Habit. Carry on loading.', 'Nobody is ever to call this boat "a tub" again.', 'I suspect one of the crew is a robot. I\'ve asked them all to sneeze.'],
    storm: ['All hands, brace for weather. And keep an eye on the toaster.'],
  },
  {
    id: 'malrentals', name: 'Captain Mal Rentals', face: '🤠', wage: 3600, speed: 1.08, care: 1.15, haggle: 1.1,
    bio: 'Takes any job, asks no questions, and wears a long brown coat in all weathers.',
    lines: ['This job\'s gone sideways. No. Wait. It\'s fine. Smooth as silk.', 'We do the job, we get paid. That\'s the only plan I\'ve got. It\'s a good plan.', 'If anybody gets nosy in {town}, just... y\'know. Shoot. Ha. I mean "wave".', 'Took us a while to get here, but we got here. That\'s what we do.', 'The {boat}\'s held together with string and hope, and she\'s the best boat in the \'verse.', 'Kaylee says the engine\'s got moods. We don\'t have a Kaylee. The engine says it.'],
    paid: ['We got paid! In actual money! This never happens.'],
  },
  {
    id: 'soloman', name: 'Han Soloman', face: '🚀', wage: 4500, speed: 1.18, care: 1.25, haggle: 1.04, quirk: 'stormlover',
    bio: 'Smuggler turned honest-ish boatman. Brags about delivery times in units of distance.',
    lines: ['Made the {town} run in under twelve parsecs.', 'She may not look like much, but the {boat}\'s got it where it counts.', 'Never tell me the odds. Especially the cargo insurance odds.', 'I\'ve got a bad feeling about this. Oh, that\'s just the {cargo}.', 'My first mate is extremely hairy and only growls. Very good at loading though.', 'Hey, it\'s not my fault! ...What did I do?'],
    storm: ['A storm? Punch it!'],
    broken: ['Hit it. No, harder. HIT IT. ...Okay, that did nothing. Call a mechanic.'],
  },
  {
    id: 'archibald', name: 'Captain Archibald Archer', face: '🐶', wage: 2800, speed: 1, care: 0.9, haggle: 1,
    bio: 'Earnest pioneer. Brings his beagle everywhere. The beagle is the real brains of the outfit.',
    lines: ['The beagle has approved this route.', 'The beagle has NOT approved this route. We\'re going anyway.', 'First boat to visit {town} with a beagle aboard! History!', 'Porthos ate some of the {cargo}. I\'ll pay for it. No I won\'t, you will.', 'Decontamination is a thing we do now. After every port. It\'s mostly hosing.'],
  },
  {
    id: 'queasy', name: 'Lt. Cdr. Queasy', face: '🍓', wage: 2200, speed: 0.97, care: 0.9, haggle: 1.03,
    bio: 'Meticulous to a fault. Rolls two steel balls in one hand. Currently investigating missing strawberries.',
    lines: ['Someone took the strawberries. I have proof. Geometric proof.', '*clack clack clack* I am rolling my steel balls. It calms me. *clack*', 'I will be conducting an inquiry into the {cargo}. Nobody leaves {town}.', 'Everything aboard the {boat} is shipshape. EXCEPT the STRAWBERRIES.', 'I have charted a course. It is precise. It is correct. Everybody else was wrong.'],
    storm: ['This storm is clearly sabotage.'],
  },
  {
    id: 'hornblower', name: 'Captain Horatio Hornblower-Tuba', face: '🎺', wage: 4400, speed: 1.05, care: 0.85, haggle: 1.02,
    bio: 'A brilliant naval tactician, wasted on cargo. Practises the tuba at dawn to keep his lip in.',
    lines: ['*plays a long, sad note on the tuba*', 'I have outmanoeuvred a fishing boat. It was not trying. I count it anyway.', 'Prepare to broadside {town}! With mail. Prepare to deliver mail.', 'A gentleman never runs from a fight. He sails from it at a respectable eleven knots.', 'Seasick again. Every voyage. Do not tell the admiralty.'],
    storm: ['Strike the topsails! We have no topsails. Strike something.'],
  },
  {
    id: 'marlowe', name: 'Captain Marlowe', face: '🌿', wage: 3200, speed: 0.98, care: 1, haggle: 1, quirk: 'fogproof',
    bio: 'Has been upriver. Doesn\'t like to talk about it. Talks about it constantly.',
    lines: ['The river goes deeper. It always goes deeper.', 'The horror. The horror. Oh no, it\'s just the loading paperwork.', 'Up past {town} the jungle closes in... no, it\'s fields. Nice fields.', 'I met a man upriver. He had opinions about ivory. I had opinions about him.', 'The {cargo} is quiet tonight. Too quiet.'],
  },
  {
    id: 'starbuck', name: 'First Mate Starbuck (Acting Captain)', face: '🧋', wage: 2600, speed: 1, care: 0.8, haggle: 1,
    bio: 'The only sensible person who ever sailed with Captain Ahob. Would like to deliver cargo calmly, please.',
    lines: ['I\'d like one voyage. Just one. Without anyone screaming about a whale.', 'Have we considered... not chasing things? Just delivering {cargo}?', 'I\'ve opened a coffee stall at {town}. It\'s doing very well, thanks.', 'Steady. Reasonable. On time. That\'s my whole brand.', 'If Ahob calls on the radio, I\'m not here.'],
  },
  {
    id: 'spork', name: 'Science Officer Spork', face: '🍴', wage: 4000, speed: 1.02, care: 0.8, haggle: 1.06,
    bio: 'Logical, precise and baffled by humans. Captaincy was assigned by a clerical error.',
    lines: ['Fascinating.', 'The route to {town} is the most logical one. I have checked. Four hundred times.', 'I find your loading practices... illogical. But efficient.', 'The needs of the many outweigh the needs of the {cargo}.', 'Eyebrow raised at 37 degrees. It indicates mild interest.', 'Live long and deliver.'],
    storm: ['The probability of getting wet is 100 percent. Proceed.'],
  },
  {
    id: 'cuttle', name: 'Captain Ned Cuttle', face: '🦑', wage: 2000, speed: 0.95, care: 0.95, haggle: 0.98,
    bio: 'Kindly old salt who gives advice nobody asked for. Makes notes of everything. On his hook.',
    lines: ['When found, make a note of. I made a note of {town}.', 'Overhaul the catechism, my lad, and there you\'ll find... no idea.', 'Stand by! Stand by for... I forget. Something important.', 'A wise man once said "deliver the {cargo}". It was me. I said it just now.'],
  },
  {
    id: 'fishfinger', name: 'Admiral Fishfinger', face: '🐟', wage: 3300, speed: 1, care: 0.9, haggle: 1.12,
    bio: 'White-bearded, kindly and suspiciously keen on breaded fish products. Excellent salesman.',
    lines: ['Golden, crispy, delivered on time.', 'I\'ve never met a fish I couldn\'t sell. Some of them breaded.', 'The children of {town} love me. Their parents are wary.', 'Shall I tell you about my frozen food range? No? Next time.', 'Ahoy! The {boat} smells faintly of batter. It\'s me. It\'s fine.'],
    paid: ['Lovely money. Crisp, golden money.'],
  },
  {
    id: 'barbosso', name: 'Captain Barbosso', face: '🍏', wage: 3900, speed: 1.06, care: 1.1, haggle: 1.07, quirk: 'stormlover',
    bio: 'Cursed. Can\'t taste anything. Eats green apples anyway, out of spite.',
    lines: ['You best start believing in cargo boats. You\'re on one.', 'The code is more what you\'d call "guidelines". Including the shipping code.', '*eats an apple menacingly*', 'Under the moonlight I turn into a skeleton. The crew doesn\'t mind. Saves on uniforms.', 'I\'ve been to {town}. Hated it. Going again.'],
    storm: ['HAR! Now THIS is sailing weather!'],
  },
];

export const CAPTAIN = Object.fromEntries(CAPTAINS.map((c) => [c.id, c]));

// Lines anyone can say, used to add variety.
export const GENERIC = {
  lines: ['The {boat} is running beautifully. Touch wood. Touch any wood. Quick.', 'Saw a seagull eat another seagull near {town}. Bad omen? Good omen? Who knows.', 'Requesting permission to name a barrel of {cargo}. I\'ve already named it. It\'s Brian.'],
  storm: ['Bit choppy out here.', 'Batten the hatches! Which ones are the hatches?'],
  broken: ['Something went clunk. Then something went whirr. Then nothing went anything.'],
  paid: ['Payday! I\'ll be buying a hat.'],
};

export const QUIRK_TEXT = {
  fogproof: 'Not slowed by fog',
  stormproof: 'Not slowed by storms',
  stormlover: 'Faster in storms',
};

export function captainLine(c, kind, ctx) {
  const pool = (c[kind] && Math.random() < 0.8) ? c[kind] : (kind === 'lines' ? (Math.random() < 0.85 ? c.lines : GENERIC.lines) : GENERIC[kind] || c.lines);
  const s = pool[Math.floor(Math.random() * pool.length)];
  return s.replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? '');
}

export function hireFee(c) { return Math.round(c.wage * 0.25 / 100) * 100; }
