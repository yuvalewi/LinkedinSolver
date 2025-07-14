// Located at /api/crossclimb/solve.js

export default async function handler(request, response) {
    // Handle CORS
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return response.status(500).json({ error: 'API key not configured.' });
    }

    try {
        const { allClues, wordLength } = request.body;
        if (!allClues || !Array.isArray(allClues) || allClues.length < 2 || !wordLength) {
            return response.status(400).json({ error: 'Missing required fields.' });
        }

        const prompt = `
            You are an expert puzzle solver for the LinkedIn game "Crossclimb".
            The game is a word ladder. You need to find a sequence of words where each word is formed by changing only one letter from the previous word.
            All words in the ladder must have the same length.

            Here are the puzzle details:
            - Word Length: ${wordLength}
            - List of available clues (in no particular order): ${allClues.join('; ')}
            
            Your task is to:
            1. Solve each clue to find the corresponding ${wordLength}-letter word.
            2. Determine the correct order of these words to form a valid word ladder.
            3. Return the final, ordered word ladder as a list of words. The ladder typically has 5 words.
        `;

        const schema = {
            type: "OBJECT",
            properties: {
                "solution": {
                    type: "ARRAY",
                    description: `An array of ${wordLength}-letter words representing the solved and correctly ordered ladder.`,
                    items: { "type": "STRING" }
                }
            },
            required: ["solution"]
        };
        
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        
        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 }
        };

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

        return response.status(200).json({ solution: parsedJson.solution });

    } catch (error) {
        console.error('Error in serverless function:', error);
        return response.status(500).json({ error: 'An internal server error occurred.' });
    }
}
