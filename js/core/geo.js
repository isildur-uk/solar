/* CHART ROOM — geo.js
 * Offline gazetteer + smart geolocation. No network calls.
 * Browser: window.CRGeo. Node: module.exports.
 * Curated set: UK cities/ports, UK + European + global airports and hub cities
 * relevant to UK-facing intelligence work, plus country centroids.
 */
(function () {
  "use strict";

  function fold(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  }

  /* type: city | airport | port | country | region */
  var GAZ = [
    /* ---- UK cities & towns ---- */
    { n: "London", lat: 51.5074, lon: -0.1278, cc: "GB", t: "city" },
    { n: "Birmingham", lat: 52.4862, lon: -1.8904, cc: "GB", t: "city" },
    { n: "Manchester", lat: 53.4808, lon: -2.2426, cc: "GB", t: "city" },
    { n: "Bristol", lat: 51.4545, lon: -2.5879, cc: "GB", t: "city" },
    { n: "Leeds", lat: 53.8008, lon: -1.5491, cc: "GB", t: "city" },
    { n: "Liverpool", lat: 53.4084, lon: -2.9916, cc: "GB", t: "city" },
    { n: "Newcastle", a: ["Newcastle upon Tyne"], lat: 54.9783, lon: -1.6178, cc: "GB", t: "city" },
    { n: "Sheffield", lat: 53.3811, lon: -1.4701, cc: "GB", t: "city" },
    { n: "Nottingham", lat: 52.9548, lon: -1.1581, cc: "GB", t: "city" },
    { n: "Leicester", lat: 52.6369, lon: -1.1398, cc: "GB", t: "city" },
    { n: "Coventry", lat: 52.4068, lon: -1.5197, cc: "GB", t: "city" },
    { n: "Bradford", lat: 53.7960, lon: -1.7594, cc: "GB", t: "city" },
    { n: "Hull", a: ["Kingston upon Hull"], lat: 53.7676, lon: -0.3274, cc: "GB", t: "city" },
    { n: "Stoke-on-Trent", a: ["Stoke"], lat: 53.0027, lon: -2.1794, cc: "GB", t: "city" },
    { n: "Derby", lat: 52.9226, lon: -1.4746, cc: "GB", t: "city" },
    { n: "Plymouth", lat: 50.3755, lon: -4.1427, cc: "GB", t: "city" },
    { n: "Southampton", lat: 50.9097, lon: -1.4044, cc: "GB", t: "city" },
    { n: "Portsmouth", lat: 50.8198, lon: -1.0880, cc: "GB", t: "city" },
    { n: "Brighton", lat: 50.8225, lon: -0.1372, cc: "GB", t: "city" },
    { n: "Oxford", lat: 51.7520, lon: -1.2577, cc: "GB", t: "city" },
    { n: "Cambridge", lat: 52.2053, lon: 0.1218, cc: "GB", t: "city" },
    { n: "Reading", lat: 51.4543, lon: -0.9781, cc: "GB", t: "city" },
    { n: "Luton", lat: 51.8787, lon: -0.4200, cc: "GB", t: "city" },
    { n: "Milton Keynes", lat: 52.0406, lon: -0.7594, cc: "GB", t: "city" },
    { n: "Northampton", lat: 52.2405, lon: -0.9027, cc: "GB", t: "city" },
    { n: "Norwich", lat: 52.6309, lon: 1.2974, cc: "GB", t: "city" },
    { n: "Ipswich", lat: 52.0567, lon: 1.1482, cc: "GB", t: "city" },
    { n: "Exeter", lat: 50.7184, lon: -3.5339, cc: "GB", t: "city" },
    { n: "Bournemouth", lat: 50.7192, lon: -1.8808, cc: "GB", t: "city" },
    { n: "Swindon", lat: 51.5558, lon: -1.7797, cc: "GB", t: "city" },
    { n: "Gloucester", lat: 51.8642, lon: -2.2380, cc: "GB", t: "city" },
    { n: "Bath", lat: 51.3811, lon: -2.3590, cc: "GB", t: "city" },
    { n: "York", lat: 53.9590, lon: -1.0815, cc: "GB", t: "city" },
    { n: "Middlesbrough", lat: 54.5742, lon: -1.2350, cc: "GB", t: "city" },
    { n: "Sunderland", lat: 54.9069, lon: -1.3838, cc: "GB", t: "city" },
    { n: "Preston", lat: 53.7632, lon: -2.7031, cc: "GB", t: "city" },
    { n: "Blackpool", lat: 53.8175, lon: -3.0357, cc: "GB", t: "city" },
    { n: "Bolton", lat: 53.5769, lon: -2.4282, cc: "GB", t: "city" },
    /* Greater Manchester boroughs & NW towns (PNC/intel docs name these constantly) */
    { n: "Stockport", lat: 53.4083, lon: -2.1494, cc: "GB", t: "city" },
    { n: "Salford", lat: 53.4875, lon: -2.2901, cc: "GB", t: "city" },
    { n: "Oldham", lat: 53.5409, lon: -2.1114, cc: "GB", t: "city" },
    { n: "Rochdale", lat: 53.6097, lon: -2.1561, cc: "GB", t: "city" },
    { n: "Wigan", lat: 53.5450, lon: -2.6325, cc: "GB", t: "city" },
    { n: "Trafford", a: ["Stretford"], lat: 53.4466, lon: -2.3086, cc: "GB", t: "city" },
    { n: "Altrincham", lat: 53.3838, lon: -2.3547, cc: "GB", t: "city" },
    { n: "Ashton-under-Lyne", lat: 53.4897, lon: -2.0952, cc: "GB", t: "city" },
    { n: "Warrington", lat: 53.3900, lon: -2.5970, cc: "GB", t: "city" },
    { n: "Blackburn", lat: 53.7486, lon: -2.4842, cc: "GB", t: "city" },
    { n: "Burnley", lat: 53.7890, lon: -2.2480, cc: "GB", t: "city" },
    { n: "St Helens", a: ["Saint Helens"], lat: 53.4540, lon: -2.7370, cc: "GB", t: "city" },
    { n: "Macclesfield", lat: 53.2587, lon: -2.1268, cc: "GB", t: "city" },
    { n: "Chester", lat: 53.1934, lon: -2.8931, cc: "GB", t: "city" },
    { n: "Crewe", lat: 53.0998, lon: -2.4444, cc: "GB", t: "city" },
    /* other frequently-cited UK towns */
    { n: "Huddersfield", lat: 53.6458, lon: -1.7850, cc: "GB", t: "city" },
    { n: "Halifax", lat: 53.7248, lon: -1.8580, cc: "GB", t: "city" },
    { n: "Wakefield", lat: 53.6833, lon: -1.4977, cc: "GB", t: "city" },
    { n: "Barnsley", lat: 53.5526, lon: -1.4797, cc: "GB", t: "city" },
    { n: "Doncaster", lat: 53.5228, lon: -1.1285, cc: "GB", t: "city" },
    { n: "Rotherham", lat: 53.4302, lon: -1.3568, cc: "GB", t: "city" },
    { n: "Grimsby", lat: 53.5675, lon: -0.0815, cc: "GB", t: "city" },
    { n: "Lincoln", lat: 53.2307, lon: -0.5406, cc: "GB", t: "city" },
    { n: "Mansfield", lat: 53.1472, lon: -1.1987, cc: "GB", t: "city" },
    { n: "Chesterfield", lat: 53.2350, lon: -1.4210, cc: "GB", t: "city" },
    { n: "Peterborough", lat: 52.5695, lon: -0.2405, cc: "GB", t: "city" },
    { n: "Telford", lat: 52.6784, lon: -2.4453, cc: "GB", t: "city" },
    { n: "Shrewsbury", lat: 52.7073, lon: -2.7541, cc: "GB", t: "city" },
    { n: "Walsall", lat: 52.5862, lon: -1.9829, cc: "GB", t: "city" },
    { n: "Dudley", lat: 52.5123, lon: -2.0810, cc: "GB", t: "city" },
    { n: "Solihull", lat: 52.4118, lon: -1.7776, cc: "GB", t: "city" },
    { n: "Croydon", lat: 51.3762, lon: -0.0982, cc: "GB", t: "city" },
    { n: "Romford", lat: 51.5768, lon: 0.1801, cc: "GB", t: "city" },
    { n: "Ilford", lat: 51.5588, lon: 0.0855, cc: "GB", t: "city" },
    { n: "Enfield", lat: 51.6538, lon: -0.0799, cc: "GB", t: "city" },
    { n: "Slough", lat: 51.5105, lon: -0.5950, cc: "GB", t: "city" },
    { n: "Watford", lat: 51.6565, lon: -0.3903, cc: "GB", t: "city" },
    { n: "Basildon", lat: 51.5762, lon: 0.4886, cc: "GB", t: "city" },
    { n: "Southend-on-Sea", a: ["Southend"], lat: 51.5459, lon: 0.7077, cc: "GB", t: "city" },
    { n: "Chelmsford", lat: 51.7356, lon: 0.4685, cc: "GB", t: "city" },
    { n: "Colchester", lat: 51.8959, lon: 0.8919, cc: "GB", t: "city" },
    { n: "Maidstone", lat: 51.2720, lon: 0.5292, cc: "GB", t: "city" },
    { n: "Crawley", lat: 51.1092, lon: -0.1872, cc: "GB", t: "city" },
    { n: "Guildford", lat: 51.2362, lon: -0.5704, cc: "GB", t: "city" },
    { n: "Woking", lat: 51.3190, lon: -0.5580, cc: "GB", t: "city" },
    { n: "Basingstoke", lat: 51.2667, lon: -1.0876, cc: "GB", t: "city" },
    { n: "Salisbury", lat: 51.0688, lon: -1.7945, cc: "GB", t: "city" },
    { n: "Taunton", lat: 51.0143, lon: -3.1031, cc: "GB", t: "city" },
    { n: "Torquay", lat: 50.4619, lon: -3.5253, cc: "GB", t: "city" },
    { n: "Cheltenham", lat: 51.8994, lon: -2.0783, cc: "GB", t: "city" },
    { n: "Worcester", lat: 52.1920, lon: -2.2200, cc: "GB", t: "city" },
    { n: "Hereford", lat: 52.0565, lon: -2.7160, cc: "GB", t: "city" },
    { n: "Carlisle", lat: 54.8925, lon: -2.9329, cc: "GB", t: "city" },
    { n: "Lancaster", lat: 54.0466, lon: -2.8007, cc: "GB", t: "city" },
    { n: "Stirling", lat: 56.1165, lon: -3.9369, cc: "GB", t: "city" },
    { n: "Paisley", lat: 55.8466, lon: -4.4238, cc: "GB", t: "city" },
    { n: "Kilmarnock", lat: 55.6111, lon: -4.4957, cc: "GB", t: "city" },
    { n: "Falkirk", lat: 56.0019, lon: -3.7839, cc: "GB", t: "city" },
    { n: "Dunfermline", lat: 56.0719, lon: -3.4393, cc: "GB", t: "city" },
    { n: "Wrexham", lat: 53.0466, lon: -2.9929, cc: "GB", t: "city" },
    { n: "Wolverhampton", lat: 52.5870, lon: -2.1288, cc: "GB", t: "city" },
    { n: "Cardiff", lat: 51.4816, lon: -3.1791, cc: "GB", t: "city" },
    { n: "Swansea", lat: 51.6214, lon: -3.9436, cc: "GB", t: "city" },
    { n: "Newport", lat: 51.5842, lon: -2.9977, cc: "GB", t: "city" },
    { n: "Edinburgh", lat: 55.9533, lon: -3.1883, cc: "GB", t: "city" },
    { n: "Glasgow", lat: 55.8642, lon: -4.2518, cc: "GB", t: "city" },
    { n: "Aberdeen", lat: 57.1497, lon: -2.0943, cc: "GB", t: "city" },
    { n: "Dundee", lat: 56.4620, lon: -2.9707, cc: "GB", t: "city" },
    { n: "Inverness", lat: 57.4778, lon: -4.2247, cc: "GB", t: "city" },
    { n: "Belfast", lat: 54.5973, lon: -5.9301, cc: "GB", t: "city" },
    { n: "Londonderry", a: ["Derry"], lat: 54.9966, lon: -7.3086, cc: "GB", t: "city" },
    /* ---- UK ports / crossings ---- */
    { n: "Dover", lat: 51.1279, lon: 1.3134, cc: "GB", t: "port" },
    { n: "Folkestone", lat: 51.0810, lon: 1.1696, cc: "GB", t: "port" },
    { n: "Harwich", lat: 51.9450, lon: 1.2873, cc: "GB", t: "port" },
    { n: "Felixstowe", lat: 51.9617, lon: 1.3513, cc: "GB", t: "port" },
    { n: "Holyhead", lat: 53.3090, lon: -4.6330, cc: "GB", t: "port" },
    { n: "Newhaven", lat: 50.7926, lon: 0.0470, cc: "GB", t: "port" },
    { n: "Poole", lat: 50.7150, lon: -1.9872, cc: "GB", t: "port" },
    { n: "Hook of Holland", a: ["Hoek van Holland"], lat: 51.9775, lon: 4.1333, cc: "NL", t: "port" },
    { n: "Calais", lat: 50.9513, lon: 1.8587, cc: "FR", t: "port" },
    { n: "Dunkirk", a: ["Dunkerque"], lat: 51.0344, lon: 2.3768, cc: "FR", t: "port" },
    /* ---- UK airports ---- */
    { n: "Heathrow Airport", a: ["Heathrow", "London Heathrow"], iata: "LHR", lat: 51.4700, lon: -0.4543, cc: "GB", t: "airport" },
    { n: "Gatwick Airport", a: ["Gatwick", "London Gatwick"], iata: "LGW", lat: 51.1537, lon: -0.1821, cc: "GB", t: "airport" },
    { n: "Stansted Airport", a: ["Stansted", "London Stansted"], iata: "STN", lat: 51.8860, lon: 0.2389, cc: "GB", t: "airport" },
    { n: "Luton Airport", a: ["London Luton"], iata: "LTN", lat: 51.8747, lon: -0.3683, cc: "GB", t: "airport" },
    { n: "London City Airport", a: ["City Airport"], iata: "LCY", lat: 51.5048, lon: 0.0495, cc: "GB", t: "airport" },
    { n: "Manchester Airport", iata: "MAN", lat: 53.3537, lon: -2.2750, cc: "GB", t: "airport" },
    { n: "Birmingham Airport", iata: "BHX", lat: 52.4539, lon: -1.7480, cc: "GB", t: "airport" },
    { n: "Bristol Airport", iata: "BRS", lat: 51.3827, lon: -2.7191, cc: "GB", t: "airport" },
    { n: "Edinburgh Airport", iata: "EDI", lat: 55.9500, lon: -3.3725, cc: "GB", t: "airport" },
    { n: "Glasgow Airport", iata: "GLA", lat: 55.8719, lon: -4.4331, cc: "GB", t: "airport" },
    { n: "Newcastle Airport", iata: "NCL", lat: 55.0375, lon: -1.6917, cc: "GB", t: "airport" },
    { n: "Leeds Bradford Airport", iata: "LBA", lat: 53.8659, lon: -1.6606, cc: "GB", t: "airport" },
    { n: "Liverpool Airport", a: ["John Lennon Airport"], iata: "LPL", lat: 53.3336, lon: -2.8497, cc: "GB", t: "airport" },
    { n: "East Midlands Airport", iata: "EMA", lat: 52.8311, lon: -1.3281, cc: "GB", t: "airport" },
    { n: "Cardiff Airport", iata: "CWL", lat: 51.3967, lon: -3.3433, cc: "GB", t: "airport" },
    { n: "Belfast International Airport", iata: "BFS", lat: 54.6575, lon: -6.2158, cc: "GB", t: "airport" },
    { n: "Aberdeen Airport", iata: "ABZ", lat: 57.2019, lon: -2.1978, cc: "GB", t: "airport" },
    { n: "Southampton Airport", iata: "SOU", lat: 50.9503, lon: -1.3568, cc: "GB", t: "airport" },
    { n: "Exeter Airport", iata: "EXT", lat: 50.7344, lon: -3.4139, cc: "GB", t: "airport" },
    { n: "Bournemouth Airport", iata: "BOH", lat: 50.7800, lon: -1.8425, cc: "GB", t: "airport" },
    /* ---- Spain ---- */
    { n: "Madrid", lat: 40.4168, lon: -3.7038, cc: "ES", t: "city" },
    { n: "Barcelona", lat: 41.3874, lon: 2.1686, cc: "ES", t: "city" },
    { n: "Malaga", a: ["Málaga"], lat: 36.7213, lon: -4.4214, cc: "ES", t: "city" },
    { n: "Seville", a: ["Sevilla"], lat: 37.3891, lon: -5.9845, cc: "ES", t: "city" },
    { n: "Valencia", lat: 39.4699, lon: -0.3763, cc: "ES", t: "city" },
    { n: "Alicante", lat: 38.3452, lon: -0.4810, cc: "ES", t: "city" },
    { n: "Marbella", lat: 36.5101, lon: -4.8825, cc: "ES", t: "city" },
    { n: "Estepona", lat: 36.4276, lon: -5.1463, cc: "ES", t: "city" },
    { n: "Fuengirola", lat: 36.5397, lon: -4.6249, cc: "ES", t: "city" },
    { n: "Torremolinos", lat: 36.6203, lon: -4.4998, cc: "ES", t: "city" },
    { n: "Benidorm", lat: 38.5411, lon: -0.1226, cc: "ES", t: "city" },
    { n: "Granada", lat: 37.1773, lon: -3.5986, cc: "ES", t: "city" },
    { n: "Cordoba", a: ["Córdoba"], lat: 37.8882, lon: -4.7794, cc: "ES", t: "city" },
    { n: "Bilbao", lat: 43.2630, lon: -2.9350, cc: "ES", t: "city" },
    { n: "Murcia", lat: 37.9922, lon: -1.1307, cc: "ES", t: "city" },
    { n: "Almeria", a: ["Almería"], lat: 36.8340, lon: -2.4637, cc: "ES", t: "city" },
    { n: "Cadiz", a: ["Cádiz"], lat: 36.5271, lon: -6.2886, cc: "ES", t: "city" },
    { n: "Algeciras", lat: 36.1408, lon: -5.4562, cc: "ES", t: "port" },
    { n: "Gibraltar", lat: 36.1408, lon: -5.3536, cc: "GI", t: "city" },
    { n: "Ibiza", lat: 38.9067, lon: 1.4206, cc: "ES", t: "city" },
    { n: "Palma", a: ["Palma de Mallorca"], lat: 39.5696, lon: 2.6502, cc: "ES", t: "city" },
    { n: "Tenerife", lat: 28.2916, lon: -16.6291, cc: "ES", t: "city" },
    { n: "Las Palmas", lat: 28.1235, lon: -15.4363, cc: "ES", t: "city" },
    { n: "Malaga Airport", a: ["Málaga Airport", "Costa del Sol Airport"], iata: "AGP", lat: 36.6749, lon: -4.4991, cc: "ES", t: "airport" },
    { n: "Seville Airport", a: ["Sevilla Airport"], iata: "SVQ", lat: 37.4180, lon: -5.8931, cc: "ES", t: "airport" },
    { n: "Madrid Barajas Airport", a: ["Barajas"], iata: "MAD", lat: 40.4983, lon: -3.5676, cc: "ES", t: "airport" },
    { n: "Barcelona El Prat Airport", a: ["El Prat"], iata: "BCN", lat: 41.2974, lon: 2.0833, cc: "ES", t: "airport" },
    { n: "Alicante Airport", iata: "ALC", lat: 38.2822, lon: -0.5582, cc: "ES", t: "airport" },
    { n: "Palma Airport", iata: "PMI", lat: 39.5517, lon: 2.7388, cc: "ES", t: "airport" },
    { n: "Ibiza Airport", iata: "IBZ", lat: 38.8729, lon: 1.3731, cc: "ES", t: "airport" },
    /* ---- Europe ---- */
    { n: "Paris", lat: 48.8566, lon: 2.3522, cc: "FR", t: "city" },
    { n: "Charles de Gaulle Airport", a: ["CDG", "Roissy"], iata: "CDG", lat: 49.0097, lon: 2.5479, cc: "FR", t: "airport" },
    { n: "Marseille", lat: 43.2965, lon: 5.3698, cc: "FR", t: "city" },
    { n: "Nice", lat: 43.7102, lon: 7.2620, cc: "FR", t: "city" },
    { n: "Lyon", lat: 45.7640, lon: 4.8357, cc: "FR", t: "city" },
    { n: "Toulouse", lat: 43.6047, lon: 1.4442, cc: "FR", t: "city" },
    { n: "Amsterdam", lat: 52.3676, lon: 4.9041, cc: "NL", t: "city" },
    { n: "Schiphol Airport", a: ["Amsterdam Schiphol"], iata: "AMS", lat: 52.3105, lon: 4.7683, cc: "NL", t: "airport" },
    { n: "Rotterdam", lat: 51.9244, lon: 4.4777, cc: "NL", t: "city" },
    { n: "Brussels", lat: 50.8503, lon: 4.3517, cc: "BE", t: "city" },
    { n: "Antwerp", a: ["Antwerpen"], lat: 51.2194, lon: 4.4025, cc: "BE", t: "city" },
    { n: "Berlin", lat: 52.5200, lon: 13.4050, cc: "DE", t: "city" },
    { n: "Frankfurt", lat: 50.1109, lon: 8.6821, cc: "DE", t: "city" },
    { n: "Munich", a: ["München"], lat: 48.1351, lon: 11.5820, cc: "DE", t: "city" },
    { n: "Hamburg", lat: 53.5511, lon: 9.9937, cc: "DE", t: "city" },
    { n: "Dusseldorf", a: ["Düsseldorf"], lat: 51.2277, lon: 6.7735, cc: "DE", t: "city" },
    { n: "Rome", a: ["Roma"], lat: 41.9028, lon: 12.4964, cc: "IT", t: "city" },
    { n: "Milan", a: ["Milano"], lat: 45.4642, lon: 9.1900, cc: "IT", t: "city" },
    { n: "Naples", a: ["Napoli"], lat: 40.8518, lon: 14.2681, cc: "IT", t: "city" },
    { n: "Lisbon", a: ["Lisboa"], lat: 38.7223, lon: -9.1393, cc: "PT", t: "city" },
    { n: "Porto", lat: 41.1579, lon: -8.6291, cc: "PT", t: "city" },
    { n: "Faro", lat: 37.0194, lon: -7.9304, cc: "PT", t: "city" },
    { n: "Athens", lat: 37.9838, lon: 23.7275, cc: "GR", t: "city" },
    { n: "Vienna", a: ["Wien"], lat: 48.2082, lon: 16.3738, cc: "AT", t: "city" },
    { n: "Zurich", a: ["Zürich"], lat: 47.3769, lon: 8.5417, cc: "CH", t: "city" },
    { n: "Geneva", lat: 46.2044, lon: 6.1432, cc: "CH", t: "city" },
    { n: "Dublin", lat: 53.3498, lon: -6.2603, cc: "IE", t: "city" },
    { n: "Dublin Airport", iata: "DUB", lat: 53.4264, lon: -6.2499, cc: "IE", t: "airport" },
    { n: "Cork", lat: 51.8985, lon: -8.4756, cc: "IE", t: "city" },
    { n: "Copenhagen", a: ["København"], lat: 55.6761, lon: 12.5683, cc: "DK", t: "city" },
    { n: "Stockholm", lat: 59.3293, lon: 18.0686, cc: "SE", t: "city" },
    { n: "Gothenburg", a: ["Göteborg"], lat: 57.7089, lon: 11.9746, cc: "SE", t: "city" },
    { n: "Oslo", lat: 59.9139, lon: 10.7522, cc: "NO", t: "city" },
    { n: "Helsinki", lat: 60.1699, lon: 24.9384, cc: "FI", t: "city" },
    { n: "Warsaw", a: ["Warszawa"], lat: 52.2297, lon: 21.0122, cc: "PL", t: "city" },
    { n: "Krakow", a: ["Kraków"], lat: 50.0647, lon: 19.9450, cc: "PL", t: "city" },
    { n: "Prague", a: ["Praha"], lat: 50.0755, lon: 14.4378, cc: "CZ", t: "city" },
    { n: "Budapest", lat: 47.4979, lon: 19.0402, cc: "HU", t: "city" },
    { n: "Bucharest", a: ["București"], lat: 44.4268, lon: 26.1025, cc: "RO", t: "city" },
    { n: "Sofia", lat: 42.6977, lon: 23.3219, cc: "BG", t: "city" },
    { n: "Belgrade", a: ["Beograd"], lat: 44.7866, lon: 20.4489, cc: "RS", t: "city" },
    { n: "Zagreb", lat: 45.8150, lon: 15.9819, cc: "HR", t: "city" },
    { n: "Sarajevo", lat: 43.8563, lon: 18.4131, cc: "BA", t: "city" },
    { n: "Tirana", lat: 41.3275, lon: 19.8187, cc: "AL", t: "city" },
    { n: "Pristina", a: ["Prishtina"], lat: 42.6629, lon: 21.1655, cc: "XK", t: "city" },
    { n: "Skopje", lat: 41.9981, lon: 21.4254, cc: "MK", t: "city" },
    { n: "Istanbul", lat: 41.0082, lon: 28.9784, cc: "TR", t: "city" },
    { n: "Ankara", lat: 39.9334, lon: 32.8597, cc: "TR", t: "city" },
    { n: "Moscow", a: ["Moskva"], lat: 55.7558, lon: 37.6173, cc: "RU", t: "city" },
    { n: "St Petersburg", a: ["Saint Petersburg"], lat: 59.9311, lon: 30.3609, cc: "RU", t: "city" },
    { n: "Kyiv", a: ["Kiev"], lat: 50.4501, lon: 30.5234, cc: "UA", t: "city" },
    { n: "Minsk", lat: 53.9006, lon: 27.5590, cc: "BY", t: "city" },
    { n: "Riga", lat: 56.9496, lon: 24.1052, cc: "LV", t: "city" },
    { n: "Vilnius", lat: 54.6872, lon: 25.2797, cc: "LT", t: "city" },
    { n: "Tallinn", lat: 59.4370, lon: 24.7536, cc: "EE", t: "city" },
    /* ---- Global hubs & UK-relevant ---- */
    { n: "Dubai", lat: 25.2048, lon: 55.2708, cc: "AE", t: "city" },
    { n: "Dubai Airport", iata: "DXB", lat: 25.2532, lon: 55.3657, cc: "AE", t: "airport" },
    { n: "Abu Dhabi", lat: 24.4539, lon: 54.3773, cc: "AE", t: "city" },
    { n: "Doha", lat: 25.2854, lon: 51.5310, cc: "QA", t: "city" },
    { n: "Riyadh", lat: 24.7136, lon: 46.6753, cc: "SA", t: "city" },
    { n: "Tel Aviv", lat: 32.0853, lon: 34.7818, cc: "IL", t: "city" },
    { n: "Beirut", lat: 33.8938, lon: 35.5018, cc: "LB", t: "city" },
    { n: "Amman", lat: 31.9454, lon: 35.9284, cc: "JO", t: "city" },
    { n: "Cairo", lat: 30.0444, lon: 31.2357, cc: "EG", t: "city" },
    { n: "Tripoli", lat: 32.8872, lon: 13.1913, cc: "LY", t: "city" },
    { n: "Tunis", lat: 36.8065, lon: 10.1815, cc: "TN", t: "city" },
    { n: "Algiers", lat: 36.7538, lon: 3.0588, cc: "DZ", t: "city" },
    { n: "Casablanca", lat: 33.5731, lon: -7.5898, cc: "MA", t: "city" },
    { n: "Tangier", a: ["Tanger"], lat: 35.7595, lon: -5.8340, cc: "MA", t: "port" },
    { n: "Lagos", lat: 6.5244, lon: 3.3792, cc: "NG", t: "city" },
    { n: "Accra", lat: 5.6037, lon: -0.1870, cc: "GH", t: "city" },
    { n: "Nairobi", lat: -1.2921, lon: 36.8219, cc: "KE", t: "city" },
    { n: "Johannesburg", lat: -26.2041, lon: 28.0473, cc: "ZA", t: "city" },
    { n: "Cape Town", lat: -33.9249, lon: 18.4241, cc: "ZA", t: "city" },
    { n: "Karachi", lat: 24.8607, lon: 67.0011, cc: "PK", t: "city" },
    { n: "Islamabad", lat: 33.6844, lon: 73.0479, cc: "PK", t: "city" },
    { n: "Lahore", lat: 31.5204, lon: 74.3587, cc: "PK", t: "city" },
    { n: "Delhi", a: ["New Delhi"], lat: 28.6139, lon: 77.2090, cc: "IN", t: "city" },
    { n: "Mumbai", lat: 19.0760, lon: 72.8777, cc: "IN", t: "city" },
    { n: "Dhaka", lat: 23.8103, lon: 90.4125, cc: "BD", t: "city" },
    { n: "Kabul", lat: 34.5553, lon: 69.2075, cc: "AF", t: "city" },
    { n: "Tehran", lat: 35.6892, lon: 51.3890, cc: "IR", t: "city" },
    { n: "Baghdad", lat: 33.3152, lon: 44.3661, cc: "IQ", t: "city" },
    { n: "Bangkok", lat: 13.7563, lon: 100.5018, cc: "TH", t: "city" },
    { n: "Hong Kong", lat: 22.3193, lon: 114.1694, cc: "HK", t: "city" },
    { n: "Singapore", lat: 1.3521, lon: 103.8198, cc: "SG", t: "city" },
    { n: "Kuala Lumpur", lat: 3.1390, lon: 101.6869, cc: "MY", t: "city" },
    { n: "Manila", lat: 14.5995, lon: 120.9842, cc: "PH", t: "city" },
    { n: "Jakarta", lat: -6.2088, lon: 106.8456, cc: "ID", t: "city" },
    { n: "Shanghai", lat: 31.2304, lon: 121.4737, cc: "CN", t: "city" },
    { n: "Beijing", lat: 39.9042, lon: 116.4074, cc: "CN", t: "city" },
    { n: "Tokyo", lat: 35.6762, lon: 139.6503, cc: "JP", t: "city" },
    { n: "Seoul", lat: 37.5665, lon: 126.9780, cc: "KR", t: "city" },
    { n: "Sydney", lat: -33.8688, lon: 151.2093, cc: "AU", t: "city" },
    { n: "Melbourne", lat: -37.8136, lon: 144.9631, cc: "AU", t: "city" },
    { n: "Auckland", lat: -36.8509, lon: 174.7645, cc: "NZ", t: "city" },
    { n: "New York", lat: 40.7128, lon: -74.0060, cc: "US", t: "city" },
    { n: "Los Angeles", lat: 34.0522, lon: -118.2437, cc: "US", t: "city" },
    { n: "Miami", lat: 25.7617, lon: -80.1918, cc: "US", t: "city" },
    { n: "Toronto", lat: 43.6532, lon: -79.3832, cc: "CA", t: "city" },
    { n: "Mexico City", a: ["Ciudad de México"], lat: 19.4326, lon: -99.1332, cc: "MX", t: "city" },
    { n: "Bogota", a: ["Bogotá"], lat: 4.7110, lon: -74.0721, cc: "CO", t: "city" },
    { n: "Medellin", a: ["Medellín"], lat: 6.2476, lon: -75.5658, cc: "CO", t: "city" },
    { n: "Cali", lat: 3.4516, lon: -76.5320, cc: "CO", t: "city" },
    { n: "Caracas", lat: 10.4806, lon: -66.9036, cc: "VE", t: "city" },
    { n: "Lima", lat: -12.0464, lon: -77.0428, cc: "PE", t: "city" },
    { n: "Sao Paulo", a: ["São Paulo"], lat: -23.5505, lon: -46.6333, cc: "BR", t: "city" },
    { n: "Rio de Janeiro", lat: -22.9068, lon: -43.1729, cc: "BR", t: "city" },
    { n: "Buenos Aires", lat: -34.6037, lon: -58.3816, cc: "AR", t: "city" },
    { n: "Kingston", lat: 17.9712, lon: -76.7936, cc: "JM", t: "city" },
    { n: "Santo Domingo", lat: 18.4861, lon: -69.9312, cc: "DO", t: "city" }
  ];

  var COUNTRIES = [
    { n: "United Kingdom", a: ["UK", "Great Britain", "Britain", "England", "Scotland", "Wales", "Northern Ireland"], lat: 54.0, lon: -2.5, cc: "GB" },
    { n: "Spain", a: ["España"], lat: 40.2, lon: -3.7, cc: "ES" },
    { n: "France", lat: 46.6, lon: 2.4, cc: "FR" },
    { n: "Germany", lat: 51.1, lon: 10.4, cc: "DE" },
    { n: "Netherlands", a: ["Holland"], lat: 52.2, lon: 5.5, cc: "NL" },
    { n: "Belgium", lat: 50.6, lon: 4.6, cc: "BE" },
    { n: "Italy", lat: 42.8, lon: 12.6, cc: "IT" },
    { n: "Portugal", lat: 39.6, lon: -8.0, cc: "PT" },
    { n: "Ireland", lat: 53.3, lon: -8.0, cc: "IE" },
    { n: "Poland", lat: 52.1, lon: 19.4, cc: "PL" },
    { n: "Romania", lat: 45.9, lon: 25.0, cc: "RO" },
    { n: "Bulgaria", lat: 42.7, lon: 25.5, cc: "BG" },
    { n: "Greece", lat: 39.1, lon: 22.9, cc: "GR" },
    { n: "Albania", lat: 41.2, lon: 20.2, cc: "AL" },
    { n: "Serbia", lat: 44.2, lon: 20.9, cc: "RS" },
    { n: "Turkey", a: ["Türkiye"], lat: 39.1, lon: 35.2, cc: "TR" },
    { n: "Morocco", lat: 31.8, lon: -7.1, cc: "MA" },
    { n: "Algeria", lat: 28.0, lon: 1.7, cc: "DZ" },
    { n: "Libya", lat: 26.3, lon: 17.2, cc: "LY" },
    { n: "Egypt", lat: 26.8, lon: 30.8, cc: "EG" },
    { n: "Nigeria", lat: 9.1, lon: 8.7, cc: "NG" },
    { n: "Ghana", lat: 7.9, lon: -1.0, cc: "GH" },
    { n: "Kenya", lat: 0.0, lon: 37.9, cc: "KE" },
    { n: "South Africa", lat: -28.8, lon: 24.7, cc: "ZA" },
    { n: "United Arab Emirates", a: ["UAE"], lat: 24.0, lon: 54.0, cc: "AE" },
    { n: "Qatar", lat: 25.3, lon: 51.2, cc: "QA" },
    { n: "Saudi Arabia", lat: 24.0, lon: 45.0, cc: "SA" },
    { n: "Pakistan", lat: 30.4, lon: 69.3, cc: "PK" },
    { n: "India", lat: 21.0, lon: 78.0, cc: "IN" },
    { n: "Bangladesh", lat: 23.7, lon: 90.3, cc: "BD" },
    { n: "Afghanistan", lat: 33.9, lon: 67.7, cc: "AF" },
    { n: "Iran", lat: 32.4, lon: 53.7, cc: "IR" },
    { n: "Iraq", lat: 33.2, lon: 43.7, cc: "IQ" },
    { n: "Syria", lat: 34.8, lon: 38.9, cc: "SY" },
    { n: "China", lat: 35.9, lon: 104.2, cc: "CN" },
    { n: "Thailand", lat: 15.9, lon: 100.9, cc: "TH" },
    { n: "Vietnam", lat: 14.1, lon: 108.3, cc: "VN" },
    { n: "Malaysia", lat: 4.2, lon: 101.9, cc: "MY" },
    { n: "Indonesia", lat: -0.8, lon: 113.9, cc: "ID" },
    { n: "Philippines", lat: 12.9, lon: 121.8, cc: "PH" },
    { n: "United States", a: ["USA", "US", "America"], lat: 39.8, lon: -98.6, cc: "US" },
    { n: "Canada", lat: 56.1, lon: -106.3, cc: "CA" },
    { n: "Mexico", lat: 23.6, lon: -102.6, cc: "MX" },
    { n: "Colombia", lat: 4.6, lon: -74.3, cc: "CO" },
    { n: "Venezuela", lat: 6.4, lon: -66.6, cc: "VE" },
    { n: "Peru", lat: -9.2, lon: -75.0, cc: "PE" },
    { n: "Brazil", lat: -14.2, lon: -51.9, cc: "BR" },
    { n: "Argentina", lat: -38.4, lon: -63.6, cc: "AR" },
    { n: "Ecuador", lat: -1.8, lon: -78.2, cc: "EC" },
    { n: "Jamaica", lat: 18.1, lon: -77.3, cc: "JM" },
    { n: "Dominican Republic", lat: 18.7, lon: -70.2, cc: "DO" },
    { n: "Russia", lat: 61.5, lon: 105.3, cc: "RU" },
    { n: "Ukraine", lat: 48.4, lon: 31.2, cc: "UA" },
    { n: "Belarus", lat: 53.7, lon: 28.0, cc: "BY" },
    { n: "Lithuania", lat: 55.2, lon: 23.9, cc: "LT" },
    { n: "Latvia", lat: 56.9, lon: 24.6, cc: "LV" },
    { n: "Estonia", lat: 58.6, lon: 25.0, cc: "EE" },
    { n: "Australia", lat: -25.3, lon: 133.8, cc: "AU" },
    { n: "Japan", lat: 36.2, lon: 138.3, cc: "JP" }
  ];

  /* Build lookup index: folded name/alias → record (id = index key). */
  var INDEX = {};
  var IATA = {};
  function addKey(key, rec) {
    key = fold(key);
    if (!key) return;
    if (!INDEX[key]) INDEX[key] = rec;
  }
  GAZ.forEach(function (g, i) {
    g.id = "gaz:" + i;
    addKey(g.n, g);
    (g.a || []).forEach(function (al) { addKey(al, g); });
    if (g.iata) IATA[g.iata.toUpperCase()] = g;
  });
  COUNTRIES.forEach(function (c, i) {
    c.id = "ctry:" + i;
    c.t = "country";
    addKey(c.n, c);
    (c.a || []).forEach(function (al) { addKey(al, c); });
  });

  /** Exact (accent/case-insensitive) gazetteer lookup. Returns record or null. */
  function lookup(name) {
    if (!name) return null;
    var rec = INDEX[fold(name)];
    if (rec) return rec;
    // "X airport" → try the city's airport, then the bare name
    var m = fold(name).match(/^(.+?)\s+airport$/);
    if (m) {
      rec = INDEX[m[1] + " airport"] || null;
      if (rec) return rec;
      var city = INDEX[m[1]];
      if (city) {
        // find an airport in same country whose name starts with city name
        var found = null;
        GAZ.some(function (g) {
          if (g.t === "airport" && fold(g.n).indexOf(fold(m[1])) === 0) { found = g; return true; }
          return false;
        });
        if (found) return found;
        return city; // fall back to the city itself
      }
    }
    return null;
  }

  /** City name -> the airport record that serves it (e.g. "Malaga" -> AGP), or null.
      Used to enrich a city referenced in an air-travel context. */
  function airportForCity(name) {
    if (!name) return null;
    var f = fold(name);
    var direct = INDEX[f + " airport"];
    if (direct && direct.t === "airport") return direct;
    var found = null;
    GAZ.some(function (g) {
      if (g.t !== "airport") return false;
      if (fold(g.n).indexOf(f) === 0) { found = g; return true; }
      return (g.a || []).some(function (al) { return fold(al).indexOf(f) === 0; }) ? (found = g, true) : false;
    });
    return found;
  }

  /** IATA code lookup, e.g. "AGP" → Malaga Airport. */
  function lookupIata(code) {
    return IATA[String(code || "").toUpperCase()] || null;
  }

  /** All distinct folded keys (used by the extractor to scan text). */
  function allKeys() { return Object.keys(INDEX); }

  /* ---- UK postcode areas → approximate centroids ----
   * Coarse but complete: every UK postcode resolves to an area centroid even
   * when the town itself isn't in the gazetteer. Marked geoApprox by callers. */
  var PC_AREAS = {
    AB:[57.15,-2.09], AL:[51.75,-0.34], B:[52.49,-1.89], BA:[51.38,-2.36], BB:[53.75,-2.48],
    BD:[53.80,-1.76], BH:[50.72,-1.88], BL:[53.58,-2.43], BN:[50.82,-0.14], BR:[51.40,0.05],
    BS:[51.45,-2.59], BT:[54.60,-5.93], CA:[54.89,-2.93], CB:[52.21,0.12], CF:[51.48,-3.18],
    CH:[53.19,-2.89], CM:[51.74,0.47], CO:[51.90,0.89], CR:[51.38,-0.10], CT:[51.28,1.08],
    CV:[52.41,-1.52], CW:[53.10,-2.44], DA:[51.44,0.22], DD:[56.46,-2.97], DE:[52.92,-1.47],
    DG:[55.07,-3.61], DH:[54.78,-1.58], DL:[54.52,-1.55], DN:[53.52,-1.13], DT:[50.71,-2.44],
    DY:[52.51,-2.08], E:[51.53,-0.05], EC:[51.52,-0.09], EH:[55.95,-3.19], EN:[51.65,-0.08],
    EX:[50.72,-3.53], FK:[56.00,-3.78], FY:[53.82,-3.04], G:[55.86,-4.25], GL:[51.86,-2.24],
    GU:[51.24,-0.57], HA:[51.58,-0.34], HD:[53.65,-1.79], HG:[54.00,-1.54], HP:[51.75,-0.47],
    HR:[52.06,-2.72], HS:[57.76,-7.02], HU:[53.77,-0.33], HX:[53.72,-1.86], IG:[51.56,0.07],
    IP:[52.06,1.15], IV:[57.48,-4.22], KA:[55.61,-4.50], KT:[51.41,-0.30], KW:[58.98,-2.96],
    KY:[56.11,-3.16], L:[53.41,-2.99], LA:[54.05,-2.80], LD:[52.24,-3.38], LE:[52.64,-1.14],
    LL:[53.32,-3.83], LN:[53.23,-0.54], LS:[53.80,-1.55], LU:[51.88,-0.42], M:[53.48,-2.24],
    ME:[51.36,0.55], MK:[52.04,-0.76], ML:[55.79,-3.99], N:[51.57,-0.10], NE:[54.98,-1.62],
    NG:[52.95,-1.16], NN:[52.24,-0.90], NP:[51.58,-3.00], NR:[52.63,1.30], NW:[51.55,-0.19],
    OL:[53.54,-2.11], OX:[51.75,-1.26], PA:[55.85,-4.42], PE:[52.57,-0.24], PH:[56.40,-3.43],
    PL:[50.38,-4.14], PO:[50.82,-1.09], PR:[53.76,-2.70], RG:[51.45,-0.98], RH:[51.24,-0.17],
    RM:[51.58,0.18], S:[53.38,-1.47], SA:[51.62,-3.94], SE:[51.47,-0.06], SG:[51.90,-0.20],
    SK:[53.41,-2.15], SL:[51.51,-0.60], SM:[51.36,-0.19], SN:[51.56,-1.78], SO:[50.91,-1.40],
    SP:[51.07,-1.79], SR:[54.91,-1.38], SS:[51.55,0.71], ST:[53.00,-2.18], SW:[51.46,-0.17],
    SY:[52.71,-2.75], TA:[51.01,-3.10], TD:[55.62,-2.81], TF:[52.68,-2.45], TN:[51.13,0.26],
    TQ:[50.46,-3.53], TR:[50.26,-5.05], TS:[54.57,-1.24], TW:[51.45,-0.34], UB:[51.54,-0.42],
    W:[51.51,-0.18], WA:[53.39,-2.60], WC:[51.52,-0.12], WD:[51.66,-0.39], WF:[53.68,-1.50],
    WN:[53.55,-2.63], WR:[52.19,-2.22], WS:[52.59,-1.98], WV:[52.59,-2.13], YO:[53.96,-1.08],
    ZE:[60.15,-1.15]
  };

  /** UK postcode → approximate area centroid {lat, lon, area} or null.
   *  Accepts a full postcode ("SK4 2RH") or just its outward part. */
  function postcodeArea(pc) {
    var m = /^([A-Z]{1,2})\d/i.exec(String(pc || "").trim());
    if (!m) return null;
    var key = m[1].toUpperCase();
    var hit = PC_AREAS[key] || (key.length === 2 ? PC_AREAS[key[0]] : null);
    if (!hit) return null;
    return { lat: hit[0], lon: hit[1], area: key };
  }

  /** Country centroid by ISO cc. */
  function countryByCc(cc) {
    for (var i = 0; i < COUNTRIES.length; i++) {
      if (COUNTRIES[i].cc === cc) return COUNTRIES[i];
    }
    return null;
  }

  var CRGeo = {
    fold: fold,
    lookup: lookup,
    lookupIata: lookupIata,
    airportForCity: airportForCity,
    allKeys: allKeys,
    countryByCc: countryByCc,
    postcodeArea: postcodeArea,
    GAZ: GAZ,
    COUNTRIES: COUNTRIES
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CRGeo;
  if (typeof window !== "undefined") window.CRGeo = CRGeo;
})();
