import cache from '../utils/cache.js';
import { TMDB_API_KEY, PROVIDERS } from '../config.js';
import { fetchTmdb, enrichWithDeepData } from '../services/tmdbService.js';

export const getTrendingAll = async (req, res) => {
    const cached = cache.get('trending_all');
    if (cached) return res.json(cached);

    try {
        const url = `https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_API_KEY}&language=en-US`;
        const data = await fetchTmdb(url);
        
        // Use DEEP enrich to get Cast/Director/Ratings
        data.results = await enrichWithDeepData(data.results);
        
        cache.set('trending_all', data);
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const getTrendingIndian = async (req, res) => {
    const cached = cache.get('trending_indian');
    if (cached) return res.json(cached);

    try {
        const movieUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&region=IN&sort_by=popularity.desc&with_original_language=hi|te|ta|ml`;
        const tvUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&watch_region=IN&sort_by=popularity.desc&with_original_language=hi|te|ta|ml`;
        
        const [movies, tv] = await Promise.all([fetchTmdb(movieUrl), fetchTmdb(tvUrl)]);
        
        let combined = [
            ...movies.results.slice(0, 10).map(m => ({ ...m, media_type: 'movie' })),
            ...tv.results.slice(0, 10).map(m => ({ ...m, media_type: 'tv' }))
        ].sort(() => Math.random() - 0.5);

        combined = await enrichWithDeepData(combined, 15);

        const response = { results: combined };
        cache.set('trending_indian', response);
        res.json(response);
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const getTrendingPlatform = async (req, res) => {
    const { platform } = req.params;
    const providerId = PROVIDERS[platform];
    if (!providerId) return res.status(400).json({ error: 'Invalid platform' });

    const cacheKey = `trending_${platform}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
        const url = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&watch_region=IN&with_watch_providers=${providerId}&sort_by=popularity.desc`;
        const data = await fetchTmdb(url);
        
        data.results = data.results.map(m => ({...m, media_type: 'tv'})); 
        data.results = await enrichWithDeepData(data.results);

        cache.set(cacheKey, data);
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
};