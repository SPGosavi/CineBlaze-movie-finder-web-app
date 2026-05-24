import cache from '../utils/cache.js';
import { callGroqWithFallback, callGroqSimilar, extractKeywords, extractStructuredParams } from '../services/aiService.js';
import { fetchEnrichedData, fetchEnrichedDataById, getNativeTmdbRecommendations, enrichWithDeepData, searchTmdbDirect, fetchWatchProviders } from '../services/tmdbService.js';

export const getMediaDetails = async (req, res) => {
    const { id, title, year, media_type } = req.body;;
    
    // Check cache for details to save API calls
    const cacheKey = id
        ? `details_${media_type}_${id}`
        : `details_${title}_${year}_${media_type}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
        let data;

        if (id) {
            data = await fetchEnrichedDataById(id, media_type);
        } else {
            data = await fetchEnrichedData(title, year, media_type);
        }
        
        if (data) {
            cache.set(cacheKey, data, 3600); // Cache details for 1 hour
            res.json(data);
        } else {
            res.json({}); // Return empty if not found to stop spinner
        }
    } catch (e) {
        console.error("Detail Fetch Error:", e);
        res.status(500).json({ error: 'Failed to fetch details' });
    }
};

function isLikelyTitleQuery(query) {
    if (!query) return false;

    const q = query.toLowerCase().trim();

    // Plot-style indicators (verbs, conjunctions, pronouns)
    const plotKeywords = [
        'about', 'story', 'where', 'who', 'man', 'woman',
        'boy', 'girl', 'based on', 'set in', 'finds', 'journey',
        'controlling', 'kills', 'loves', 'escapes', 'seeks', 'discovers'
    ];

    if (plotKeywords.some(k => q.includes(k))) return false;

    // Too long or has too many spaces → likely a description
    const words = q.split(/\s+/);
    if (words.length > 4) return false;

    // Looks like a clean title
    return true;
}

/**
 * Detects generic browsing-style queries that are too vague for AI
 * and would be better served by direct TMDB search.
 * 
 * Examples that should match:
 *  - "akshay kumar movies"
 *  - "comedy movies"
 *  - "best horror films"
 *  - "top akshay kumar movies"
 *  - "shah rukh khan films"
 *  - "recent thriller movies"
 */
function isGenericBrowsingQuery(query) {
    if (!query) return false;
    const q = query.toLowerCase().trim();

    // Pattern 1: "<actor name> movies/films" or "movies by <actor>"
    // e.g. "akshay kumar movies", "shah rukh khan films"
    const genericSuffixPattern = /^(.+?)\s+(movies?|films?|shows?|series)$/i;
    const genericPrefixPattern = /^(best|top|latest|recent|new|popular|all)\s+(.+?)\s*(movies?|films?|shows?|series)?$/i;
    const moviesOfPattern = /^(movies?|films?|shows?|series)\s+(by|of|from|with)\s+/i;

    if (genericSuffixPattern.test(q)) {
        // Check that the prefix part doesn't contain plot words
        const match = q.match(genericSuffixPattern);
        const prefix = match[1];
        const plotWords = ['about', 'where', 'who', 'story', 'based on', 'set in', 'journey', 'finds', 'kills', 'loves'];
        if (!plotWords.some(pw => prefix.includes(pw))) {
            console.log(`[Search] Detected generic browsing query (suffix pattern): "${q}"`);
            return true;
        }
    }

    if (genericPrefixPattern.test(q)) {
        const match = q.match(genericPrefixPattern);
        const middle = match[2];
        const plotWords = ['about', 'where', 'who', 'story', 'based on', 'set in'];
        if (!plotWords.some(pw => middle.includes(pw))) {
            console.log(`[Search] Detected generic browsing query (prefix pattern): "${q}"`);
            return true;
        }
    }

    if (moviesOfPattern.test(q)) {
        console.log(`[Search] Detected generic browsing query (of/by pattern): "${q}"`);
        return true;
    }

    return false;
}

export const findMovies = async (req, res) => {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: 'Description required' });

    const cacheKey = `search_${description?.toLowerCase().trim()}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`[Cache] Hit: "${description.substring(0,20)}..."`);
        return res.json(cached);
    }

    try {
        console.log(`[Search] Processing: "${description.substring(0, 50)}..."`);
        
        let aiResults = [];
        const isTitle = isLikelyTitleQuery(description);
        const isGeneric = isGenericBrowsingQuery(description);

        // ─── Fast Path: Direct title lookup ─────────────────────────
        if (isTitle) {
            console.log("[Search] Detected title query. Skipping AI Search.");

            const directResults = await searchTmdbDirect(description);

            if (directResults.length > 0) {
                const enriched = await enrichWithDeepData(directResults);
                const response = { movies: enriched };

                cache.set(cacheKey, response, 3600); // cache for 1 hour
                return res.json(response);
            }
        }

        // ─── Fast Path: Generic browsing query ──────────────────────
        if (isGeneric) {
            console.log("[Search] Detected generic browsing query. Skipping AI, using TMDB direct search.");

            const directResults = await searchTmdbDirect(description);

            if (directResults.length > 0) {
                const enriched = await enrichWithDeepData(directResults);
                const response = { movies: enriched };

                cache.set(cacheKey, response, 3600);
                return res.json(response);
            }
            // If direct search fails for generic query, fall through to AI
        }

        // ─── AI Path: Extract structured params first ───────────────
        let structuredParams = null;
        try {
            structuredParams = await extractStructuredParams(description);
            
            // Double-check: if AI says it's generic but our regex missed it
            if (structuredParams.is_generic && !structuredParams.plot_keywords) {
                console.log("[Search] AI flagged query as generic. Using TMDB direct search.");
                const directResults = await searchTmdbDirect(description);
                if (directResults.length > 0) {
                    const enriched = await enrichWithDeepData(directResults);
                    const response = { movies: enriched };
                    cache.set(cacheKey, response, 3600);
                    return res.json(response);
                }
            }
        } catch (e) {
            console.warn("[Search] Structured param extraction failed, continuing with basic AI search.");
        }

        // ─── AI Search with structured context ──────────────────────
        let aiKeywords = description;
        try {
            const aiData = await callGroqWithFallback(description, structuredParams);
            // Handle both old {results, keywords} and new [results] formats
            if (Array.isArray(aiData)) {
                aiResults = aiData;
                aiKeywords = description;
            } else {
                aiResults = aiData.results || [];
                aiKeywords = aiData.keywords || description;
            }
        } catch (e) {
            if (e.status === 429) {
                return res.status(429).json({ 
                    error: "AI service rate limit exceeded. Please try again later.", 
                    status: 429 
                });
            }
            console.warn("[Search] AI Service Failed. Switching to Fallback.");
        }
        
        // 2. Fallback Logic: Direct TMDB Search if AI returned nothing AND it's a short query
        if ((!aiResults || aiResults.length === 0) && description.split(' ').length < 8) {
            console.log("[Search] AI returned 0 results. Executing Direct TMDB Search with keywords.");
            
            // Extract clean keywords if it's currently a full description
            if (aiKeywords === description) {
                aiKeywords = await extractKeywords(description);
                console.log(`[Fallback] Extracted Keywords: "${aiKeywords}"`);
            }

            const directResults = await searchTmdbDirect(aiKeywords);
            
            if (directResults.length > 0) {
                const enriched = await enrichWithDeepData(directResults);
                const response = { movies: enriched };
                cache.set(cacheKey, response, 300); 
                return res.json(response);
            }
        }

        // If it's a long description and AI returned nothing, we stop here rather than showing irrelevant TMDB results
        if (!aiResults || aiResults.length === 0) {
            return res.json({ movies: [] });
        }

        // 3. Normal AI Flow — resolve AI suggestions against TMDB
        // Determine media type preferences from structured params or description
        const userWantsTV = /show|series|season/i.test(description);
        const allowedMediaTypes = structuredParams?.media_types || (userWantsTV ? ['tv'] : ['movie', 'tv']);

        console.log(`[Search] AI Results:`, JSON.stringify(aiResults));
        const results = await Promise.all(
            aiResults.map(item => {
                // Use the AI's media_type, but allow both types if unspecified
                let effectiveType = item.media_type || 'movie';
                if (userWantsTV) effectiveType = 'tv';
                
                console.log(`[Search] Fetching: "${item.title}" (${item.year}) [${effectiveType}]`);
                return fetchEnrichedData(item.title, item.year, effectiveType);
            })
        );

        const foundMovies = results.filter(Boolean);
        
        if (foundMovies.length === 0) {
             // If AI gave titles but TMDB found nothing, try Direct Search with keywords as last resort
             console.log(`[Search] AI suggestions not found in TMDB. Trying Direct Search with: "${aiKeywords}"`);
             const directResults = await searchTmdbDirect(aiKeywords);
             const enriched = await enrichWithDeepData(directResults);
             return res.json({ movies: enriched });
        } else {
            cache.set(cacheKey, { movies: foundMovies }, 86400);
            res.json({ movies: foundMovies });
        }

    } catch (error) {
        console.error("[Search Controller]", error);
        res.status(500).json({ error: 'Server error' });
    }
};

