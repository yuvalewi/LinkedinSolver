// This file should be located at /api/pinpoint/solve.js

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured.' }) };
    }

    try {
        const { words } = JSON.parse(event.body);
        if (!words || !Array.isArray(words) || words.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid input.' }) };
        }

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

        const geminiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error("Gemini API Error:", errorText);
            return { statusCode: geminiResponse.status, body: JSON.stringify({ error: `API Error: ${geminiResponse.statusText}` }) };
        }

        const result = await geminiResponse.json();
        const jsonText = result.candidates[0].content.parts[0].text;
        const parsedJson = JSON.parse(jsonText);

        return {
            statusCode: 200,
            body: JSON.stringify({ category: parsedJson.category }),
        };

    } catch (error) {
        console.error('Error in serverless function:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'An internal server error occurred.' }) };
    }
};
