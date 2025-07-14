// Located at /api/queens/solve.js
// This version uses a backtracking algorithm instead of the Gemini API.

// --- Algorithmic Solver ---

// A helper function to check if it's safe to place a queen at board[row][col]
function isSafe(row, col, board, regionsMap, gridSize) {
    // Check this row on left side
    for (let i = 0; i < col; i++) {
        if (board[row][i]) return false;
    }

    // Check upper diagonal on left side
    for (let i = row, j = col; i >= 0 && j >= 0; i--, j--) {
        if (board[i][j]) return false;
    }

    // Check lower diagonal on left side
    for (let i = row, j = col; j >= 0 && i < gridSize; i++, j--) {
        if (board[i][j]) return false;
    }
    
    // Check if another queen is in the same region
    const currentRegion = regionsMap.get(`${row},${col}`);
    for(let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
            if(board[r][c] && regionsMap.get(`${r},${c}`) === currentRegion) {
                return false;
            }
        }
    }

    return true;
}

// The main recursive backtracking function to solve the N-Queens problem
function solveNQueensUtil(board, col, regionsMap, gridSize) {
    // Base case: If all queens are placed, then return true
    if (col >= gridSize) {
        return true;
    }

    // Consider this column and try placing this queen in all rows one by one
    for (let i = 0; i < gridSize; i++) {
        if (isSafe(i, col, board, regionsMap, gridSize)) {
            // Place this queen in board[i][col]
            board[i][col] = 1;

            // Recur to place rest of the queens
            if (solveNQueensUtil(board, col + 1, regionsMap, gridSize)) {
                return true;
            }

            // If placing queen in board[i][col] doesn't lead to a solution,
            // then remove queen from board[i][col] (backtrack)
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

        // Create an empty board
        const board = Array(gridSize).fill(0).map(() => Array(gridSize).fill(0));

        // Create a map for quick region lookup for each cell
        const regionsMap = new Map();
        for (const color in regions) {
            for (const cell of regions[color]) {
                regionsMap.set(`${cell[0]},${cell[1]}`, color);
            }
        }

        // Solve the puzzle
        if (solveNQueensUtil(board, 0, regionsMap, gridSize) === false) {
            return response.status(200).json({ solution: [], error: "No solution exists" });
        }

        // Convert the board to the required coordinate format
        const solution = [];
        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                if (board[i][j] === 1) {
                    solution.push([i, j]);
                }
            }
        }
        
        // The problem is solved column by column, but the game expects row by row.
        // We need to re-order the solution so it's one queen per row.
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
