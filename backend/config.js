// backend/config.js
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const TMDB_API_KEY = process.env.TMDB_API_KEY;
export const OMDB_API_KEY = process.env.OMDB_API_KEY;

export const PROVIDERS = {
    netflix: 8,
    prime: 119,
    hotstar: 122
};