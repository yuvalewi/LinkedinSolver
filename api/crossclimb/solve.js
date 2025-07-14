// Located at /api/crossclimb/solve.js
// This version uses a two-step "Generate & Verify" process for the ladder.

// --- Helper function to programmatically verify the AI's ladder solution ---
function verifyLadder(solution, allClues, activeClue) {
    const errors = [];
    if (!solution || !solution.ordered_ladder || !solution.solved_words) {
        errors.push("The basic structure of the solution is missing.");
        return errors;
    }
    
    const { ordered_ladder, solved_words } = solution;

    // Check 1: Did the AI solve for every clue?
    if (solved_words.length !== allClues.length) {
        errors.push(`The AI only solved for ${solved_words.length} out of ${allClues.length} clues.`);
    }

    // Check 2: Are all solved words present in the final ladder?
    const solvedSet = new Set(solved_words.map(item => item.word.toUpperCase()));
    const ladderSet = new Set(ordered_ladder.map(word => word.toUpperCase()));
    if (solvedSet.size !== ladderSet.size) {
        errors.push("The list of solved words and the ordered ladder do not contain the same set of words.");
    }
    for (const word of solvedSet) {
        if (!ladderSet.has(word)) {
            errors.push(`The word "${word}" is in the solved list but missing from the ordered ladder.`);
        }
    }

    // Check 3: Is the active clue's word at the bottom?
    const activeClueWord = solved_words.find(sw => sw.clue === activeClue)?.word;
    if (!activeClueWord) {
        errors.push(`The AI failed to solve for the active clue: "${activeClue}".`);
    } else if (ordered_ladder[ordered_ladder.length - 1].toUpperCase() !== activeClueWord.toUpperCase()) {
        errors.push(`The word for the active clue ("${activeClueWord}") is not at the bottom of the ladder.`);
    }

    // Check 4: Is it a valid word ladder (one letter difference)?
    for (let i = 0; i < ordered_ladder.length - 1; i++) {
        let diff = 0;
        const word1 = ordered_ladder[i];
        const word2 = ordered_ladder[i+1];
        if (word1.length !== word2.length) {
            errors.push(`Words "${word1}" and "${word2}" have different lengths.`);
            continue;
        }
        for (let j = 0; j < word1.length; j++) {
            if (word1[j].toUpperCase() !== word2[j].toUpperCase()) diff++;
        }
        if (diff !== 1) {
            errors.push(`The words "${word1}" and "${word2}" are not one letter apart.`);
        }
    }

    return errors;
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
                1. Solve each clue to find the corresponding ${wordLength}-letter word. It is critical that you provide a solved word for EVERY clue in the list.
                2. Arrange ALL of the solved words into a valid word ladder.

                CRITICAL CONSTRAINTS:
                - The word that solves the clue "${activeClue}" MUST be the last word in the final ordered ladder. You should determine this word first and then build the ladder upwards from it.
                - The 'ordered_ladder' list MUST contain the exact same words as the words solved from the clues, just in the correct order. Do not invent new words or omit any.
                - The 'ordered_ladder' MUST be a valid word ladder where each word is only one letter different from the word before it.

                Return the result in two parts: a list of each clue and its solved word, and a separate list of the final, valid, ordered ladder.
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
                        description: `An array of the solved ${wordLength}-letter words in the correct word ladder order, following all rules.`,
                        items: { "type": "STRING" }
                    }
                },
                required: ["solved_words", "ordered_ladder"]
            };

            const generatorPayload = {
                contents: [{ role: "user", parts: [{ text: generatorPrompt }] }],
                generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.1 }
            };
            
            const genResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(generatorPayload)
            });

            if (!genResponse.ok) throw new Error(`Gemini API failed: ${genResponse.statusText}`);
            
            let initialSolution = JSON.parse((await genResponse.json()).candidates[0].content.parts[0].text);
            
            // --- STEP 2: VERIFICATION & REFINEMENT ---
            const validationErrors = verifyLadder(initialSolution, allClues, activeClue);

            if (validationErrors.length === 0) {
                // If the first solution is good, return it.
                return response.status(200).json(initialSolution);
            }

            // If verification fails, create a refinement prompt.
            const refinerPrompt = `
                You are an expert puzzle solver. A previous attempt to solve a Crossclimb puzzle produced a result that was close, but contained some logical errors. Your task is to re-solve the puzzle correctly.

                Use the previous attempt as a strong hint, as it is likely very close to the correct answer, but do not be bound by it. You must find the single, logically correct solution.

                Previous (potentially flawed) attempt: ${JSON.stringify(initialSolution)}

                Here are the absolute rules of the puzzle you must follow:
                - Word Length: ${wordLength}
                - List of all clues: ${allClues.join('; ')}
                - The clue for the BOTTOM word is: "${activeClue}"

                Your new solution MUST follow these rules exactly:
                1. Solve every single clue from the list correctly. The previous attempt may have made a mistake here.
                2. The word that solves the clue "${activeClue}" must be the final word in the ordered_ladder.
                3. The ordered_ladder must be a valid word ladder where each word changes by only one letter.
                4. The ordered_ladder must contain the exact same words as your newly solved words, just in the correct order.

                Provide a completely new, corrected, and valid solution.
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
                contents: [{ role: "user", parts: [{ text: refinerPrompt }] }],
                generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 }
            };
            
            const geminiResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!geminiResponse.ok) throw new Error(`Gemini API failed: ${geminiResponse.statusText}`);

            const result = await geminiResponse.json();
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
