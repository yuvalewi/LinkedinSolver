// Located at /api/zip/solve.js
// Solves the Zip puzzle algorithmically.

// --- Algorithmic Solver ---

function solveZip(gridSize, numbers) {
    const n = gridSize;
    const totalCells = n * n;
    const path = [];
    const visited = new Set();
    const numberLocations = new Map();

    // Create a map from coordinate string to number
    for (const num in numbers) {
        numberLocations.set(numbers[num].join(','), parseInt(num));
    }
    
    // Sort the numbers to find the start and end points
    const sortedNumbers = Object.keys(numbers).map(Number).sort((a, b) => a - b);
    const startNum = sortedNumbers[0];
    const maxNum = sortedNumbers[sortedNumbers.length - 1];

    const [startR, startC] = numbers[startNum];
    
    // Directions: 0:Up, 1:Right, 2:Down, 3:Left
    const dr = [-1, 0, 1, 0];
    const dc = [0, 1, 0, -1];

    function solve(r, c, currentNum) {
        // Add current cell to path
        const key = `${r},${c}`;
        path.push([r, c]);
        visited.add(key);

        // Check if we have found a complete path
        if (path.length === totalCells) {
            // A valid path must end on a numbered cell if it's the max number
            if (currentNum === maxNum && numberLocations.has(key) && numberLocations.get(key) === maxNum) {
                return true;
            }
            // Or if it's a non-numbered cell but we've found all numbers
            if (currentNum === maxNum && !numberLocations.has(key)) {
                return true;
            }
        }
        
        // If we are on a numbered cell, the number must match
        if (numberLocations.has(key) && numberLocations.get(key) !== currentNum) {
            // Backtrack
            visited.delete(key);
            path.pop();
            return false;
        }

        const nextNum = numberLocations.has(key) ? currentNum + 1 : currentNum;

        // Try all 4 directions
        for (let i = 0; i < 4; i++) {
            const nr = r + dr[i];
            const nc = c + dc[i];
            const nextKey = `${nr},${nc}`;

            // Check if the next cell is valid and not visited
            if (nr >= 0 && nr < n && nc >= 0 && nc < n && !visited.has(nextKey)) {
                if (solve(nr, nc, nextNum)) {
                    return true;
                }
            }
        }

        // Backtrack
        visited.delete(key);
        path.pop();
        return false;
    }

    if (solve(startR, startC, startNum)) {
        return path;
    }
    return null; // No solution found
}


// --- Main Handler ---

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
    
    try {
        const { gridSize, numbers } = request.body;
        if (!gridSize || !numbers) {
            return response.status(400).json({ error: 'Invalid input format.' });
        }

        const path = solveZip(gridSize, numbers);

        if (path) {
            return response.status(200).json({ path });
        } else {
            return response.status(200).json({ path: null, error: "No solution found." });
        }

    } catch (error) {
        console.error('Error in Zip solver function:', error);
        return response.status(500).json({ error: 'An internal server error occurred.' });
    }
}
