// Curated content. Answers are hand-picked; guesses are validated against the
// much larger generated dictionary plus every word listed here.

export interface WordEntry {
  word: string
  /** Shown after the puzzle ends — a short gloss for unfamiliar vocabulary. */
  gloss?: string
  difficulty?: 1 | 2 | 3
  language?: 'en' | 'pcm' | 'yo'
  region?: string
}

/** Common English words used for Standard, Anagram, Decay, Fog and Vowel days. */
export const COMMON_ANSWERS = `
ABOUT ABOVE ACTOR ACUTE ADAPT ADMIT ADOPT ADULT AFTER AGAIN AGENT AGREE AHEAD ALARM ALBUM
ALERT ALIKE ALIVE ALLOW ALONE ALONG ALTER AMBER AMONG ANGEL ANGER ANGLE ANGRY APART APPLE
APPLY ARENA ARGUE ARISE ARMOR ARROW ASIDE ASSET AUDIO AVOID AWARD AWARE BADGE BAKER BASIC
BASIN BEACH BEARD BEAST BEGIN BEING BELOW BENCH BERRY BIRTH BLACK BLADE BLAME BLANK BLAST
BLAZE BLEND BLIND BLOCK BLOOM BOARD BOOST BOOTH BRAIN BRAND BRAVE BREAD BREAK BRICK BRIDE
BRIEF BRING BROAD BROWN BRUSH BUILD BUNCH BURST CABIN CABLE CAMEL CANDY CANOE CARGO CARRY
CATCH CAUSE CHAIN CHAIR CHALK CHARM CHART CHASE CHEAP CHECK CHEEK CHEST CHIEF CHILD CHILL
CHOIR CLAIM CLASS CLEAN CLEAR CLERK CLICK CLIFF CLIMB CLOCK CLOSE CLOTH CLOUD COACH COAST
COCOA COMET CORAL COUCH COUNT COURT COVER CRAFT CRANE CRASH CREAM CRISP CROWD CROWN CRUMB
CURVE CYCLE DAILY DAIRY DANCE DEPTH DIARY DOUGH DOZEN DRAFT DRAIN DRAMA DREAM DRESS DRIFT
DRINK DRIVE EAGER EAGLE EARLY EARTH EIGHT ELBOW EMPTY ENJOY ENTRY EQUAL ERROR EVENT EXACT
EXTRA FABLE FAITH FALSE FAULT FEAST FENCE FIBER FIELD FIGHT FINAL FLAME FLASH FLEET FLOAT
FLOOR FLOUR FLUTE FOCUS FORCE FORGE FRAME FRESH FRONT FROST FRUIT GHOST GIANT GLASS GLOBE
GLORY GLOVE GRACE GRADE GRAIN GRAND GRAPE GRASS GRAVY GREAT GREEN GRIEF GUARD GUESS GUEST
GUIDE HABIT HAPPY HARSH HEART HEAVY HONEY HORSE HOTEL HOUSE HUMAN HUMOR IDEAL IMAGE INDEX
INNER IVORY JEWEL JOINT JUDGE JUICE KNIFE LABEL LARGE LASER LAUGH LAYER LEARN LEMON LEVEL
LIGHT LIMIT LINEN LOGIC LOYAL LUCKY LUNAR MAGIC MAJOR MANGO MAPLE MARCH MATCH MEDAL MERCY
MERIT METAL MIGHT MINOR MODEL MONEY MONTH MORAL MOTOR MOUNT MOUSE MOUTH MUSIC NERVE NIGHT
NOBLE NOISE NORTH NOVEL NURSE OCEAN OFFER OLIVE ONION OPERA ORBIT ORDER OTHER OUTER OWNER
PAINT PANEL PAPER PARTY PATCH PEACE PEARL PHASE PHONE PHOTO PIANO PIECE PILOT PITCH PIXEL
PLACE PLAIN PLANE PLANT PLATE POINT POLAR PORCH POUND POWER PRESS PRICE PRIDE PRIME PRINT
PRIZE PROOF PROUD QUEEN QUEST QUICK QUIET QUILT QUOTE RADIO RAINY RANCH RANGE RAPID RAVEN
REACH READY REALM RELAX REPLY RIDER RIDGE RIGHT RIVER ROAST ROBIN ROBOT ROCKY ROUND ROUTE
ROYAL RULER RURAL SALAD SAUCE SCALE SCARF SCENE SCORE SCOUT SENSE SERVE SEVEN SHADE SHAPE
SHARE SHARP SHEEP SHELF SHELL SHIFT SHINE SHIRT SHORE SHORT SHOUT SIGHT SKILL SLEEP SLICE
SLIDE SMALL SMART SMILE SMOKE SNACK SNAKE SOLAR SOLID SOUND SOUTH SPACE SPARK SPEAK SPEED
SPELL SPEND SPICE SPINE SPOON SPORT SQUAD STAFF STAGE STAIR STAMP STAND STARE START STEAM
STEEL STICK STILL STONE STORE STORM STORY STOVE STRAW STUDY STYLE SUGAR SUNNY SWEET SWIFT
SWING SWORD TABLE TASTE TEACH THEME THICK THING THINK THREE THROW THUMB TIGER TIMER TITLE
TOAST TODAY TOKEN TOOTH TORCH TOTAL TOUCH TOWER TRACK TRADE TRAIL TRAIN TREAT TREND TRIAL
TRIBE TRICK TRUCK TRUST TRUTH TULIP TWIST UNCLE UNION UNITY UPPER URBAN USUAL VALUE VAPOR
VIDEO VISIT VITAL VIVID VOICE WAGON WATCH WATER WHALE WHEAT WHEEL WHITE WHOLE WORLD WORRY
WORTH WOUND WRIST WRITE YACHT YIELD YOUNG YOUTH ZEBRA
`
  .trim()
  .split(/\s+/)
  .map((word) => ({ word }))

