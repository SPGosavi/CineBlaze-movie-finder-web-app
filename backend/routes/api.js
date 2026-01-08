import express from 'express';
import { getTrendingAll, getTrendingIndian, getTrendingPlatform } from '../controllers/trendingController.js';
import { findMovies, getSimilar} from '../controllers/searchController.js';

const router = express.Router();

// Trending Routes
router.get('/trending/all', getTrendingAll);
router.get('/trending/indian', getTrendingIndian);
router.get('/trending/platform/:platform', getTrendingPlatform);

// Search Routes
router.post('/find-movies', findMovies);
router.post('/get-similar', getSimilar);
router.post('/media-details', getMediaDetails);

export default router;