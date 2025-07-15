// Located at /api/crossclimb/solve.js
// This version focuses ONLY on getting the most accurate list of solved words.

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
            const { allClues, wordLength } = request.body;
            if (!allClues || !Array.isArray(allClues) || allClues.length < 2 || !wordLength) {
                return response.status(400).json({ error: 'Missing required fields for ladder.' });
            }

            // --- STEP 1: GENERATOR PROMPT ---
            const generatorPrompt = `You are an expert puzzle solver for the LinkedIn game "Crossclimb". Your task is to solve each clue to find the corresponding ${wordLength}-letter word. Here are the puzzle details: Word Length: ${wordLength}, List of available clues: ${allClues.join('; ')}. Return ONLY a list of objects, where each object contains a 'clue' and its solved 'word'. It is critical that you provide a solved word for EVERY clue.`;
            const schema = {
                type: "OBJECT",
                properties: { "solved_words": { type: "ARRAY", description: `An array of objects, each containing a clue and its corresponding solved word. This array MUST have exactly ${allClues.length} items.`, items: { type: "OBJECT", properties: { "clue": { "type": "STRING" }, "word": { "type": "STRING" } }, required: ["clue", "word"] } } },
                required: ["solved_words"]
            };
            const generatorPayload = { contents: [{ role: "user", parts: [{ text: generatorPrompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.1 } };
            
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

            // --- STEP 3: REFINER PROMPT (if needed) ---
            if (incorrectClues.length > 0) {
                const refinerPrompt = `You are an expert puzzle solver for the LinkedIn game "Crossclimb". You are given a puzzle that is partially solved. Your task is to solve the remaining clues. Here are the puzzle details: - Word Length: ${wordLength} - Clues that are ALREADY SOLVED CORRECTLY: ${JSON.stringify(finalSolvedWords)} - Clues that still need to be solved: ${incorrectClues.join('; ')}. Your task is to solve ONLY the remaining incorrect clues. Return a list of objects for ONLY the newly solved clues.`;
                const refinerSchema = {
                    type: "OBJECT",
                    properties: { "solved_words": { type: "ARRAY", description: `An array of objects for the newly solved clues. This array MUST have exactly ${incorrectClues.length} items.`, items: { type: "OBJECT", properties: { "clue": { "type": "STRING" }, "word": { "type": "STRING" } }, required: ["clue", "word"] } } },
                    required: ["solved_words"]
                };
                const refinerPayload = { contents: [{ role: "user", parts: [{ text: refinerPrompt }] }], generationConfig: { responseMimeType: "application/json", responseSchema: refinerSchema, temperature: 0.1 } };
                
                const refinerResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(refinerPayload) });
                if (!refinerResponse.ok) throw new Error(`Gemini API failed on refinement: ${refinerResponse.statusText}`);
                const { solved_words: refinedWords } = JSON.parse((await refinerResponse.json()).candidates[0].content.parts[0].text);
                
                finalSolvedWords = [...finalSolvedWords, ...refinedWords];
            }

            return response.status(200).json({ solved_words: finalSolvedWords });

        } else {
            return response.status(400).json({ error: 'Invalid request type. This endpoint now only supports "ladder".' });
        }
    } catch (error) {
        console.error('Error in Crossclimb solver function:', error);
        return response.status(500).json({ error: 'An internal server error occurred.' });
    }
}
