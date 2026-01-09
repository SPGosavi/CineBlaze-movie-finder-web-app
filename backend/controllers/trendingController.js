import cache from '../utils/cache.js';
import { TMDB_API_KEY, PROVIDERS } from '../config.js';
import { fetchTmdb, formatBasicTmdbResult } from '../services/tmdbService.js'; // Import formatter

export const getTrendingAll = async (req, res) => {
    const cached = cache.get('trending_all');
    if (cached) return res.json(cached);

    try {
        const url = `https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_API_KEY}&language=en-US`;
        const data = await fetchTmdb(url);
        
        // Convert raw TMDB items to our app format (ids -> strings)
        data.results = data.results.map(item => formatBasicTmdbResult(item));
        
        cache.set('trending_all', data, 21600);
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
        
        const combined = [
            ...movies.results.slice(0, 10).map(m => formatBasicTmdbResult(m, 'movie')),
            ...tv.results.slice(0, 10).map(m => formatBasicTmdbResult(m, 'tv'))
        ].sort(() => Math.random() - 0.5);

        cache.set('trending_indian', { results: combined }, 21600);
        res.json({ results: combined });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

export const getTrendingPlatform = async (req, res) => {
    const { platform } = req.params;
    const providerId = PROVIDERS[platform];
    const cacheKey = `trending_${platform}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    try {
        const url = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&watch_region=IN&with_watch_providers=${providerId}&sort_by=popularity.desc`;
        const data = await fetchTmdb(url);
        
        data.results = data.results.map(m => formatBasicTmdbResult(m, 'tv'));
        
        cache.set(cacheKey, data, 21600);
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
};