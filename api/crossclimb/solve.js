// Located at /api/crossclimb/solve.js
// This version uses a two-step "Generator-Refiner" prompt to ensure accuracy.

// --- Helper function to verify the AI's solution ---
function isLadderValid(solution, activeClueWord) {
    if (!solution || !solution.ordered_ladder || !solution.solved_words) return false;
    
    const { ordered_ladder, solved_words } = solution;
    
    // Check 1: All solved words must be in the ordered ladder
    const solvedSet = new Set(solved_words.map(item => item.word.toUpperCase()));
    const ladderSet = new Set(ordered_ladder.map(word => word.toUpperCase()));
    if (solvedSet.size !== ladderSet.size) return false;
    for (const word of solvedSet) {
        if (!ladderSet.has(word)) return false;
    }

    // Check 2: The active clue's word must be at the bottom
    if (ordered_ladder[ordered_ladder.length - 1].toUpperCase() !== activeClueWord.toUpperCase()) return false;

    // Check 3: It must be a valid word ladder (one letter difference)
    for (let i = 0; i < ordered_ladder.length - 1; i++) {
        let diff = 0;
        const word1 = ordered_ladder[i];
        const word2 = ordered_ladder[i+1];
        if (word1.length !== word2.length) return false;
        for (let j = 0; j < word1.length; j++) {
            if (word1[j] !== word2[j]) diff++;
        }
        if (diff !== 1) return false;
    }

    return true;
}


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
            const { allClues, wordLength, activeClue } = request.body;
            if (!allClues || !Array.isArray(allClues) || allClues.length < 2 || !wordLength) {
                return response.status(400).json({ error: 'Missing required fields for ladder.' });
            }

            // --- STEP 1: GENERATOR PROMPT ---
            const generatorPrompt = `
                You are an expert puzzle solver for the LinkedIn game "Crossclimb".
                The game is a word ladder. You need to find a sequence of words where each word is formed by changing only one letter from the previous word.
                All words in the ladder must have the same length.

                Here are the puzzle details:
                - Word Length: ${wordLength}
                - List of available clues (in no particular order): ${allClues.join('; ')}
                - The clue for the BOTTOM word in the ladder is: "${activeClue}"

                Your task is to perform two steps with absolute precision:
                1. Solve each clue to find the corresponding ${wordLength}-letter word. Provide a solved word for EVERY clue.
                2. Arrange ALL solved words into a valid word ladder. The word for "${activeClue}" MUST be at the bottom.

                Return the result in two parts: a list of each clue and its solved word, and a separate list of the final ordered ladder.
            `;

            const schema = {
                type: "OBJECT",
                properties: {
                    "solved_words": {
                        type: "ARRAY",
                        description: `An array of objects, each containing a clue and its corresponding solved word. This array MUST have exactly ${allClues.length} items.`,
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

            const generatorPayload = {
                contents: [{ role: "user", parts: [{ text: generatorPrompt }] }],
                generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 }
            };
            
            // --- First API Call ---
            const genResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(generatorPayload)
            });

            if (!genResponse.ok) throw new Error(`Gemini API failed on generate: ${genResponse.statusText}`);
            
            let initialSolution = JSON.parse((await genResponse.json()).candidates[0].content.parts[0].text);
            const activeClueWord = initialSolution.solved_words.find(sw => sw.clue === activeClue)?.word;

            // --- STEP 2: VERIFICATION & REFINEMENT ---
            if (isLadderValid(initialSolution, activeClueWord)) {
                // If the first solution is good, return it.
                return response.status(200).json(initialSolution);
            }

            // If verification fails, create a refinement prompt.
            const refinerPrompt = `
                The following proposed solution to a Crossclimb puzzle is invalid.
                Proposed Solution: ${JSON.stringify(initialSolution)}

                The rules are:
                1. The 'ordered_ladder' must contain the exact same words as those in 'solved_words'.
                2. The word for the clue "${activeClue}" must be at the bottom of the ladder.
                3. The ladder must be valid, with each word changing by only one letter from the previous one.

                Please analyze the proposed solution, identify the errors, and provide a corrected, valid solution that follows all rules.
            `;

            const refinerPayload = {
                contents: [{ role: "user", parts: [{ text: refinerPrompt }] }],
                generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.0 }
            };

            // --- Second API Call ---
            const refinerResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(refinerPayload)
            });
            
            if (!refinerResponse.ok) throw new Error(`Gemini API failed on refine: ${refinerResponse.statusText}`);

            const finalSolution = JSON.parse((await refinerResponse.json()).candidates[0].content.parts[0].text);
            return response.status(200).json(finalSolution);


        } else if (type === 'final') {
            // ... (final clue logic remains the same)
            const { finalClue, orderedLadder } = request.body;
            if (!finalClue || !orderedLadder || orderedLadder.length < 2) {
                return response.status(400).json({ error: 'Missing required fields for final clue.' });
            }

            const topWord = orderedLadder[0];
            const bottomWord = orderedLadder[orderedLadder.length - 1];
            const middleWords = orderedLadder.slice(1, -1);
            const wordLength = topWord.length;

            const prompt = `
                You are an expert puzzle solver for the final step of the LinkedIn game "Crossclimb".
                A word ladder has been solved.
                - The top word of the ladder is: "${topWord}"
                - The bottom word of the ladder is: "${bottomWord}"
                - The words in the middle of the ladder are: ${middleWords.join(', ')}.

                Now, you are given a final clue that describes a relationship between two *new* words: "${finalClue}".

                Your task is to determine the two new words that solve this final clue.
                IMPORTANT CONSTRAINTS:
                1. The two new words you find MUST NOT be any of the words already used in the ladder (${orderedLadder.join(', ')}).
                2. Both new words MUST be exactly ${wordLength} letters long.
                3. One of the new words must be only one letter different from the top word ("${topWord}"), and the other new word must be only one letter different from the bottom word ("${bottomWord}").

                Return the two new words as a list.
            `;

            const schema = {
                type: "OBJECT",
                properties: {
                    "final_solution": {
                        type: "ARRAY",
                        description: `An array containing the two new ${wordLength}-letter words that solve the final clue, ensuring they are not duplicates of the ladder words.`,
                        items: { "type": "STRING" }
                    }
                },
                required: ["final_solution"]
            };

            payload = {
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

            const result = await response.json();
            const jsonText = result.candidates[0].content.parts[0].text;
            const parsedJson = JSON.parse(jsonText);

            return response.status(200).json(parsedJson);
        } else {
            return response.status(400).json({ error: 'Invalid request type.' });
        }

    } catch (error) {
        console.error('Error in Crossclimb solver function:', error);
        return response.status(500).json({ error: 'An internal server error occurred.' });
    }
}
