import type { WordEntry } from './words'

export interface Category {
  id: string
  label: string
  words: WordEntry[]
}

function cat(id: string, label: string, words: string, glosses: Record<string, string> = {}): Category {
  return {
    id,
    label,
    words: words
      .trim()
      .split(/\s+/)
      .map((word) => (glosses[word] ? { word, gloss: glosses[word] } : { word })),
  }
}

/**
 * Category-day themes. Every word is five letters; a word lives in one theme only, so
 * the shared pool (see rules/category.ts) never repeats until all of it has been played.
 */
export const CATEGORIES: Category[] = [
  cat(
    'ng-places',
    'Nigerian places',
    `LAGOS ABUJA ENUGU BENIN WARRI AKURE MINNA ASABA NNEWI ZARIA GOMBE IKEJA LAFIA DUTSE OKENE
     BENUE BORNO EKITI KWARA KEBBI LEKKI IKOYI IJEBU ILESA APAPA OBUDU BONNY GUSAU`,
    {
      LAGOS: 'Nigeria’s biggest city and commercial heart.',
      ABUJA: 'The federal capital, built in the 1980s.',
      ENUGU: 'The “Coal City”, capital of Enugu State.',
      BENIN: 'Benin City, home of the historic Benin Kingdom.',
      WARRI: 'Oil city in Delta State, famous for its humour.',
      AKURE: 'Capital of Ondo State.',
      MINNA: 'Capital of Niger State.',
      ASABA: 'Capital of Delta State, on the River Niger.',
      NNEWI: 'Industrial town in Anambra State.',
      ZARIA: 'Ancient city in Kaduna State.',
      GOMBE: 'Capital of Gombe State.',
      IKEJA: 'Capital of Lagos State.',
      LAFIA: 'Capital of Nasarawa State.',
      DUTSE: 'Capital of Jigawa State.',
      OKENE: 'Town in Kogi State.',
      BENUE: 'North-central state named after the Benue River.',
      BORNO: 'North-eastern state; capital Maiduguri.',
      EKITI: 'South-western state; capital Ado-Ekiti.',
      KWARA: 'North-central state; capital Ilorin.',
      KEBBI: 'North-western state; capital Birnin Kebbi.',
      LEKKI: 'Peninsula in Lagos known for beaches and new estates.',
      IKOYI: 'Upscale Lagos island neighbourhood.',
      IJEBU: 'Yoruba region in Ogun State, home of Ijebu-Ode.',
      ILESA: 'Historic town in Osun State.',
      APAPA: 'Lagos district home to the main seaport.',
      OBUDU: 'Cross River town known for its cattle-ranch resort.',
      BONNY: 'Island town in Rivers State, an LNG hub.',
      GUSAU: 'Capital of Zamfara State.',
    },
  ),
  cat('ng-food', 'Nigerian food', 'AMALA GARRI EGUSI AKARA OGIRI OFADA AGIDI EKURU KOSAI EWEDU BANGA AFANG KPOMO SHAKI', {
    AMALA: 'Yoruba swallow made from yam flour.',
    GARRI: 'Toasted cassava granules — soaked or made into eba.',
    EGUSI: 'Melon seeds, ground into a rich soup.',
    AKARA: 'Deep-fried bean cakes.',
    OGIRI: 'Fermented seasoning from oil seeds.',
    OFADA: 'Local unpolished rice, served with spicy ayamase stew.',
    AGIDI: 'Firm corn-starch pudding, wrapped in leaves.',
    EKURU: 'Steamed white bean pudding, a Yoruba favourite.',
    KOSAI: 'The Hausa name for akara, fried bean cakes.',
    EWEDU: 'Silky jute-leaf soup, eaten with amala.',
    BANGA: 'Palm-fruit soup from the Niger Delta.',
    AFANG: 'Vegetable soup from Cross River and Akwa Ibom.',
    KPOMO: 'Cooked cow skin.',
    SHAKI: 'Tripe — a favourite in stews and pepper soup.',
  }),
  cat(
    'mammals',
    'Mammals',
    `TIGER ZEBRA HORSE SHEEP CAMEL LLAMA KOALA PANDA OTTER HYENA BISON MOOSE SKUNK SLOTH LEMUR MOUSE
     RHINO HIPPO TAPIR DINGO CHIMP OKAPI ELAND STOAT SHREW BURRO SWINE STEER FILLY KITTY PUPPY BUNNY HOUND`,
  ),
  cat('birds', 'Birds', 'EAGLE RAVEN ROBIN STORK HERON FINCH QUAIL GOOSE EGRET MACAW GREBE SNIPE CHICK MYNAH EIDER JUNCO VIREO PIPIT DRAKE'),
  cat('sea', 'Sea life', 'WHALE SHARK SQUID TROUT PERCH GUPPY PRAWN KRILL BREAM SMELT SPRAT MANTA CONCH WHELK POLYP ALGAE'),
  cat('creatures', 'Reptiles and bugs', 'GECKO SNAKE COBRA VIPER ADDER MAMBA SKINK KRAIT AGAMA MIDGE LOUSE APHID LARVA LEECH'),
  cat('fruit-veg', 'Fruit and veg', 'APPLE MANGO LEMON GRAPE MELON GUAVA BERRY CAROB PRUNE ONION CHARD MAIZE CHILI GOURD CRESS SWEDE CHIVE'),
  cat(
    'food',
    'Food and drink',
    `TOAST BROTH STEAK PASTA PIZZA BAGEL SALAD SAUCE GRAVY BREAD DOUGH FLOUR SUGAR HONEY CANDY JUICE SUSHI
     CURRY DONUT CREPE SCONE FUDGE WAFER JELLY LATTE MOCHA RAMEN NACHO PILAF KEBAB SALSA PESTO GUMBO BACON
     SYRUP CIDER LAGER STOUT GRUEL GOUDA SHAKE VODKA TONIC`,
  ),
  cat('spices', 'Herbs and spices', 'BASIL THYME CUMIN CLOVE ANISE SUMAC CAPER SPICE'),
  cat(
    'house',
    'Around the house',
    `COUCH CHAIR TABLE SHELF STOOL CLOCK DRAPE BLIND DUVET SHEET QUILT BENCH STAIR TOWEL BROOM KNIFE SPOON
     PLATE LADLE WHISK GRILL STOVE SIEVE TONGS APRON MIXER FLASK HEDGE FENCE ATTIC PATIO PORCH FOYER`,
  ),
  cat(
    'buildings',
    'Buildings and places',
    `CABIN LODGE MANOR VILLA HOTEL HOUSE CONDO HUTCH IGLOO TEPEE TOWER SHACK MOTEL ABBEY ARENA STORE DINER
     PLAZA DEPOT COURT KIOSK CRYPT VAULT SALON LOBBY ALLEY BOOTH`,
  ),
  cat(
    'clothes',
    'Clothes and fabrics',
    `SHIRT SCARF DRESS SKIRT JEANS PANTS SOCKS BOOTS SHOES CLOAK SMOCK TUNIC SAREE GLOVE BERET TIARA PURSE
     BEADS PARKA DENIM SATIN TWEED SUEDE NYLON LYCRA RAYON CHINO KHAKI PLAID CLOGS PUMPS HEELS`,
  ),
  cat(
    'body',
    'The human body',
    `HEART BRAIN MOUTH TOOTH THUMB ELBOW WRIST CHEST CHEEK SPINE ANKLE LIVER LUNGS COLON SKULL TORSO BELLY
     NAVEL THIGH PUPIL ORGAN GLAND NERVE BLOOD SWEAT TEARS BOWEL AORTA FEMUR TIBIA WAIST`,
  ),
  cat(
    'jobs',
    'Jobs and roles',
    `NURSE PILOT JUDGE BAKER CLERK COACH GUARD GUIDE RIDER SCOUT TUTOR VICAR MAYOR NANNY MEDIC MINER MASON
     AGENT ACTOR CHIEF COMIC DIVER USHER VALET CADET ENVOY SMITH RABBI MAJOR NINJA`,
  ),
  cat('instruments', 'Musical instruments', 'PIANO FLUTE CELLO VIOLA BANJO DRUMS SITAR BUGLE KAZOO CHIME TABLA SYNTH'),
  cat(
    'music',
    'Music and dance',
    `TEMPO CHORD TENOR BLUES DISCO TANGO WALTZ POLKA SAMBA RUMBA MAMBO LIMBO VOCAL LYRIC VERSE INTRO REMIX
     RHYME APALA OPERA CHOIR`,
  ),
  cat(
    'sport',
    'Sports and games',
    `RUGBY CHESS DARTS BOWLS RELAY PADEL KAYAK RALLY RACER BATON CHAMP BOGEY LAYUP SCRUM SMASH DEUCE BIKER
     DERBY STUDS SHOOT POKER BINGO CARDS RUMMY WHIST GAMER TEDDY`,
  ),
  cat('weather', 'Weather', 'STORM SLEET SNOWY WINDY FOGGY MISTY HUMID FLOOD OZONE BALMY MUGGY SOGGY CHILL RAINY SUNNY FROST'),
  cat(
    'land',
    'Landscapes',
    `RIVER OCEAN BEACH COAST SHORE CLIFF RIDGE MARSH SWAMP CREEK BROOK DELTA GORGE BUTTE DUNES OASIS TAIGA
     WOODS GROVE GLADE ISLET ATOLL BAYOU FJORD INLET HEATH SCRUB SAHEL SANDY MUDDY`,
  ),
  cat(
    'plants',
    'Plants and trees',
    `MAPLE CEDAR BIRCH ASPEN ALDER LARCH HAZEL ROWAN LILAC DAISY TULIP LOTUS PEONY POPPY ASTER PANSY THORN
     BRIAR SHRUB BLOOM PETAL LEAFY SPORE CACTI AGAVE YUCCA BALSA EBONY IROKO HOLLY HENNA SEDGE BOUGH ACORN`,
  ),
  cat(
    'colours',
    'Colours',
    `BLACK WHITE GREEN BROWN AMBER IVORY CORAL OLIVE MAUVE BEIGE TAUPE OCHRE AZURE PEACH CREAM SEPIA UMBER
     SABLE TOPAZ BLUSH ASHEN`,
  ),
  cat(
    'science',
    'Space and science',
    `COMET ORBIT SOLAR LUNAR VENUS PLUTO TITAN ROVER PROBE ALIEN ORION QUARK BOSON IONIC OXIDE ETHER XENON
     RADON ARGON BORON ALLOY MAGMA QUAKE GENES VIRUS LIPID AMINO JOULE PRISM RADAR SONAR HELIX`,
  ),
  cat(
    'countries',
    'Countries',
    `CHINA INDIA JAPAN KENYA GHANA CHILE EGYPT ITALY SPAIN NEPAL SUDAN NIGER LIBYA MALTA QATAR YEMEN SYRIA
     HAITI TONGA SAMOA GABON CONGO WALES NAURU PALAU BURMA KOREA`,
  ),
  cat(
    'cities',
    'Cities of the world',
    `PARIS TOKYO DUBAI DELHI MILAN CAIRO ACCRA DAKAR TUNIS RABAT SEOUL MIAMI PERTH OSAKA KYOTO QUITO HANOI
     DHAKA MECCA SOFIA TURIN BASEL GENOA ESSEN LEEDS TAMPA`,
  ),
  cat(
    'tech',
    'Tech terms',
    `CACHE PIXEL QUERY STACK ARRAY CLOUD LOGIC DEBUG PROXY TOKEN MODEL LINUX MACRO ROUTE BYTES EMAIL LOGIN
     ADMIN INPUT CLICK EMOJI TWEET VIRAL CODER REACT GRAPH INDEX PATCH MERGE CLONE SHELL ROBOT LASER MODEM`,
  ),
  cat(
    'money',
    'Money and fintech',
    `NAIRA STAKE BONDS ASSET YIELD LOANS PRICE TRADE SHARE COINS DEBIT TAXES WAGES MONEY RATES SALES STOCK
     FUNDS SAVER DEBTS PESOS EUROS RUPEE DINAR FRANC KRONA POUND BUCKS CENTS AUDIT QUOTA BONUS WAGER LOTTO
     PAYEE PAYER`,
  ),
  cat(
    'transport',
    'Getting around',
    `TRAIN TRUCK WAGON YACHT CANOE PLANE MOPED SEDAN COUPE LORRY FERRY BARGE LINER SLOOP SKIFF BLIMP METRO
     TRIKE BUGGY MOLUE PEDAL WHEEL BRAKE TYRES GEARS MOTOR DRONE`,
  ),
  cat(
    'feelings',
    'Feelings',
    `HAPPY ANGRY PROUD JOLLY MERRY SULKY MOODY TENSE DREAD ANGST GLOOM BLISS SHAME GUILT GREED LOVED JUMPY
     WEARY TIRED BORED UPSET TEARY SHOCK PANIC MIRTH ARDOR PERKY SASSY IRATE LIVID FUSSY TIMID CRAZY GIDDY`,
  ),
  cat(
    'actions',
    'Action words',
    `CRAWL DODGE TWIRL WHIRL STOMP SHOVE PUNCH KNOCK BLINK GLARE SNIFF SNORE COUGH GROAN CHANT KNEEL AWAKE
     SWOOP GLIDE HOVER SURGE FLING GRASP PINCH SWEEP WRING SPILL SPRAY THROW CATCH`,
  ),
  cat(
    'numbers',
    'Numbers and measures',
    `SIXTY FORTY FIFTY NINTH FIFTH SIXTH TENTH FIRST THIRD TWICE DOZEN RATIO DIGIT MINUS TIMES SLOPE METER
     LITRE OUNCE TONNE HERTZ RADII TORUS SEVEN THREE EIGHT`,
  ),
  cat(
    'myth',
    'Myths and magic',
    `DEMON TROLL GNOME ELVES FAIRY PIXIE DWARF WITCH CURSE TAROT RUNES GOLEM HYDRA SIREN NYMPH GENIE DJINN
     MUMMY GHOUL SPOOK TOTEM RELIC GRAIL LANCE MAGIC GHOST GIANT SWORD`,
  ),
  cat(
    'words',
    'Books and words',
    `ESSAY EXAMS LUNCH LATIN MATHS ATLAS PROSE FABLE NOVEL VOWEL IDIOM SLANG COMMA QUILL PSALM GENRE MANGA
     HAIKU STORY TITLE QUOTE`,
  ),
  cat(
    'materials',
    'Materials and gems',
    `STEEL STONE GLASS METAL PAPER CLOTH BRICK PLANK RESIN VINYL LATEX FIBRE GROUT PUTTY BRASS AGATE BERYL
     GEODE FLINT SHALE GLAZE STAIN PASTE TWINE STRAW PEARL JEWEL`,
  ),
  cat('tools', 'Tools and DIY', 'DRILL CLAMP SCREW RIVET LATHE SPADE SHEAR MOWER VALVE HINGE LATCH WEDGE LEVER WINCH HOIST ANVIL SPOOL'),
  cat(
    'describing',
    'Describing words',
    `HAIRY ITCHY JUICY LUMPY MESSY NASTY NOISY PETTY ROUGH SALTY SHINY SILKY SLIMY SMOKY SOAPY SPICY TASTY
     WITTY ZESTY BOSSY DENSE FANCY LOOSE STALE STIFF TIGHT TOUGH VAGUE WOODY CRUEL SILLY FUNNY DIRTY HANDY
     HEFTY LANKY LEAKY ROWDY RUSTY SHAKY TACKY TIPSY WACKY WEIRD ZIPPY BULKY FISHY GAUDY GRIMY GUSTY JAZZY
     LOFTY MOSSY MUSTY NUTTY PEPPY PUFFY ROOMY SEEDY SHADY SPIKY STONY TANGY TEENY WOOZY YUMMY`,
  ),
  cat(
    'cooking',
    'Cooking and eating',
    `SAUTE POACH STEAM BROIL FRIES GRATE SLICE DICED MINCE KNEAD BASTE BRINE SCALD SHRED PUREE SCOOP MUNCH
     SLURP SMOKE ROAST CRUMB BLEND SERVE TASTE FEAST`,
  ),
  cat(
    'people',
    'Family and people',
    'NIECE TWINS BRIDE GROOM WIDOW ELDER TEENS MADAM MAMMA DADDY BUDDY RIVAL GROUP FOLKS UNCLE CHILD YOUTH ADULT GUEST CROWD TRIBE',
  ),
  cat(
    'office',
    'Office life',
    'MEMOS FILES STAFF PHONE SHIFT UNION BOARD CHART SLIDE PRINT STAMP CLIPS TONER PITCH BRIEF DEALS TASKS GOALS LEADS PERKS LEAVE PROMO',
  ),
  cat('health', 'Health', 'DOSES PILLS SALVE SERUM FEVER SCARS SLING GAUZE SWABS SCANS DIETS SAUNA REHAB PULSE ACHES CRAMP COLIC MUMPS ULCER'),
  cat(
    'travel',
    'Travel',
    'VISAS TOURS TRIPS GATES CASES PACKS TENTS CAMPS HIKER TREKS LOCAL EXPAT AISLE SEATS BERTH DECKS PORTS DOCKS PIERS QUAYS TRAIL',
  ),
  cat('royalty', 'Royalty and titles', 'QUEEN ROYAL REALM EMIRS TSARS BARON DUKES EARLS LORDS DAMES KNAVE PAGES REIGN REGAL ROBES HEIRS OLORI', {
    OLORI: 'Yoruba for a queen, the wife of an Oba.',
  }),
  cat(
    'sounds',
    'Sounds',
    `CHIRP HOWLS GROWL PURRS BARKS BLEAT NEIGH OINKS QUACK CROAK ROARS SNORT CLANG CLANK CLINK THUMP WHOOP
     BEEPS CREAK TWANG BOOMS WHIRR BLARE TOOTS HONKS SNAPS CRASH`,
  ),
  cat(
    'arts',
    'Arts and hobbies',
    'EASEL MURAL WEAVE CARVE MOVIE PROPS DECOR PAINT CRAFT DRAMA PHOTO SCENE',
  ),
]
