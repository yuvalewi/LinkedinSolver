// Located at /api/tango/solve.js
// This version uses a backtracking algorithm instead of the Gemini API.

// --- Algorithmic Solver ---

function isValid(grid, r, c, val, constraintsMap) {
    const n = grid.length;
    const tempGrid = grid.map(row => [...row]);
    tempGrid[r][c] = val;

    // 1. Adjacency Rule: No more than 2 identical symbols next to each other
    // Check horizontally
    if (c > 1 && tempGrid[r][c] === tempGrid[r][c - 1] && tempGrid[r][c] === tempGrid[r][c - 2]) return false;
    if (c < n - 2 && tempGrid[r][c] === tempGrid[r][c + 1] && tempGrid[r][c] === tempGrid[r][c + 2]) return false;
    if (c > 0 && c < n - 1 && tempGrid[r][c - 1] === tempGrid[r][c] && tempGrid[r][c] === tempGrid[r][c + 1]) return false;
    // Check vertically
    if (r > 1 && tempGrid[r][c] === tempGrid[r - 1][c] && tempGrid[r][c] === tempGrid[r - 2][c]) return false;
    if (r < n - 2 && tempGrid[r][c] === tempGrid[r + 1][c] && tempGrid[r][c] === tempGrid[r + 2][c]) return false;
    if (r > 0 && r < n - 1 && tempGrid[r - 1][c] === tempGrid[r][c] && tempGrid[r][c] === tempGrid[r + 1][c]) return false;

    // 2. Balance Rule: Equal numbers of suns and moons in each row/column
    let rowCounts = { 0: 0, 1: 0 };
    let colCounts = { 0: 0, 1: 0 };
    for (let i = 0; i < n; i++) {
        if (tempGrid[r][i] !== -1) rowCounts[tempGrid[r][i]]++;
        if (tempGrid[i][c] !== -1) colCounts[tempGrid[i][c]]++;
    }
    if (rowCounts[0] > n / 2 || rowCounts[1] > n / 2) return false;
    if (colCounts[0] > n / 2 || colCounts[1] > n / 2) return false;

    // 3. Uniqueness Rule (only check if row/column is full)
    if (rowCounts[0] + rowCounts[1] === n) {
        for (let i = 0; i < r; i++) {
            if (tempGrid[i].every((cell, j) => cell === tempGrid[r][j])) return false;
        }
    }
    if (colCounts[0] + colCounts[1] === n) {
        for (let i = 0; i < c; i++) {
            if (tempGrid.every((row, j) => row[i] === tempGrid[j][c])) return false;
        }
    }

    // 4. Constraint Rules
    const checkConstraint = (nr, nc) => {
        const key = `${r},${c}-${nr},${nc}`;
        const rule = constraintsMap.get(key);
        if (rule && tempGrid[nr][nc] !== -1) {
            if (rule === 'equal' && tempGrid[nr][nc] !== val) return false;
            if (rule === 'unequal' && tempGrid[nr][nc] === val) return false;
        }
        return true;
    };
    if (r > 0 && !checkConstraint(r - 1, c)) return false;
    if (r < n - 1 && !checkConstraint(r + 1, c)) return false;
    if (c > 0 && !checkConstraint(r, c - 1)) return false;
    if (c < n - 1 && !checkConstraint(r, c + 1)) return false;

    return true;
}

function solve(grid, constraintsMap) {
    const n = grid.length;
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (grid[r][c] === -1) { // Find first empty cell
                for (let val of [0, 1]) { // Try placing Moon (0), then Sun (1)
                    if (isValid(grid, r, c, val, constraintsMap)) {
                        grid[r][c] = val;
                        if (solve(grid, constraintsMap)) {
                            return true; // Solution found
                        }
                        grid[r][c] = -1; // Backtrack
                    }
                }
                return false; // No valid number for this cell
            }
        }
    }
    return true; // All cells filled
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
        const { gridSize, initialGrid, constraints } = request.body;
        if (!gridSize || !initialGrid || !constraints) {
            return response.status(400).json({ error: 'Invalid input format.' });
        }

        // Create a map for faster constraint lookups
        const constraintsMap = new Map();
        constraints.forEach(c => {
            // Store the rule in both directions for easy lookup
            constraintsMap.set(`${c.c1.join(',')}-${c.c2.join(',')}`, c.type);
            constraintsMap.set(`${c.c2.join(',')}-${c.c1.join(',')}`, c.type);
        });

        if (solve(initialGrid, constraintsMap)) {
            return response.status(200).json({ solution: initialGrid });
        } else {
            return response.status(200).json({ solution: null, error: "No solution found." });
        }

    } catch (error) {
        console.error('Error in Tango solver function:', error);
        return response.status(500).json({ error: 'An internal server error occurred.' });
    }
}
