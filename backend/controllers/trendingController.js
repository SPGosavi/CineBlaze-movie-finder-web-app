import cache from "../utils/cache.js";
import { TMDB_API_KEY, PROVIDERS } from "../config.js";
import {
  fetchTmdb,
  formatBasicTmdbResult,
  fetchEnrichedDataById,
  fetchRatings,
} from "../services/tmdbService.js"; // Import formatter

export const getTrendingAll = async (req, res) => {
  const cached = cache.get("trending_all");
  if (cached) return res.json(cached);

  try {
    const url = `https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_API_KEY}&language=en-US`;
    const data = await fetchTmdb(url);

    const basicResults = data.results.map((item) =>
      formatBasicTmdbResult(item)
    );

    const enrichedResults = await Promise.all(
      basicResults.slice(0, 12).map(async (item) => {
        const extra = await fetchEnrichedDataById(item.id, item.media_type);
        const ratings = await fetchRatings(
          item.title,
          item.release_date?.split("-")[0]
        );

        return {
          ...item,
          ...extra,
          imdb_rating: ratings.imdb ?? null,
          rotten_tomatoes: ratings.rt ?? null,
        };
  
      })
    );

    data.results = enrichedResults.filter(Boolean);

    cache.set("trending_all", data, 21600);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

export const getTrendingIndian = async (req, res) => {
  const cached = cache.get("trending_indian");
  if (cached) return res.json(cached);
  try {
    const movieUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&region=IN&sort_by=popularity.desc&with_original_language=hi|te|ta|ml`;
    const tvUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&watch_region=IN&sort_by=popularity.desc&with_original_language=hi|te|ta|ml`;
    const [movies, tv] = await Promise.all([
      fetchTmdb(movieUrl),
      fetchTmdb(tvUrl),
    ]);

    const basicResults = [
      ...movies.results
        .slice(0, 10)
        .map((m) => formatBasicTmdbResult(m, "movie")),
      ...tv.results.slice(0, 10).map((t) => formatBasicTmdbResult(t, "tv")),
    ].sort(() => Math.random() - 0.5);

    const enrichedResults = await Promise.all(
      basicResults.slice(0, 12).map(async (item) => {
        const extra = await fetchEnrichedDataById(item.id, item.media_type);
        const ratings = await fetchRatings(
          item.title,
          item.release_date?.split('-')[0]
        );

        return {
          ...item,
          ...extra,
          imdb_rating: ratings.imdb ?? null,
          rotten_tomatoes: ratings.rt ?? null
        };
      })
    );

    const finalResults = enrichedResults.filter(Boolean);

    const response = { results: finalResults };

    cache.set(cacheKey, response, 21600); // 6 hours
    res.json(response);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

    const basicResults = data.results.map((tv) =>
      formatBasicTmdbResult(tv, "tv")
    );

    const enrichedResults = await Promise.all(
      basicResults.slice(0, 12).map(async (item) => {
        const extra = await fetchEnrichedDataById(item.id, item.media_type);
        const ratings = await fetchRatings(
          item.title,
          item.release_date?.split('-')[0]
        );

        return {
          ...item,
          ...extra,
          imdb_rating: ratings.imdb ?? null,
          rotten_tomatoes: ratings.rt ?? null
        };
      })
    );

    data.results = enrichedResults.filter(Boolean);

    cache.set(cacheKey, data, 21600); // 6 hours
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
