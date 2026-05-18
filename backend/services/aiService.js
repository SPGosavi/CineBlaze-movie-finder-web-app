// backend/services/aiService.js
import fetch from "node-fetch";
import { GROQ_API_KEY, TMDB_API_KEY } from "../config.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

export async function callGroqWithFallback(userQuery) {
    console.log("[AI] Processing: \"" + userQuery.substring(0, 30) + "...\"");
    try {
        const results = await makeGroqRequest(userQuery);
        if (results?.length > 0) return results;
        return [];
    } catch (e) {
        console.error("[AI] Request failed:", e.message);
        throw e;
    }
}

export async function callGroqSimilar(title, mediaType, year) {
    const systemPrompt = `You are a precise media database assistant.
    Task: Find 5 titles similar to "${title}" (${year}).
    Rules:
    1. Match Media Type (${mediaType}).
    2. JSON Array ONLY. 
    Format: [{"title": "Title", "year": "YYYY", "media_type": "${mediaType}"}]`;

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Find similar to ${title}` }
    ];

    try {
        const data = await executeGroqRequest(messages, 0.3);
        return parseJsonSafe(data.choices?.[0]?.message?.content);
    } catch (e) {
        console.error("[AI Similar] Error:", e.message);
        throw e;
    }
}

async function getSearchContext(query) {
    try {
        // Step 1: Extract thematic keywords
        const extractPrompt = `Extract 3-4 THEMATIC search terms from this movie description. 
        Focus on: Specific 'plot hooks' (e.g., "hypnotic control", "reincarnation", "found footage"), language, and genre.
        Avoid generic terms like "movie" or "story".
        Output ONLY the search terms separated by space.
        Query: "${query}"`;
        
        const termData = await executeGroqRequest([{ role: "user", content: extractPrompt }], 0);
        const searchTerms = termData.choices?.[0]?.message?.content?.trim() || query;
        console.log(`[Search] Keywords: "${searchTerms}"`);

        // Step 2: Parallel search
        const [wikiRes, tmdbRes] = await Promise.all([
            fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerms)}&format=json&origin=*&srlimit=5`),
            fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(searchTerms)}&language=en-US&page=1`)
        ]);

        const wikiData = await wikiRes.json();
        const tmdbData = await tmdbRes.json();

        const wikiContext = (wikiData.query?.search || []).map(s => `[Wiki] ${s.title}: ${s.snippet.replace(/<[^>]*>?/gm, '')}`).join("\n");
        const tmdbContext = (tmdbData.results || []).slice(0, 5).map(r => `[TMDB] ${r.title || r.name} (${r.release_date || r.first_air_date}): ${r.overview}`).join("\n");

        return `--- EXTERNAL CONTEXT (HINTS) ---\n${wikiContext}\n${tmdbContext}`;
    } catch (e) {
        return "No external context available.";
    }
}

async function makeGroqRequest(userQuery) {
    const searchContext = await getSearchContext(userQuery);

    const systemPrompt = `You are an elite cinema expert and media database assistant.
    Goal: Identify 1-3 movies/shows that match 100% of the user's specific plot points.

    CRITICAL VALIDATION RULES:
    1. **NO GENERIC GUESSES**: Do not return famous movies (e.g., Darr, Raaz, 1920, Sairat) just because they share a general genre or language. These are often incorrect 'safe' guesses.
    2. **PLOT FIDELITY**: If a movie matches 'black magic' but not 'mind control' (or vice versa), it is NOT the correct match. Dig deeper for the specific 'plot hook'.
    3. **HYBRID RECALL**: Use the EXTERNAL CONTEXT as hints, but rely primarily on your deep INTERNAL KNOWLEDGE of world cinema plots. Your internal data is more detailed than these snippets.
    4. **LANGUAGE LOCK**: Strictly match the requested language. If 'Hindi' or 'Indian' is implied, do not return other regional languages unless they are the definitive match.
    5. **RANKING**: Provide 1-3 results. If you are highly certain of one specific match, prioritize it.

    EXTERNAL CONTEXT (MAY BE NOISY - USE CAUTION):
    ${searchContext}

    Format: [{"title": "Title", "year": "YYYY", "media_type": "movie", "reasoning": "Detailed justification of why this SPECIFIC plot fits"}]
    
    Few-Shot Examples for Precision:
    Description: "marathi movie about a man who recalls his first childhood love"
    Output: [{"title": "Ti Saddhya Kay Karte", "year": "2017", "media_type": "movie", "reasoning": "The film specifically follows Anurag reflecting on his childhood first love, which perfectly fits the 'childhood love' hook unlike generic romances."}]

    Description: "an indian movie about a man who controls a girl's mind with black magic"
    Output: [{"title": "Vaash", "year": "2023", "media_type": "movie", "reasoning": "Matches the specific 'mind control via black magic' hook perfectly. This is the original Gujarati version."}, {"title": "Shaitaan", "year": "2024", "media_type": "movie", "reasoning": "The Hindi remake of Vaash, focusing on the specific hypnotic mind control plot point."}]`;

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Query: "${userQuery}"` }
    ];

    const data = await executeGroqRequest(messages, 0); // Deterministic output
    const results = parseJsonSafe(data.choices?.[0]?.message?.content);
    
    console.log("[AI] Reasoning for top match:", results[0]?.reasoning);
    
    return results.map(({ reasoning, ...rest }) => rest).slice(0, 3);
}

async function executeGroqRequest(messages, temperature) {
    const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
            model: MODEL,
            messages,
            temperature,
            max_tokens: 1200,
            stream: false
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Groq API Error: ${response.status}`);
    }

    return await response.json();
}

function parseJsonSafe(text) {
    if (!text) return [];
    try {
        const cleaned = text.replace(/```json|```/g, "").trim();
        const match = cleaned.match(/\[[\s\S]*\]/);
        return match ? JSON.parse(match[0]) : JSON.parse(cleaned);
    } catch (e) {
        console.warn("[AI] JSON Parse failed");
        return [];
    }
}
