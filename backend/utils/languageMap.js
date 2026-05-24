// Maps natural language names and industry nicknames to ISO 639-1 codes
// Used by TMDB's `with_original_language` discover filter

const LANGUAGE_MAP = {
    // Indian languages
    "hindi": "hi",
    "marathi": "mr",
    "tamil": "ta",
    "telugu": "te",
    "kannada": "kn",
    "malayalam": "ml",
    "bengali": "bn",
    "bangla": "bn",
    "punjabi": "pa",
    "gujarati": "gu",
    "odia": "or",
    "assamese": "as",
    "urdu": "ur",

    // Indian film industry nicknames
    "bollywood": "hi",
    "tollywood": "te",
    "kollywood": "ta",
    "mollywood": "ml",
    "sandalwood": "kn",

    // World cinema
    "korean": "ko",
    "japanese": "ja",
    "french": "fr",
    "spanish": "es",
    "german": "de",
    "italian": "it",
    "chinese": "zh",
    "mandarin": "zh",
    "cantonese": "cn",
    "portuguese": "pt",
    "russian": "ru",
    "turkish": "tr",
    "thai": "th",
    "arabic": "ar",
    "persian": "fa",
    "swedish": "sv",
    "danish": "da",
    "norwegian": "no",
    "dutch": "nl",
    "polish": "pl",
    "indonesian": "id",
    "malay": "ms",
    "vietnamese": "vi",
    "english": "en",
    "hollywood": "en",
};

// TMDB genre name -> ID mapping (for discover endpoint)
const GENRE_ID_MAP = {
    "action": 28,
    "adventure": 12,
    "animation": 16,
    "comedy": 35,
    "crime": 80,
    "documentary": 99,
    "drama": 18,
    "family": 10751,
    "fantasy": 14,
    "history": 36,
    "horror": 27,
    "music": 10402,
    "mystery": 9648,
    "romance": 10749,
    "sci-fi": 878,
    "science fiction": 878,
    "thriller": 53,
    "war": 10752,
    "western": 37,
    "spy": 53,       // map to thriller (closest)
    "suspense": 53,  // map to thriller
    "biographical": 36, // map to history
    "biopic": 36,
    "sports": 18,    // map to drama (no dedicated genre)
    "musical": 10402,
    "romantic": 10749,
    "superhero": 28, // map to action
};

export function getLanguageCode(languageName) {
    if (!languageName) return null;
    return LANGUAGE_MAP[languageName.toLowerCase().trim()] || null;
}

export function getGenreIds(genreNames) {
    if (!genreNames || !Array.isArray(genreNames)) return [];
    return genreNames
        .map(g => GENRE_ID_MAP[g.toLowerCase().trim()])
        .filter(Boolean);
}

export { LANGUAGE_MAP, GENRE_ID_MAP };
