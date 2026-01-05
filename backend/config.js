import dotenv from 'dotenv';
dotenv.config();

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const TMDB_API_KEY = process.env.TMDB_API_KEY;
export const OMDB_API_KEY = process.env.OMDB_API_KEY;

export const PROVIDERS = {
    netflix: 8,
    prime: 119,
    hotstar: 122
};