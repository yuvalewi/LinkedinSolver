// Located at /api/tango/solve.js
// This version has the row/column uniqueness rule removed.

// --- Algorithmic Solver ---

function isValid(grid, r, c, val, constraintsMap) {
    const n = grid.length;

    // Create a temporary grid to check the new state
    const tempGrid = grid.map(row => [...row]);
    tempGrid[r][c] = val;

    // Rule 1: No more than two identical symbols can be adjacent
    // Check horizontally for "XXX" or "OOO"
    if (c > 1 && tempGrid[r][c-1] === val && tempGrid[r][c-2] === val) return false;
    if (c > 0 && c < n - 1 && tempGrid[r][c-1] === val && tempGrid[r][c+1] === val) return false;
    if (c < n - 2 && tempGrid[r][c+1] === val && tempGrid[r][c+2] === val) return false;
    // Check vertically
    if (r > 1 && tempGrid[r-1][c] === val && tempGrid[r-2][c] === val) return false;
    if (r > 0 && r < n - 1 && tempGrid[r-1][c] === val && tempGrid[r+1][c] === val) return false;
    if (r < n - 2 && tempGrid[r+1][c] === val && tempGrid[r+2][c] === val) return false;


    // Rule 2: Equal number of suns (1) and moons (0) in each row/column
    let rowCounts = { 0: 0, 1: 0 };
    let colCounts = { 0: 0, 1: 0 };
    for (let i = 0; i < n; i++) {
        if (tempGrid[r][i] !== -1) rowCounts[tempGrid[r][i]]++;
        if (tempGrid[i][c] !== -1) colCounts[tempGrid[i][c]]++;
    }
    if (rowCounts[0] > n / 2 || rowCounts[1] > n / 2) return false;
    if (colCounts[0] > n / 2 || colCounts[1] > n / 2) return false;

    // If a row or column is now full, it MUST have a perfect balance
    const n_half = n / 2;
    if (rowCounts[0] + rowCounts[1] === n && (rowCounts[0] !== n_half || rowCounts[1] !== n_half)) return false;
    if (colCounts[0] + colCounts[1] === n && (colCounts[0] !== n_half || colCounts[1] !== n_half)) return false;


    // Rule 3: No two rows or columns are identical - REMOVED AS REQUESTED

    
    // Rule 4: Check constraints (= and X) with neighbors
    const checkConstraint = (r1, c1, r2, c2) => {
        const key = `${r1},${c1}-${r2},${c2}`;
        const rule = constraintsMap.get(key);
        if (rule && tempGrid[r2][c2] !== -1) { // Only check if neighbor is filled
            if (rule === 'equal' && tempGrid[r1][c1] !== tempGrid[r2][c2]) return false;
            if (rule === 'unequal' && tempGrid[r1][c1] === tempGrid[r2][c2]) return false;
        }
        return true;
    };
    if (c > 0 && !checkConstraint(r, c, r, c - 1)) return false;
    if (c < n - 1 && !checkConstraint(r, c, r, c + 1)) return false;
    if (r > 0 && !checkConstraint(r, c, r - 1, c)) return false;
    if (r < n - 1 && !checkConstraint(r, c, r + 1, c)) return false;


    return true;
}

function solve(grid, constraintsMap) {
    const n = grid.length;
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (grid[r][c] === -1) { // Find first empty cell
                // Try placing Moon (0), then Sun (1)
                for (let val of [0, 1]) { 
                    if (isValid(grid, r, c, val, constraintsMap)) {
                        grid[r][c] = val;
                        if (solve(grid, constraintsMap)) {
                            return true; // Solution found
                        }
                        grid[r][c] = -1; // Backtrack
                    }
                }
                return false; // No valid number for this cell, trigger backtracking
            }
        }
    }
    return true; // All cells filled, solution found
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

        if (gridSize % 2 !== 0) {
            return response.status(400).json({ error: "Invalid puzzle: Grid size must be an even number." });
        }

        const constraintsMap = new Map();
        constraints.forEach(c => {
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
