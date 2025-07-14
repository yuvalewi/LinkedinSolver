// This is the serverless function that will run on Netlify's servers.
// It acts as a secure proxy to the Gemini API.

// We need the 'fetch' function, which is available in Node.js 18+ (Netlify's default)
// If using an older version, you might need a package like 'node-fetch'.

exports.handler = async function(event, context) {
    // 1. Check if the request method is POST.
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    // 2. Get the Gemini API key from secure environment variables.
    // We will set this up in the Netlify dashboard.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'API key not configured on the server.' }),
        };
    }

    try {
        // 3. Get the words from the request sent by the front-end.
        const { words } = JSON.parse(event.body);
        if (!words || !Array.isArray(words) || words.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'Invalid input: "words" array is required.' }),
            };
        }

        // 4. Construct the prompt and schema, just like before.
        const prompt = `
            You are an expert puzzle solver for the LinkedIn game "Pinpoint".
            The game reveals up to five words that all share a single common category.
            Your task is to determine that common category based on the words provided.
            The revealed words are: ${words.join(', ')}.
            What is the most likely category?
        `;

        const schema = {
            type: "OBJECT",
            properties: {
                "category": {
                    type: "STRING",
                    description: "The single, common category for the provided words."
                }
            },
            required: ["category"]
        };
        
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        
        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: schema,
                temperature: 0.3
            }
        };

        // 5. Call the real Gemini API from the secure server.
        const geminiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error("Gemini API Error:", errorText);
            return {
                statusCode: geminiResponse.status,
                body: JSON.stringify({ error: `Gemini API failed: ${geminiResponse.statusText}` }),
            };
        }

        const result = await geminiResponse.json();

        // 6. Extract the answer and send it back to the front-end.
        const jsonText = result.candidates[0].content.parts[0].text;
        const parsedJson = JSON.parse(jsonText);

        return {
            statusCode: 200,
            body: JSON.stringify({ category: parsedJson.category }),
        };

    } catch (error) {
        console.error('Error in serverless function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'An internal server error occurred.' }),
        };
    }
};
