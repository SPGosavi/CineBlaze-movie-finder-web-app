import cache from '../utils/cache.js';
import { callGeminiWithFallback, callGeminiSimilar } from '../services/aiService.js';
import { fetchEnrichedData, getNativeTmdbRecommendations, enrichWithDeepData, searchTmdbDirect } from '../services/tmdbService.js';

export const getMediaDetails = async (req, res) => {
    const { title, year, media_type } = req.body;
    try {
        // Reuse existing logic to fetch full details for one item
        const data = await fetchEnrichedData(title, year, media_type);
        res.json(data || {});
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch details' });
    }
};

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
        
        // 1. Try AI Search
        try {
            aiResults = await callGeminiWithFallback(description);
        } catch (e) {
            console.warn("[Search] AI Service Failed (Rate Limit or Error). Switching to Fallback.");
        }
        
        // 2. Fallback Logic: Direct TMDB Search if AI returned nothing
        if (!aiResults || aiResults.length === 0) {
            console.log("[Search] AI returned 0 results. Executing Direct TMDB Search.");
            
            // Direct search returns items that already have title/year/media_type
            const directResults = await searchTmdbDirect(description);
            
            if (directResults.length > 0) {
                // Enrich these results
                const enriched = await enrichWithDeepData(directResults);
                const response = { movies: enriched };
                // Don't cache fallback results for as long (5 mins vs 24h)
                cache.set(cacheKey, response, 300); 
                return res.json(response);
            }
            
            return res.json({ movies: [] });
        }

        // 3. Normal AI Flow
        const userWantsTV = /show|series|season/i.test(description);
        const results = await Promise.all(
            aiResults.map(item => {
                const effectiveType = userWantsTV ? 'tv' : item.media_type;
                return fetchEnrichedData(item.title, item.year, effectiveType);
            })
        );

        const foundMovies = results.filter(Boolean);
        
        if (foundMovies.length === 0) {
             // If AI gave titles but TMDB found nothing, try Direct Search as last resort
             console.log("[Search] AI suggestions not found in TMDB. Trying Direct Search.");
             const directResults = await searchTmdbDirect(description);
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
    const { title, media_type, year } = req.body;
    if (!title || !media_type) return res.status(400).json({ error: 'Title/Type required' });

    try {
        let finalResults = [];

        // 1. Try AI
        try {
            const recommendations = await callGeminiSimilar(title, media_type, year);
            if (recommendations && recommendations.length > 0) {
                const enriched = await Promise.all(
                    recommendations.map(item => fetchEnrichedData(item.title, item.year, item.media_type))
                );
                finalResults = enriched.filter(Boolean);
            }
        } catch (e) {
            // Fall through if AI fails
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