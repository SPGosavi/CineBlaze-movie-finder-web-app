import fetch from 'node-fetch';
import cache from '../utils/cache.js';
import { TMDB_API_KEY, OMDB_API_KEY } from '../config.js';

const GENRE_MAP = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary",
  18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie", 53: "Thriller",
  10752: "War", 37: "Western", 10759: "Action & Adventure", 10762: "Kids", 10763: "News",
  10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics"
};

export async function fetchEnrichedDataById(id, mediaType) {
    if (!id || !mediaType) return null;

    const [details, providers] = await Promise.all([
        fetchTmdbDetails(id, mediaType),
        fetchWatchProviders(id, mediaType)
    ]);

    return {
        id,
        media_type: mediaType,
        genres: details.genres,
        director: details.director,
        cast: details.cast,
        providers
    };
}

export async function fetchFastDetailsById(id, mediaType) {
    if (!id || !mediaType) return null;

    const details = await fetchTmdbDetails(id, mediaType);

    return {
        id,
        media_type: mediaType,
        genres: details.genres,
        director: details.director, // may exist
        cast: details.cast           // may exist
    };
}

export async function fetchRatings(title, year) {
    const cacheKey = `ratings_${title}_${year}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
        const ratings = await fetchOmdbRatings(title, year);
        cache.set(cacheKey, ratings, 86400); // 24 hours
        return ratings;
    } catch {
        return { imdb: null, rt: null };
    }
}

export async function fetchTmdb(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('TMDB Error');
    return await res.json();
}

/**
 * Fallback: Direct Keyword Search
 * Used when AI is rate-limited. Searches Movies and TV.
 */
export function formatBasicTmdbResult(item, mediaType) {
    if (!item) return null;
    
    // Map genre_ids to strings immediately
    const genres = item.genre_ids 
        ? item.genre_ids.map(id => GENRE_MAP[id]).filter(Boolean)
        : [];

    return {
        id: item.id,
        title: item.title || item.name,
        release_date: item.release_date || item.first_air_date,
        overview: item.overview,
        poster_path: item.poster_path,
        vote_average: item.vote_average,
        media_type: mediaType || item.media_type || (item.title ? 'movie' : 'tv'),
        genres: genres 
    };
}

export async function searchTmdbDirect(query) {
    try {
        console.log(`[TMDB] Direct Search for: "${query}"`);

        // Strip generic suffixes/prefixes that confuse TMDB search
        let cleanedQuery = query
            .replace(/\b(movies?|films?|shows?|series)\b/gi, '')
            .replace(/^(best|top|latest|recent|new|popular|all)\s+/i, '')
            .trim();
        
        if (!cleanedQuery) cleanedQuery = query; // safety fallback
        
        const searchQuery = cleanedQuery !== query 
            ? cleanedQuery 
            : query;
        
        if (cleanedQuery !== query) {
            console.log(`[TMDB] Cleaned query: "${query}" → "${searchQuery}"`);
        }

        // Use Multi-Search to handle Actors + Titles + Keywords in one go
        const url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(searchQuery)}&language=en-US&page=1`;
        const res = await fetch(url);
        const data = await res.json();

        let combined = [];
        if (data.results && data.results.length > 0) {
            for (const item of data.results) {
                if (item.media_type === 'movie' || item.media_type === 'tv') {
                    combined.push(item);
                } else if (item.media_type === 'person' && item.known_for) {
                    combined.push(...item.known_for.map(m => ({ ...m, media_type: m.title ? 'movie' : 'tv' })));
                }
            }
        }

        // If no results for the cleaned string, try searching just for potential actor names
        if (combined.length === 0 && searchQuery.includes(' ')) {
            const words = searchQuery.split(' ');
            // Look for word pairs which are likely names (case-insensitive)
            const names = [];
            for (let i = 0; i < words.length - 1; i++) {
                if (words[i].length > 1 && words[i + 1].length > 1) {
                    names.push(`${words[i]} ${words[i+1]}`);
                }
            }

            if (names.length > 0) {
                console.log(`[TMDB] No results for cleaned query. Trying actor-specific search for: "${names[0]}"`);
                const actorUrl = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(names[0])}&language=en-US&page=1`;
                const actorRes = await fetch(actorUrl);
                const actorData = await actorRes.json();
                
                if (actorData.results) {
                    for (const item of actorData.results) {
                        if (item.media_type === 'person' && item.known_for) {
                            combined.push(...item.known_for.map(m => ({ ...m, media_type: m.title ? 'movie' : 'tv' })));
                        }
                    }
                }
            }
        }

        // De-duplicate by ID
        const seen = new Set();
        const unique = combined.filter(item => {
            if (!item.id) return false;
            const duplicate = seen.has(item.id);
            seen.add(item.id);
            return !duplicate;
        });

        return unique.slice(0, 10).map(item => formatTmdbResult(item, item.media_type));
    } catch (e) {
        console.error("Direct Search Failed:", e);
        return [];
    }
}


export async function getNativeTmdbRecommendations(title, year, mediaType) {
    if (!title || !mediaType) return [];
    const cleanTitle = String(title).replace(/\(\d{4}\)/g, '').trim();

    let searchResult = await performTmdbSearch(cleanTitle, year, mediaType);
    if (!searchResult) searchResult = await performTmdbSearch(cleanTitle, null, mediaType);

    if (!searchResult) return [];

    const url = `https://api.themoviedb.org/3/${mediaType}/${searchResult.id}/similar?api_key=${TMDB_API_KEY}&language=en-US&page=1`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data.results || data.results.length === 0) return [];
        return data.results.slice(0, 10).map(item => formatTmdbResult(item, mediaType));
    } catch (e) { return []; }
}

