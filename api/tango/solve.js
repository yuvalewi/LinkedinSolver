// Located at /api/tango/solve.js
// Solves the Tango puzzle using the Gemini API.

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
        const { gridSize, initialGrid, constraints } = request.body;
        if (!gridSize || !initialGrid || !constraints) {
            return response.status(400).json({ error: 'Invalid input format.' });
        }

        // --- Prompt Engineering ---
        let prompt = `
            You are an expert logic puzzle solver. The puzzle is a binary grid puzzle called Tango.
            The goal is to fill every cell of a ${gridSize}x${gridSize} grid with one of two symbols, Sun (represented by 1) or Moon (represented by 0).

            The rules are:
            1.  No more than two identical symbols can be adjacent to each other in a row or column. (e.g., 1,1,1 or 0,0,0 is illegal).
            2.  Each row and each column must have an equal number of Suns and Moons (i.e., ${gridSize / 2} of each).
            3.  No two rows can be identical, and no two columns can be identical.
            4.  There are specific constraints between adjacent cells:
                - An '=' sign means the two cells must have the same symbol.
                - An 'X' sign means the two cells must have different symbols.
            
            Here is the specific puzzle to solve:
            - Grid Size: ${gridSize}x${gridSize}
            - Initial State (-1 represents an empty cell):
            ${JSON.stringify(initialGrid)}
            - Constraints:
            ${constraints.map(c => `Cell [${c.c1.join(',')}] and Cell [${c.c2.join(',')}] must be ${c.type}.`).join('\n')}

            Based on these rules and the specific puzzle layout, provide the single, unique, fully solved grid.
        `;

        const schema = {
            type: "OBJECT",
            properties: {
                "solution": {
                    type: "ARRAY",
                    description: `The solved ${gridSize}x${gridSize} grid, where 1 represents a Sun and 0 represents a Moon.`,
                    items: {
                        type: "ARRAY",
                        items: { "type": "NUMBER" }
                    }
                }
            },
            required: ["solution"]
        };
        
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        
        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.0 }
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

        return response.status(200).json(parsedJson);

    } catch (error) {
        console.error('Error in Tango solver function:', error);
        return response.status(500).json({ error: 'An internal server error occurred.' });
    }
}