/**
 * Naija Word Day vocabulary — Pidgin and Yoruba words in everyday Nigerian use, 4 to 6 letters.
 * Needs a native speaker's review before launch: spellings vary and meanings are simplified.
 */
const naija = (language: 'pcm' | 'yo', word: string, gloss: string): WordEntry => ({ word, gloss, language })

export const NAIJA_WORDS: WordEntry[] = [
  // Getting around and city life
  naija('yo', 'DANFO', 'The yellow minibuses of Lagos.'),
  naija('pcm', 'OKADA', 'A motorcycle taxi.'),
  naija('pcm', 'KEKE', 'A three-wheeled taxi.'),
  naija('pcm', 'MOLUE', 'The big old Lagos buses, always packed.'),
  naija('yo', 'AGBERO', 'A motor-park tout.'),
  naija('pcm', 'BUKKA', 'A local canteen serving home-style food.'),
  naija('pcm', 'NAIJA', 'Nigeria, affectionately.'),
  naija('pcm', 'OYIBO', 'A foreigner, usually a white person.'),
  naija('yo', 'JAPA', 'To leave the country for good — to “run”.'),
  naija('yo', 'IJOBA', 'The government.'),
  naija('pcm', 'KOBO', 'A hundredth of a naira.'),
  naija('yo', 'ESUSU', 'A group savings scheme where members take turns collecting.'),
  // Talk and attitude
  naija('pcm', 'ABEG', 'Please — as in “Abeg, help me.”'),
  naija('pcm', 'SABI', 'To know, or to be good at something.'),
  naija('pcm', 'WAHALA', 'Trouble or fuss.'),
  naija('pcm', 'WETIN', '“What?” — as in “Wetin dey happen?”'),
  naija('pcm', 'CHOP', 'To eat. Also: to spend freely.'),
  naija('pcm', 'GIST', 'News, gossip, or a good story.'),
  naija('pcm', 'YAWA', 'Trouble or embarrassment — “yawa don gas”.'),
  naija('pcm', 'GBAM', 'Exactly! Spot on.'),
  naija('pcm', 'WAKA', 'To walk; a journey.'),
  naija('pcm', 'PIKIN', 'A child.'),
  naija('pcm', 'SHEY', 'A question word — “Shey you go come?”'),
  naija('yo', 'JOOR', 'For emphasis — “Leave me joor.”'),
  naija('yo', 'JARE', 'A softer emphasis — “Come jare.”'),
  naija('pcm', 'YEYE', 'Nonsense; worthless.'),
  naija('pcm', 'KOLO', 'Crazy.'),
  naija('pcm', 'AMEBO', 'A gossip — or the gossip itself.'),
  naija('pcm', 'YANGA', 'Showing off; pride.'),
  naija('yo', 'OJORO', 'Cheating; foul play.'),
  naija('pcm', 'GOBE', 'Trouble; a scandal.'),
  naija('pcm', 'KASALA', 'Big trouble.'),
  naija('pcm', 'FASHI', 'Forget it; let it go.'),
  naija('pcm', 'ALAYE', 'A guy, a chap — street slang.'),
  naija('pcm', 'BOBO', 'A guy, a young man.'),
  naija('pcm', 'JAGUDA', 'A thief or pickpocket.'),
  naija('yo', 'GBESE', 'Debt — or trouble you didn’t ask for.'),
  naija('yo', 'OLODO', 'A dunce. Not a compliment.'),
  // Family and people
  naija('yo', 'OMOGE', 'A young lady.'),
  naija('yo', 'EGBON', 'An older sibling or elder.'),
  naija('yo', 'ABURO', 'A younger sibling.'),
  naija('yo', 'IBEJI', 'Twins.'),
  naija('yo', 'BABA', 'Father; an elder or respected man.'),
  naija('pcm', 'AUNTY', 'Any older woman, out of respect.'),
  // Parties and fashion
  naija('pcm', 'SHAYO', 'Drinks, the party kind.'),
  naija('yo', 'GBEDU', 'A great beat; a jam.'),
  naija('yo', 'OWAMBE', 'A big, lavish party.'),
  naija('yo', 'ASOEBI', 'Matching outfits worn by guests at a party.'),
  naija('yo', 'AGBADA', 'A flowing, wide-sleeved robe.'),
  naija('yo', 'BUBA', 'A loose blouse or top.'),
  naija('yo', 'GELE', 'A head wrap, tied high.'),
  naija('yo', 'FILA', 'A soft cap worn by men.'),
  naija('yo', 'ODUN', 'A year; a festival.'),
  // Food and drink
  naija('yo', 'AMALA', 'A swallow made from yam flour.'),
  naija('yo', 'EGUSI', 'Melon seeds, ground into a rich soup.'),
  naija('yo', 'AKARA', 'Deep-fried bean cakes.'),
  naija('yo', 'DODO', 'Fried ripe plantain.'),
  naija('pcm', 'FUFU', 'A soft, stretchy swallow, often from cassava.'),
  naija('yo', 'MOIMOI', 'Steamed bean pudding.'),
  naija('pcm', 'JOLLOF', 'Spiced tomato rice — the party favourite.'),
  naija('pcm', 'ZOBO', 'A hibiscus drink.'),
  naija('pcm', 'KUNU', 'A millet drink.'),
  naija('pcm', 'OGBONO', 'A thick soup from wild mango seeds.'),
  naija('yo', 'IYAN', 'Pounded yam.'),
  naija('pcm', 'SUYA', 'Spicy grilled meat skewers.'),
  naija('pcm', 'BOLE', 'Roasted plantain.'),
  naija('pcm', 'GARRI', 'Toasted cassava granules — soaked, or made into eba.'),
]