export async function enrichWithDeepData(items, limit = 20) {
    if (!items || !Array.isArray(items)) return [];
    
    // Ensure we don't exceed array bounds
    const safeLimit = Math.min(items.length, limit);
    
    const topItems = items.slice(0, safeLimit);
    const remaining = items.slice(safeLimit);

    const enriched = await Promise.all(topItems.map(async (item) => {
        const year = (item.release_date || item.first_air_date)?.split('-')[0];
        const title = item.title || item.name;
        const type = item.media_type || (item.title ? 'movie' : 'tv'); 
        
        const [ratings, details, providers] = await Promise.all([
            fetchOmdbRatings(title, year, type),
            fetchTmdbDetails(item.id, type),
            fetchWatchProviders(item.id, type)
        ]);

        return { 
            ...item, 
            media_type: type,
            imdb_rating: ratings.imdb, 
            rotten_tomatoes: ratings.rotten,
            director: details.director,
            cast: details.cast,
            genres: details.genres, 
            providers: providers
        };
    }));

    return [...enriched, ...remaining];
}

export async function fetchEnrichedData(title, year, preferredType) {
    if (!title) return null;
    const searchResult = await fetchTmdbRobust(title, year, preferredType);
    if (!searchResult) return null;

    const [details, omdbData, providers] = await Promise.all([
        fetchTmdbDetails(searchResult.id, searchResult.media_type),
        fetchOmdbRatings(searchResult.title, searchResult.release_date?.split('-')[0] || year, searchResult.media_type),
        fetchWatchProviders(searchResult.id, searchResult.media_type)
    ]);

    return {
        ...searchResult,
        genres: details.genres,
        director: details.director,
        cast: details.cast,
        imdb_rating: omdbData.imdb,
        rotten_tomatoes: omdbData.rotten,
        providers: providers
    };
}

