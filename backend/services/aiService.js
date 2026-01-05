import fetch from 'node-fetch';
import { GEMINI_API_KEY } from '../config.js';

export async function callGeminiWithFallback(userQuery) {
    console.log(`[AI] Processing: "${userQuery.substring(0, 30)}..."`);
    
    // Attempt 1: With Google Search
    try {
        const results = await makeGeminiRequest(userQuery, true);
        if (results?.length > 0) return results;
    } catch (e) {
        // If Rate Limit, STOP immediately and throw to controller
        if (e.message === "RATE_LIMIT" || e.message.includes('429')) throw new Error("RATE_LIMIT");
        console.warn("[AI] Attempt 1 failed:", e.message);
    }
    
    // Attempt 2: Internal Knowledge
    try {
        console.log("[AI] Trying Internal Knowledge...");
        return await makeGeminiRequest(userQuery, false) || [];
    } catch (e) { 
        if (e.message === "RATE_LIMIT" || e.message.includes('429')) throw new Error("RATE_LIMIT");
        console.error("[AI] Attempt 2 failed:", e.message);
        return []; 
    }
}

export async function callGeminiSimilar(title, mediaType, year) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
    const systemPrompt = `RecSys. Task: 5 titles similar to "${title}" (${year}). Rules: 1. Match Media Type (${mediaType}). 2. JSON Array ONLY. Format: [{"title": "Title", "year": "YYYY", "media_type": "${mediaType}"}]`;
    const payload = { contents: [{ parts: [{ text: `Find similar to ${title}` }] }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { temperature: 0.3, maxOutputTokens: 500 } };

    try {
        const res = await fetch(apiUrl, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        if (res.status === 429) throw new Error("RATE_LIMIT");
        const data = await res.json();
        return parseJsonSafe(data.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch (e) { 
        if (e.message === "RATE_LIMIT") throw e;
        return []; 
    }
}

async function makeGeminiRequest(userQuery, useTools) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
    
    const systemPrompt = `You are a precision media database assistant.
    Task: Identify the EXACT official movie or TV show title based on the description.
    
    CRITICAL RULES:
    1. **ACCURACY IS PARAMOUNT**: Do not guess. Do not combine words (e.g. "Nolan magician" -> "The Prestige", NOT "The Lost Prestige").
    2. **VERIFY**: Ensure the title exists in real-world databases like TMDB/IMDb.
    3. **MEDIA TYPE**: 
       - TV Series/Show -> "media_type": "tv"
       - Movie -> "media_type": "movie"
    4. **OUTPUT**: Return a RAW JSON Array. No Markdown.
    
    Format: [{"title": "Exact Title", "year": "YYYY", "media_type": "movie"}]`;
    
    const payload = { 
        contents: [{ parts: [{ text: userQuery }] }], 
        systemInstruction: { parts: [{ text: systemPrompt }] }, 
        generationConfig: { temperature: 0.1, maxOutputTokens: 800 } 
    };
    
    if (useTools) payload.tools = [{ "google_search": {} }];
    
    const res = await fetch(apiUrl, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
    
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (!res.ok) return []; // Non-fatal API error
    
    const data = await res.json();
    return parseJsonSafe(data.candidates?.[0]?.content?.parts?.[0]?.text);
}

function parseJsonSafe(text) {
    if (!text) return [];
    try {
        const match = text.match(/\[[\s\S]*\]/);
        return match ? JSON.parse(match[0]) : JSON.parse(text);
    } catch (e) { return []; }
}