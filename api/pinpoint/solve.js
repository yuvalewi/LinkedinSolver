// This file should be located at /api/pinpoint/solve.js
// This version adds CORS headers to allow the Chrome extension to make requests.

export default async function handler(request, response) {
    // --- START OF CORS FIX ---
    // Set headers to allow requests from any origin (or you can restrict it to your extension's ID)
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight "OPTIONS" requests sent by the browser
    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }
    // --- END OF CORS FIX ---

    // 1. Check if the request method is POST.
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. Get the Gemini API key from secure environment variables.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("API Key is missing!");
        return response.status(500).json({ error: 'API key not configured on the server.' });
    }

    try {
        // 3. Get the words from the request body.
        const { words } = request.body;
        if (!words || !Array.isArray(words) || words.length === 0) {
            return response.status(400).json({ error: 'Invalid input: "words" array is required.' });
        }

        // 4. Construct the prompt and schema.
        const prompt = `You are an expert puzzle solver for the LinkedIn game "Pinpoint". The game reveals up to five words that all share a single common category. Your task is to determine that common category based on the words provided. The revealed words are: ${words.join(', ')}. What is the most likely category?`;
        
        const schema = {
            type: "OBJECT",
            properties: { "category": { type: "STRING" } },
            required: ["category"]
        };
        
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        
        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.3 }
        };

        // 5. Call the real Gemini API.
        const geminiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error("Gemini API Error:", errorText);
            return response.status(geminiResponse.status).json({ error: `Gemini API failed: ${geminiResponse.statusText}` });
        }

        const result = await geminiResponse.json();
        const jsonText = result.candidates[0].content.parts[0].text;
        const parsedJson = JSON.parse(jsonText);

        // 6. Send the successful response back to the front-end.
        return response.status(200).json({ category: parsedJson.category });

    } catch (error) {
        console.error('Error in serverless function:', error);
        return response.status(500).json({ error: 'An internal server error occurred.' });
    }
}