async function fetchTmdbRobust(title, year, preferredType) {
    if (!title) return null;
    
    // Aggressive cleaning: remove (YYYY), YYYY at end, "The movie X", "X movie"
    let cleanTitle = String(title)
        .replace(/\(\d{4}\)/g, '') // remove (2009)
        .replace(/\s\d{4}$/, '')   // remove 2009 at end
        .replace(/^(the movie|the show|movie|show)\s+/i, '') // remove prefixes
        .replace(/\s+(movie|show)$/i, '') // remove suffixes
        .trim();

    let result = await performTmdbSearch(cleanTitle, year, preferredType);
    if (result) return result;
    const fallbackType = preferredType === 'movie' ? 'tv' : 'movie';
    return await performTmdbSearch(cleanTitle, year, fallbackType);
}

function calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    const matrix = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));

    for (let i = 0; i <= s1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= s2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= s2.length; j++) {
        for (let i = 1; i <= s1.length; i++) {
            const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1, // insertion
                matrix[j - 1][i] + 1, // deletion
                matrix[j - 1][i - 1] + indicator // substitution
            );
        }
    }
    const distance = matrix[s2.length][s1.length];
    const maxLength = Math.max(s1.length, s2.length);
    return (maxLength - distance) / maxLength;
}

async function performTmdbSearch(queryTitle, year, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const baseUrl = `https://api.themoviedb.org/3/search/${endpoint}?api_key=${TMDB_API_KEY}&language=en-US&page=1`;
    
    try {
        let res = await fetch(`${baseUrl}&query=${encodeURIComponent(queryTitle)}`);
        if (!res.ok) return null;
        let data = await res.json();

        // Relaxed search if no results and query has multiple words
        if ((!data.results || data.results.length === 0) && queryTitle.includes(' ')) {
             const words = queryTitle.split(' ');
             if (words.length > 1) {
                 const relaxedQuery = words.slice(0, Math.min(words.length - 1, 3)).join(' '); 
                 console.log(`[TMDB] No results for "${queryTitle}". Trying relaxed: "${relaxedQuery}"`);
                 const relaxedRes = await fetch(`${baseUrl}&query=${encodeURIComponent(relaxedQuery)}`);
                 if (relaxedRes.ok) {
                     const relaxedData = await relaxedRes.json();
                     if (relaxedData.results && relaxedData.results.length > 0) {
                         data = relaxedData;
                     }
                 }

                 // Transliteration / Spelling robust fallback
                 // Try progressively shorter sub-queries by dropping words from the start
                 // e.g. "Ti Sadhya Kay Karte" → "Sadhya Kay Karte" → "Kay Karte"
                 // This ensures we eventually skip past the misspelled word(s).
                 if (!data.results || data.results.length === 0) {
                     let bestCandidates = null;

                     for (let drop = 1; drop < words.length - 1; drop++) {
                         const subQuery = words.slice(drop).join(' ');
                         if (subQuery.length < 3) break; // Too short to be useful

                         console.log(`[TMDB] Spelling fallback (drop ${drop}): "${subQuery}"`);
                         const subRes = await fetch(`${baseUrl}&query=${encodeURIComponent(subQuery)}`);
                         
                         if (subRes.ok) {
                             const subData = await subRes.json();
                             if (subData.results && subData.results.length > 0) {
                                 // Score every candidate against the original full query title
                                 const candidates = subData.results.map(item => {
                                     const t = item.title || item.name || '';
                                     const ot = item.original_title || item.original_name || '';
                                     const score1 = calculateSimilarity(queryTitle, t);
                                     const score2 = calculateSimilarity(queryTitle, ot);
                                     return { ...item, _similarityScore: Math.max(score1, score2) };
                                 });
                                 
                                 candidates.sort((a, b) => b._similarityScore - a._similarityScore);
                                 
                                 if (candidates[0]._similarityScore >= 0.70) {
                                     console.log(`[TMDB] Found fuzzy match: "${candidates[0].title || candidates[0].name}" (Score: ${candidates[0]._similarityScore.toFixed(2)})`);
                                     bestCandidates = candidates;
                                     break; // Use the first sub-query that yields a strong match
                                 } else {
                                     console.log(`[TMDB] Best candidate from "${subQuery}": "${candidates[0].title || candidates[0].name}" (Score: ${candidates[0]._similarityScore.toFixed(2)}) — below threshold`);
                                 }
                             }
                         }
                     }

                     if (bestCandidates) {
                         data.results = bestCandidates;
                     }
                 }
             }
        }

        if (!data.results || data.results.length === 0) {
            console.log(`[TMDB] No results for "${queryTitle}"`);
            return null;
        }

        const normalizedQuery = queryTitle.toLowerCase().trim();
        const yearStr = year ? String(year) : null;

        const exactTitle = (item) => {
            const t = (item.title || item.name || '').toLowerCase().trim();
            const ot = (item.original_title || item.original_name || '').toLowerCase().trim();
            const match = t === normalizedQuery || ot === normalizedQuery;
            if (match) console.log(`[TMDB] Title Match: "${t}" === "${normalizedQuery}"`);
            return match;
        };
        const matchesYear = (item) => {
            const d = item.release_date || item.first_air_date;
            const match = d && yearStr && d.startsWith(yearStr);
            if (match) console.log(`[TMDB] Year Match: "${d}" starts with "${yearStr}"`);
            return match;
        };

        // 1. Exact title + year match (strongest signal)
        if (yearStr) {
            const best = data.results.find(item => exactTitle(item) && matchesYear(item));
            if (best) return formatTmdbResult(best, mediaType);
        }

        // 2. Exact title match (any year)
        const exactOnly = data.results.find(exactTitle);
        if (exactOnly) return formatTmdbResult(exactOnly, mediaType);

        // 3. Year match among remaining results (original behaviour)
        if (yearStr) {
            const yearMatch = data.results.find(matchesYear);
            if (yearMatch) return formatTmdbResult(yearMatch, mediaType);
        }

        console.log(`[TMDB] No exact match for "${queryTitle}" (${yearStr}). Using top result: "${data.results[0].title || data.results[0].name}"`);
        // 4. Fallback: top popularity result
        return formatTmdbResult(data.results[0], mediaType);
    } catch (e) { return null; }
}

