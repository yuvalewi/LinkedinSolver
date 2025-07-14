// Located at /api/queens/solve.js
// This version uses a corrected backtracking algorithm for the "no touching" rule.

// --- Algorithmic Solver ---

// A helper function to check if it's safe to place a queen at board[row][col]
function isSafe(row, col, board, regionsMap, gridSize) {
    // Check this row on left side
    for (let i = 0; i < col; i++) {
        if (board[row][i]) return false;
    }

    // Check if another queen is in the same region
    const currentRegion = regionsMap.get(`${row},${col}`);
    for(let r = 0; r < gridSize; r++) {
        for (let c = 0; c < col; c++) { // Only check previously placed queens
            if(board[r][c] && regionsMap.get(`${r},${c}`) === currentRegion) {
                return false;
            }
        }
    }

    // NEW: Check only for adjacent queens (the "no touching" rule)
    // This is more accurate than the standard N-Queens diagonal check.
    for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < col; c++) {
            if (board[r][c]) {
                // Check if the new queen at (row, col) is adjacent to the existing queen at (r, c)
                if (Math.abs(row - r) <= 1 && Math.abs(col - c) <= 1) {
                    return false;
                }
            }
        }
    }

    return true;
}

// The main recursive backtracking function
function solveNQueensUtil(board, col, regionsMap, gridSize) {
    // Base case: If all queens are placed, the solution is found
    if (col >= gridSize) {
        return true;
    }

    // Consider this column and try placing this queen in all rows one by one
    for (let i = 0; i < gridSize; i++) {
        if (isSafe(i, col, board, regionsMap, gridSize)) {
            board[i][col] = 1; // Place queen

            // Recur to place rest of the queens
            if (solveNQueensUtil(board, col + 1, regionsMap, gridSize)) {
                return true;
            }

            // If placing queen doesn't lead to a solution, backtrack
            board[i][col] = 0;
        }
    }

    // If the queen cannot be placed in any row in this column, return false
    return false;
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
        const { gridSize, regions } = request.body;
        if (!gridSize || !regions) {
            return response.status(400).json({ error: 'Missing required fields.' });
        }

        const board = Array(gridSize).fill(0).map(() => Array(gridSize).fill(0));

        const regionsMap = new Map();
        for (const color in regions) {
            for (const cell of regions[color]) {
                regionsMap.set(`${cell[0]},${cell[1]}`, color);
            }
        }

        if (solveNQueensUtil(board, 0, regionsMap, gridSize) === false) {
            return response.status(200).json({ solution: [], error: "No solution exists" });
        }

        const solution = [];
        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                if (board[i][j] === 1) {
                    solution.push([i, j]);
                }
            }
        }
        
        const finalSolution = [];
        for (let r = 0; r < gridSize; r++) {
            const queen = solution.find(q => q[0] === r);
            if(queen) finalSolution.push(queen);
        }

        return response.status(200).json({ solution: finalSolution });

    } catch (error) {
        console.error('Error in serverless function:', error);
        return response.status(500).json({ error: 'An internal server error occurred.' });
    }
}