export const getSimilar = async (req, res) => {
    const { title, media_type, year, genres, overview, cast, director } = req.body;
    if (!title || !media_type) return res.status(400).json({ error: 'Title/Type required' });

    try {
        let finalResults = [];

        // 1. Try AI with enriched context
        try {
            const enrichedData = { genres, overview, cast, director };
            const recommendations = await callGroqSimilar(title, media_type, year, enrichedData);
            if (recommendations && recommendations.length > 0) {
                const enriched = await Promise.all(
                    recommendations.map(item => fetchEnrichedData(item.title, item.year, item.media_type))
                );
                finalResults = enriched.filter(Boolean);
            }
        } catch (e) {
            if (e.status === 429) {
                return res.status(429).json({ 
                    error: "AI service rate limit exceeded. Please try again later.", 
                    status: 429 
                });
            }
            console.warn("[Similar] AI Service Failed. Falling back to native.");
        }

        // 2. Fallback to Native TMDB if AI failed or returned nothing
        if (finalResults.length === 0) {
            console.log(`[Similar] Fallback to Native for: ${title} (${media_type})`);
            const nativeRecs = await getNativeTmdbRecommendations(title, year, media_type);
            if (nativeRecs.length > 0) {
                finalResults = await enrichWithDeepData(nativeRecs, 10);
            }
        }

        res.json({ similar: finalResults });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: 'Error' }); 
    }
};

export const getMediaExtras = async (req, res) => {
    const { id, media_type } = req.body;
    if (!id || !media_type) return res.json({});

    try {
        const providers = await fetchWatchProviders(id, media_type);
        res.json({ providers });
    } catch {
        res.json({ providers: [] });
    }
};
