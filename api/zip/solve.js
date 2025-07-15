// Located at /api/zip/solve.js
// This version's algorithm now accounts for walls.

// --- Algorithmic Solver ---

function solveZip(gridSize, numbers, walls) {
    const n = gridSize;
    const totalCells = n * n;
    const path = [];
    const visited = new Set();
    const numberLocations = new Map();
    
    // Create a set of wall strings for fast lookup
    const wallSet = new Set();
    walls.forEach(([[r1, c1], [r2, c2]]) => {
        wallSet.add(`${r1},${c1}-${r2},${c2}`);
        wallSet.add(`${r2},${c2}-${r1},${c1}`);
    });

    for (const num in numbers) {
        numberLocations.set(numbers[num].join(','), parseInt(num));
    }
    
    const sortedNumbers = Object.keys(numbers).map(Number).sort((a, b) => a - b);
    const startNum = sortedNumbers[0];
    const maxNum = sortedNumbers[sortedNumbers.length - 1];

    const [startR, startC] = numbers[startNum];
    
    const dr = [-1, 0, 1, 0];
    const dc = [0, 1, 0, -1];

    function solve(r, c, currentNum) {
        const key = `${r},${c}`;
        path.push([r, c]);
        visited.add(key);

        if (path.length === totalCells) {
            if (currentNum === maxNum && numberLocations.has(key) && numberLocations.get(key) === maxNum) {
                return true;
            }
            if (currentNum === maxNum && !numberLocations.has(key)) {
                return true;
            }
        }
        
        if (numberLocations.has(key) && numberLocations.get(key) !== currentNum) {
            visited.delete(key);
            path.pop();
            return false;
        }

        const nextNum = numberLocations.has(key) ? currentNum + 1 : currentNum;

        for (let i = 0; i < 4; i++) {
            const nr = r + dr[i];
            const nc = c + dc[i];
            const nextKey = `${nr},${nc}`;
            const wallKey = `${r},${c}-${nr},${nc}`;

            // NEW: Check for walls before proceeding
            if (nr >= 0 && nr < n && nc >= 0 && nc < n && !visited.has(nextKey) && !wallSet.has(wallKey)) {
                if (solve(nr, nc, nextNum)) {
                    return true;
                }
            }
        }

        visited.delete(key);
        path.pop();
        return false;
    }

    if (solve(startR, startC, startNum)) {
        return path;
    }
    return null;
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
        const { gridSize, numbers, walls } = request.body;
        if (!gridSize || !numbers || !walls) {
            return response.status(400).json({ error: 'Invalid input format.' });
        }

        const path = solveZip(gridSize, numbers, walls);

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
