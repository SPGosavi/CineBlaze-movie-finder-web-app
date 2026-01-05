import fetch from 'node-fetch';
import { TMDB_API_KEY, OMDB_API_KEY } from '../config.js';

export async function fetchTmdb(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('TMDB Error');
    return await res.json();
}

/**
 * Fallback: Direct Keyword Search
 * Used when AI is rate-limited. Searches Movies and TV.
 */
export async function searchTmdbDirect(query) {
    try {
        const movieUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1`;
        const tvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1`;

        const [moviesRes, tvRes] = await Promise.all([fetch(movieUrl), fetch(tvUrl)]);
        const movies = await moviesRes.json();
        const tv = await tvRes.json();

        // Combine and sort by popularity
        const combined = [
            ...(movies.results || []).map(m => ({ ...m, media_type: 'movie' })),
            ...(tv.results || []).map(m => ({ ...m, media_type: 'tv' }))
        ].sort((a, b) => b.popularity - a.popularity).slice(0, 10);

        return combined.map(item => formatTmdbResult(item, item.media_type));
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

export async function enrichWithDeepData(items, limit = 10) {
    if (!items || !Array.isArray(items)) return [];
    const topItems = items.slice(0, limit);
    const remaining = items.slice(limit);

    const enriched = await Promise.all(topItems.map(async (item) => {
        const year = item.release_date?.split('-')[0] || item.first_air_date?.split('-')[0];
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
    const cleanTitle = String(title).replace(/\(\d{4}\)/g, '').trim();
    let result = await performTmdbSearch(cleanTitle, year, preferredType);
    if (result) return result;
    const fallbackType = preferredType === 'movie' ? 'tv' : 'movie';
    return await performTmdbSearch(cleanTitle, year, fallbackType);
}

async function performTmdbSearch(queryTitle, year, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `https://api.themoviedb.org/3/search/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(queryTitle)}&language=en-US&page=1`;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.results || data.results.length === 0) return null;
        if (year) {
            const yearStr = String(year);
            const match = data.results.find(item => {
                const d = item.release_date || item.first_air_date;
                return d && d.startsWith(yearStr);
            });
            if (match) return formatTmdbResult(match, mediaType);
        }
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

async function fetchWatchProviders(id, mediaType) {
    const url = `https://api.themoviedb.org/3/${mediaType}/${id}/watch/providers?api_key=${TMDB_API_KEY}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        const countryData = data.results?.IN || data.results?.US;
        return countryData?.flatrate?.map(p => ({ name: p.provider_name, logo: p.logo_path })) || [];
    } catch (e) { return []; }
}

async function fetchOmdbRatings(title, year, mediaType) {
    if (!title) return { imdb: 'N/A', rotten: 'N/A' };
    const typeParam = mediaType === 'tv' ? 'series' : 'movie';
    let url = `http://www.omdbapi.com/?t=${encodeURIComponent(title)}&type=${typeParam}&apikey=${OMDB_API_KEY}`;
    if (year) url += `&y=${year}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.Response === 'False') {
            if (year) {
                const retryUrl = `http://www.omdbapi.com/?t=${encodeURIComponent(title)}&type=${typeParam}&apikey=${OMDB_API_KEY}`;
                const retryRes = await fetch(retryUrl);
                const retryData = await retryRes.json();
                if (retryData.Response !== 'False') {
                     const rt = retryData.Ratings?.find(r => r.Source === 'Rotten Tomatoes')?.Value || 'N/A';
                     return { imdb: retryData.imdbRating || 'N/A', rotten: rt };
                }
            }
            return { imdb: 'N/A', rotten: 'N/A' };
        }
        const rt = data.Ratings?.find(r => r.Source === 'Rotten Tomatoes')?.Value || 'N/A';
        return { imdb: data.imdbRating || 'N/A', rotten: rt };
    } catch (e) { return { imdb: 'N/A', rotten: 'N/A' }; }
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