// Located at /api/crossclimb/solve.js
// This version uses a more robust multi-step AI Generate -> AI Verify Pairs -> AI Refine -> Algorithm Order process.

// --- Algorithmic Word Ladder Solver ---

function isOneLetterDiff(word1, word2) {
    if (word1.length !== word2.length) return false;
    let diff = 0;
    for (let i = 0; i < word1.length; i++) {
        if (word1[i].toUpperCase() !== word2[i].toUpperCase()) diff++;
    }
    return diff === 1;
}

function findLadderPath(words, startWord) {
    const wordSet = new Set(words.map(w => w.toUpperCase()));
    const start = startWord.toUpperCase();
    if (!wordSet.has(start)) return null;

    function solve(currentPath) {
        if (currentPath.length === wordSet.size) return currentPath;
        const lastWord = currentPath[currentPath.length - 1];
        for (const word of wordSet) {
            if (!currentPath.includes(word) && isOneLetterDiff(lastWord, word)) {
                currentPath.push(word);
                const result = solve(currentPath);
                if (result) return result;
                currentPath.pop();
            }
        }
        return null;
    }
    const resultPath = solve([start]);
    return resultPath ? resultPath.reverse() : null;
}


// --- Main Handler ---

export default async function handler(request, response) {
    // Handle CORS
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS') return response.status(200).end();
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method Not Allowed' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return response.status(500).json({ error: 'API key not configured.' });

    try {
        const { type } = request.body;
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        
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
                2. Arrange ALL of the solved words into a valid word ladder. The word that solves the clue "${activeClue}" MUST be the last word in the final ordered ladder.

                CRITICAL CONSTRAINTS:
                - The 'ordered_ladder' list MUST contain the exact same words as the words solved from the clues, just in the correct order. Do not invent new words or omit any.
                - The 'ordered_ladder' MUST be a valid word ladder where each word is only one letter different from the word before it.

                Return the result in two parts: a list of each clue and its solved word, and a separate list of the final, valid, ordered ladder.
            `;
            const fullSchema = {
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
            const generatorPayload = { contents: [{ role: "user", parts: [{ text: generatorPrompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: fullSchema, temperature: 0.1 } };
            
            const genResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(generatorPayload) });
            if (!genResponse.ok) throw new Error(`Gemini API failed: ${genResponse.statusText}`);
            let initialSolution = JSON.parse((await genResponse.json()).candidates[0].content.parts[0].text);

            // --- STEP 2: VERIFIER PROMPT ---
            const verifierPrompt = `You are a puzzle verifier. Given a list of clues and proposed solutions, identify which solutions are correct. A solution is correct if the word is a valid answer for the clue. Return a list of the (clue, word) pairs that you believe are solved correctly. Clues and solutions: ${JSON.stringify(initialSolution.solved_words)}`;
            const verifierSchema = {
                type: "OBJECT",
                properties: { "correct_pairs": { type: "ARRAY", description: "A list of the {clue, word} objects that were solved correctly.", items: { type: "OBJECT", properties: { "clue": { "type": "STRING" }, "word": { "type": "STRING" } }, required: ["clue", "word"] } } },
                required: ["correct_pairs"]
            };
            const verifierPayload = { contents: [{ role: "user", parts: [{ text: verifierPrompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: verifierSchema, temperature: 0.0 } };

            const verifierResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(verifierPayload) });
            if (!verifierResponse.ok) throw new Error(`Gemini API failed on verification: ${verifierResponse.statusText}`);
            const { correct_pairs } = JSON.parse((await verifierResponse.json()).candidates[0].content.parts[0].text);

            const correctCluesSet = new Set(correct_pairs.map(p => p.clue));
            const incorrectClues = allClues.filter(clue => !correctCluesSet.has(clue));
            let finalSolvedWords = correct_pairs;
            let refinedWords = [];

            // --- STEP 3: REFINER PROMPT (if needed) ---
            if (incorrectClues.length > 0) {
                const refinerPrompt = `
                    You are an expert puzzle solver for the LinkedIn game "Crossclimb".
                    You are given a puzzle that is partially solved. Your task is to solve the remaining clues.

                    Here are the puzzle details:
                    - Word Length: ${wordLength}
                    - Clues that are ALREADY SOLVED CORRECTLY: ${JSON.stringify(finalSolvedWords)}
                    - Clues that still need to be solved: ${incorrectClues.join('; ')}

                    Your task is to solve ONLY the remaining incorrect clues.
                    Return a list of objects for ONLY the newly solved clues.
                `;
                const refinerSchema = {
                    type: "OBJECT",
                    properties: { "solved_words": { type: "ARRAY", description: `An array of objects for the newly solved clues. This array MUST have exactly ${incorrectClues.length} items.`, items: { type: "OBJECT", properties: { "clue": { "type": "STRING" }, "word": { "type": "STRING" } }, required: ["clue", "word"] } } },
                    required: ["solved_words"]
                };
                const refinerPayload = { contents: [{ role: "user", parts: [{ text: refinerPrompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: refinerSchema, temperature: 0.1 } };
                
                const refinerResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(refinerPayload) });
                if (!refinerResponse.ok) throw new Error(`Gemini API failed on refinement: ${refinerResponse.statusText}`);
                const refinerResult = JSON.parse((await refinerResponse.json()).candidates[0].content.parts[0].text);
                refinedWords = refinerResult.solved_words;
                
                finalSolvedWords = [...finalSolvedWords, ...refinedWords];
            }

            // // --- STEP 4: ALGORITHMIC ORDERING ---
            // const bottomWord = finalSolvedWords.find(sw => sw.clue === activeClue)?.word;
            // if (!bottomWord) {
            //     const debugLog = {
            //         message: 'AI failed to solve or find the active clue in the final word list. Cannot determine ladder order.',
            //         activeClue,
            //         step1_initialSolution: initialSolution,
            //         step2_verifier_correctPairs: correct_pairs,
            //         step3_refiner_incorrectCluesSent: incorrectClues,
            //         step3_refiner_newWordsReceived: refinedWords,
            //         step4_finalWordList: finalSolvedWords
            //     };
            //     return response.status(400).json({ error: JSON.stringify(debugLog, null, 2) });
            // }
            const allSolvedWords = finalSolvedWords.map(sw => sw.word);
            let orderdLadder = findLadderPath(allSolvedWords, finalSolvedWords[finalSolvedWords.length - 1].word);
e
            // --- STEP 5: GRACEFUL FALLBACK ---
            if (!orderedLadder) {
                orderedLadder = finalSolvedWords.map(sw => sw.word);
            }

            return response.status(200).json({ solved_words: finalSolvedWords, ordered_ladder: orderedLadder });

        } else if (type === 'final') {
            const { finalClue, orderedLadder } = request.body;
            if (!finalClue || !orderedLadder || orderedLadder.length < 2) {
                return response.status(400).json({ error: 'Missing required fields for final clue.' });
            }

            const topWord = orderedLadder[0];
            const bottomWord = orderedLadder[orderedLadder.length - 1];
            const middleWords = orderedLadder.slice(1, -1);
            const wordLength = topWord.length;

            const prompt = `You are an expert puzzle solver for the final step of the LinkedIn game "Crossclimb". A word ladder has been solved. - The top word of the ladder is: "${topWord}" - The bottom word of the ladder is: "${bottomWord}" - The words in the middle of the ladder are: ${middleWords.join(', ')}. Now, you are given a final clue that describes a relationship between two *new* words: "${finalClue}". Your task is to determine the two new words that solve this final clue. IMPORTANT CONSTRAINTS: 1. The two new words you find MUST NOT be any of the words already used in the ladder (${orderedLadder.join(', ')}). 2. Both new words MUST be exactly ${wordLength} letters long. 3. One of the new words must be only one letter different from the top word ("${topWord}"), and the other new word must be only one letter different from the bottom word ("${bottomWord}"). Return the two new words as a list.`;
            const schema = { type: "OBJECT", properties: { "final_solution": { type: "ARRAY", description: `An array containing the two new ${wordLength}-letter words that solve the final clue.`, items: { "type": "STRING" } } }, required: ["final_solution"] };
            const payload = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.2 } };
            
            const geminiResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
