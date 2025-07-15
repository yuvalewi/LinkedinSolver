// content/crossclimb.js - Now focuses only on solving and displaying the clues.

const discoveredClues = new Set();
let totalRungs = 0;
let automationDone = false;
let solverHasRun = false;

// --- UI Injection Functions ---

function createOrUpdateOverlay(id, content, isError = false) {
    let overlay = document.getElementById(id);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = id;
        Object.assign(overlay.style, {
            position: 'fixed', top: '20px', right: '20px', zIndex: '9999',
            backgroundColor: 'rgba(42, 52, 65, 0.98)',
            color: 'white', padding: '16px',
            borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            width: '340px', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', 
            border: '1px solid #4b5563'
        });
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = content;
    overlay.style.borderColor = isError ? '#ef4444' : '#3b82f6';
}

function showSolvedWordsUI(solved_words, originalClues) {
    // Re-order the solved words to match the user's input order for consistency
    const clueToWordMap = new Map(solved_words.map(item => [item.clue, item.word]));
    const displaySolvedWords = originalClues.map(clue => ({
        clue: clue,
        word: clueToWordMap.get(clue) || '???'
    }));

    const solvedWordsHTML = displaySolvedWords.map(item => `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.5rem 0.25rem;">
            <p style="color: #d1d5db; font-size: 14px; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.clue}">${item.clue}</p>
            <p style="font-family: monospace; font-weight: 600; color: white; letter-spacing: 0.1em; font-size: 16px; margin: 0;">${item.word.toUpperCase()}</p>
        </div>
    `).join('');

    const html = `
        <div>
            <h3 style="font-size: 20px; font-weight: 600; text-align: center; margin-bottom: 12px; color: #93c5fd;">Solved Words</h3>
            <div style="background-color: #374151; padding: 8px 12px; border-radius: 8px; display: flex; flex-direction: column; gap: 4px;">
                ${solvedWordsHTML}
            </div>
        </div>
    `;
    createOrUpdateOverlay('crossclimb-solver-overlay', html);
}

// --- Core Logic ---

async function callApi(payload) {
    const { vercelUrl } = await chrome.storage.sync.get('vercelUrl');
    if (!vercelUrl) throw new Error('API URL not set in extension options.');
    
    const crossclimbApiUrl = vercelUrl.replace('/pinpoint/solve', '/crossclimb/solve');

    const response = await fetch(crossclimbApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json();
        // The detailed log is now a stringified JSON in the error field
        const errorMessage = typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error, null, 2);
        throw new Error(errorMessage);
    }
    return response.json();
}

async function runLadderSolver() {
    if (solverHasRun) return;

    const clues = Array.from(discoveredClues);
    const wordLength = getWordLength();
    const activeClue = document.querySelector('p.crossclimb__clue')?.textContent.trim();

    if (clues.length < totalRungs || wordLength === 0 || !activeClue) return;

    solverHasRun = true;
    createOrUpdateOverlay('crossclimb-solver-overlay', '<p style="text-align: center; color: #9ca3af;">Solving clues...</p>');
    
    try {
        const result = await callApi({ type: 'ladder', allClues: clues, wordLength, activeClue });
        showSolvedWordsUI(result.solved_words, clues);
    } catch (error) {
        solverHasRun = false;
        // Display the detailed log from the server
        createOrUpdateOverlay('crossclimb-solver-overlay', `<pre style="color: #f87171; white-space: pre-wrap; font-size: 12px;">${error.message}</pre>`, true);
    }
}

// --- Observers and Automation ---

const debouncedRunSolver = debounce(runLadderSolver, 1000);

function handleClueChange(clueElement) {
    if (clueElement && clueElement.textContent) {
        const newClue = clueElement.textContent.trim();
        if (newClue && !discoveredClues.has(newClue)) {
            discoveredClues.add(newClue);
        }
        if (automationDone && discoveredClues.size === totalRungs) {
            debouncedRunSolver();
        } else if (!automationDone) {
            createOrUpdateOverlay('crossclimb-solver-overlay', `<p style="text-align: center; color: #9ca3af;">Automatically discovering clues... (${discoveredClues.size}/${totalRungs})</p>`);
        }
    }
}

async function automateClueDiscovery() {
    const nextButton = document.querySelector('button[aria-label="Go to next row"]');
    if (!nextButton) return;
    const delay = ms => new Promise(res => setTimeout(res, ms));
    for (let i = 0; i < totalRungs * 2; i++) {
        if (discoveredClues.size === totalRungs) break;
        nextButton.click();
        await delay(100);
    }
    automationDone = true;
    if (discoveredClues.size === totalRungs) {
        runLadderSolver();
    }
}

const mainObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.target.matches('.crossclimb__clue')) {
            handleClueChange(mutation.target);
            return;
        }
    }
});

function startObservers() {
    const gameContainer = document.querySelector('.crossclimb__wrapper');
    if (gameContainer) {
        totalRungs = document.querySelectorAll('.crossclimb__guess--middle').length;
        if(totalRungs > 0) {
            mainObserver.observe(gameContainer, { childList: true, subtree: true, characterData: true });
            automateClueDiscovery();
        }
    } else {
        setTimeout(startObservers, 1000);
    }
}

function getWordLength() {
    const guessBoxContainer = document.querySelector('.crossclimb__guess--middle .crossclimb__guess__inner');
    return guessBoxContainer ? guessBoxContainer.querySelectorAll('.crossclimb__guess_box').length : 0;
}

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

startObservers();