async function fetchTmdbDetails(id, mediaType) {
    const url = `https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        const genres = data.genres ? data.genres.map(g => g.name).slice(0, 3) : [];
        let director = "Unknown";
        if (mediaType === 'movie') {
            const d = data.credits?.crew?.find(p => p.job === 'Director');
            if (d) director = d.name;
        } else {
            if (data.created_by?.length > 0) director = data.created_by.map(c => c.name).join(', ');
            else {
                 const exec = data.credits?.crew?.find(p => p.job === 'Executive Producer');
                 if (exec) director = exec.name;
            }
        }
        const cast = data.credits?.cast?.slice(0, 3).map(c => c.name) || [];
        return { genres, director, cast };
    } catch (e) { return { genres: [], director: "Unknown", cast: [] }; }
}

export async function fetchWatchProviders(id, mediaType) {
    const url = `https://api.themoviedb.org/3/${mediaType}/${id}/watch/providers?api_key=${TMDB_API_KEY}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        const countryData = data.results?.IN || data.results?.US;
        return countryData?.flatrate?.map(p => ({ name: p.provider_name, logo: p.logo_path })) || [];
    } catch (e) { return []; }
}

export async function fetchOmdbRatings(title, year) {
  const url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&y=${year}&apikey=${OMDB_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  let imdb = null;
  let rt = null;

  if (Array.isArray(data.Ratings)) {
    for (const r of data.Ratings) {
      if (r.Source === 'Internet Movie Database') {
        imdb = r.Value?.split('/')[0]; 
      }
      if (r.Source === 'Rotten Tomatoes') {
        rt = r.Value?.replace('%', ''); 
      }
    }
  }

  return { imdb, rt };
}


function formatTmdbResult(result, mediaType) {
    if (!result) return null;
    return {
        id: result.id,
        title: result.title || result.name,
        release_date: result.release_date || result.first_air_date,
        overview: result.overview,
        poster_path: result.poster_path,
        vote_average: result.vote_average,
        media_type: mediaType
    };
}