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
        const { type } = request.body;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        let payload;

        if (type === 'ladder') {
            const { allClues, wordLength } = request.body;
            if (!allClues || !Array.isArray(allClues) || allClues.length < 2 || !wordLength) {
                return response.status(400).json({ error: 'Missing required fields for ladder.' });
            }

            const prompt = `
                You are an expert puzzle solver for the LinkedIn game "Crossclimb".
                The game is a word ladder. You need to find a sequence of words where each word is formed by changing only one letter from the previous word.
                All words in the ladder must have the same length.

                Here are the puzzle details:
                - Word Length: ${wordLength}
                - List of available clues (in no particular order): ${allClues.join('; ')}
                
                Your task is to perform two steps:
                1. First, for each clue provided, determine the corresponding ${wordLength}-letter word it solves to.
                2. Second, take all the solved words and arrange them into the correct word ladder sequence.

                Return the result in two parts: a list of each clue and its solved word, and a separate list of the final ordered ladder.
            `;

            const schema = {
                type: "OBJECT",
                properties: {
                    "solved_words": {
                        type: "ARRAY",
                        description: "An array of objects, each containing a clue and its corresponding solved word.",
                        items: { type: "OBJECT", properties: { "clue": { "type": "STRING" }, "word": { "type": "STRING" } }, required: ["clue", "word"] }
                    },
                    "ordered_ladder": {
                        type: "ARRAY",
                        description: `An array of the solved ${wordLength}-letter words in the correct word ladder order.`,
                        items: { "type": "STRING" }
                    }
                },
                required: ["solved_words", "ordered_ladder"]
            };

            payload = {
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 }
            };

        } else if (type === 'final') {
            const { finalClue, orderedLadder } = request.body;
            if (!finalClue || !orderedLadder || orderedLadder.length < 2) {
                return response.status(400).json({ error: 'Missing required fields for final clue.' });
            }

            const topWord = orderedLadder[0];
            const bottomWord = orderedLadder[orderedLadder.length - 1];
            const middleWords = orderedLadder.slice(1, -1);

            const prompt = `
                You are an expert puzzle solver for the final step of the LinkedIn game "Crossclimb".
                A word ladder has been solved.
                - The top word of the ladder is: "${topWord}"
                - The bottom word of the ladder is: "${bottomWord}"
                - The words in the middle of the ladder are: ${middleWords.join(', ')}.

                Now, you are given a final clue that describes a relationship between two *new* words: "${finalClue}".

                Your task is to determine the two new words that solve this final clue.
                IMPORTANT: The two new words you find MUST NOT be any of the words already used in the ladder (${orderedLadder.join(', ')}).
                Return the two new words as a list.
            `;

            const schema = {
                type: "OBJECT",
                properties: {
                    "final_solution": {
                        type: "ARRAY",
                        description: "An array containing the two new words that solve the final clue, ensuring they are not duplicates of the ladder words.",
                        items: { "type": "STRING" }
                    }
                },
                required: ["final_solution"]
            };

            payload = {
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 }
            };

        } else {
            return response.status(400).json({ error: 'Invalid request type.' });
        }

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
        console.error('Error in serverless function:', error);
        return response.status(500).json({ error: 'An internal server error occurred.' });
    }
}
