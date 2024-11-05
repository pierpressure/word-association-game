class ScoreTracker {
    constructor() {
        this.storageKey = 'wordMasterStats';
        this.stats = this.loadStats();
    }

    loadStats() {
        const defaultStats = {
            totalScore: 0,
            gamesPlayed: 0,
            averageScore: 0,
            lastSubmittedDate: null,
            playerName: null,
            dailyScores: {} // Format: { "2024-10-28": 500, "2024-10-29": 750 }
        };
        
        return JSON.parse(localStorage.getItem(this.storageKey)) || defaultStats;
    }

    saveStats() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.stats));
    }

    addScore(score, dateString) {
        // Don't count the same day twice
        if (this.stats.dailyScores[dateString]) {
            return false;
        }

        this.stats.dailyScores[dateString] = score;
        this.stats.totalScore += score;
        this.stats.gamesPlayed++;
        this.stats.averageScore = Math.round(this.stats.totalScore / this.stats.gamesPlayed);
        this.saveStats();
        return true;
    }

    getPlayerName() {
        return this.stats.playerName;
    }

    setPlayerName(name) {
        this.stats.playerName = name;
        this.saveStats();
    }
}

class WordGame {
    static SUCCESS_MESSAGES = [
    "main character behavior fr fr",
    "you ate that bestie 💫",
    "no thoughts just pure slay 👑",
    "the way you ATE this up ✨",
    "living your best WordMaster era",
    "bestie went off 😌",
    "this is giving genius vibes only ⭐",
    "ok go off intellectual king/queen 👑",
    "not you being a whole wordsmith rn ✨",
    "we love this journey for you 🌟",
    "you understood the assignment fr 📚",
    "purrrr 💅",
    "work bestie, that's so valid 🤝",
    "it's giving galaxy brain 🧠"
];

static FAILURE_MESSAGES = [
    "bestie, there's always tomorrow 🫂",
    "this one ain't the vibe fr 😭",
    "lowkey struggling but we move 😮‍💨",
    "sorry bestie, not your main character moment 🫠",
    "it's giving challenge, but you'll slay tomorrow 💫",
    "this word was not the moment 😤",
    "no because why was this so hard tho 😩",
    "crying and throwing up rn 😭",
    "that's rough bestie 🫂",
    "not me failing the vibe check 💀",
    "this word did not pass the vibe check ❌",
    "im literally screaming and crying rn 😭",
    "unfort bestie 😔",
    "this is not the slay we were looking for 😮‍💨",
    "me to this word: and i oop- 🫢"
];

static WORD_VARIANTS = {
    // Known cases from your word list
    'honour': 'honor',     // 'honor' is in your list
    'labour': 'labor',     // 'labor' is in your list
    'favour': 'favor',     // 'favor' is in your list
    
    // Common variations that might appear in hints
    'colour': 'color',     // might appear in hints for words like 'paint'
    'flavour': 'flavor',   // might appear in hints for words like 'taste'
    'harbour': 'harbor',   // 'harbor' is in your list
    'centre': 'center',    // might appear in hints for words like 'middle'
    'metre': 'meter',      // might appear in hints for geometry-related words
    'theatre': 'theater',  // might appear in hints for words like 'stage'
    'defence': 'defense',  // might appear in hints for words like 'shield'
    'offence': 'offense',  // might appear in hints for combat-related words
    
    // Nature/Science related (relevant to your nature words)
    'grey': 'gray',        // might appear in color-related hints
    'plough': 'plow',      // might appear in hints for farming words like 'field'
    
    // Action words (relevant to your verbs)
    'analyse': 'analyze',  // might appear in hints for thinking words
    'practise': 'practice',// might appear in hints for skill words
    'catalogue': 'catalog',// might appear in hints for organizing words
    
    // Building/Structure related (relevant to your construction words)
    'storey': 'story',    // might appear in hints for 'building' related words
    'armour': 'armor'     // might appear in hints for protection words
};


    constructor() {
        this.MAX_GUESSES = 5;
        this.gameState = {
            targetWord: null,
            guessesLeft: this.MAX_GUESSES,
            score: 0,
            highScore: parseInt(localStorage.getItem('wordGameHighScore') || '0'),
            streak: 0,
            hints: [],
            hintsRevealed: 0,
            dateString: null,
            maxPossibleScore: 1000,
            perfectScorePossible: true,
            shownHintWords: new Set(),  // Add this to track hint words
            usedGuesses: new Set()
        };
        this.scoreTracker = new ScoreTracker();

        const lastPlayed = localStorage.getItem('lastPlayedDate');
        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
            
        if (lastPlayed === today) {
            this.showAlreadyPlayedMessage();
            return;
        }


            this.initializeDOM();
            this.attachEventListeners();
            this.initGame();

       if (!localStorage.getItem('tutorialShown')) {
            this.showFirstTimeExperience();
        }
    }

    normalizeWord(word) {
        word = word.toLowerCase().trim();
        // Check both directions of variant spellings
        return WordGame.WORD_VARIANTS[word] || 
               Object.entries(WordGame.WORD_VARIANTS).find(([_, v]) => v === word)?.[0] || 
               word;
    }

    static getScoreSummaryHTML(score, hintsUsed) {
        let hintPenaltyText = '';
        if (hintsUsed > 0) {
            const maxWithoutHints = 1000;
            const actualMax = hintsUsed === 1 ? 750 : 500;
            const penaltyAmount = maxWithoutHints - actualMax;
            hintPenaltyText = `<div class="hint-penalty-note">
                (Maximum possible score reduced to ${actualMax} points ${hintsUsed === 1 ? 'with one hint' : 'with multiple hints'})
            </div>`;
        }
        return `
            <div class="final-score">
                <h3>Final Score: ${score}</h3>
                ${hintPenaltyText}
            </div>
        `;
    }

    updateGameContentForCompletion() {
        const container = document.querySelector('.container');
        const gameContainer = document.getElementById('game-container');
        const guessForm = document.getElementById('guess-form');
        const guessesContainer = document.getElementById('guesses-container');
        
        if (guessForm) {
            guessForm.style.display = 'none';
        }

        if (guessesContainer) {
            guessesContainer.style.display = 'none';
        }

        // Get today's guesses using date key
        const dateKey = `guessHistory_${this.gameState.dateString}`;
        const guessHistory = JSON.parse(localStorage.getItem(dateKey) || '[]');
        
        const lastScore = parseInt(localStorage.getItem('lastScore') || '0');
        const lastWord = localStorage.getItem('lastWord');
        const hintsUsed = parseInt(localStorage.getItem('hintsUsed') || '0');
        const shareText = localStorage.getItem('lastShareText');
        
        const escapedShareText = shareText ? shareText.replace(/'/g, "\\'").replace(/"/g, '\\"') : '';
        
        const completionContent = document.createElement('div');
        completionContent.className = 'game-summary';
        completionContent.innerHTML = `
            <div class="target-word">Today's word was: <span class="highlight">${lastWord}</span></div>

            <div class="guess-history">
                <h3>Your Guesses:</h3>
                ${guessHistory.map(guess => `
                    <div class="guess-item" style="background: ${guess.color}20">
                        <div class="guess-word">${guess.word}</div>
                        <div class="guess-feedback">
                            <span class="guess-score">Match: ${guess.score}%</span>
                            <span class="points-earned">+${guess.points} points</span>
                            <span class="guess-message">${guess.message}</span>
                            <span class="emoji">${guess.emoji}</span>
                        </div>
                    </div>
                `).join('')}
            </div>

            ${WordGame.getScoreSummaryHTML(lastScore, hintsUsed)}

            <div class="share-section">
                <button class="share-button" onclick="navigator.clipboard.writeText(\`${escapedShareText}\`).then(() => {
                    document.querySelector('.share-tooltip').classList.add('show');
                    setTimeout(() => {
                        document.querySelector('.share-tooltip').classList.remove('show');
                    }, 2000);
                })">
                    <div class="button-content">
                        <svg class="share-icon" width="24" height="24" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M16,5L19,8L7,20L3,20L3,16L16,5M21,15L21,21L15,21L15,19L19,19L19,15L21,15Z"/>
                        </svg>
                        <span>Share Score!</span>
                    </div>
                </button>
                <div class="share-tooltip">Copied to clipboard!</div>
            </div>
        `;

        if (guessesContainer && guessesContainer.parentNode) {
            guessesContainer.parentNode.insertBefore(completionContent, guessesContainer.nextSibling);
        }
    }

showAlreadyPlayedMessage() {
    const container = document.querySelector('.container');
    if (!container) return;

    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.style.display = 'none';
    }

    const guessForm = document.getElementById('guess-form');
    if (guessForm) {
        guessForm.style.display = 'none';
    }

    // Get today's date string from localStorage
    const dateString = localStorage.getItem('lastPlayedDate');
    console.log('Last played date:', dateString);

    const lastScore = parseInt(localStorage.getItem('lastScore') || '0');
    const lastWord = localStorage.getItem('lastWord');
    const hintsUsed = parseInt(localStorage.getItem('hintsUsed') || '0');
    const shareText = localStorage.getItem('lastShareText');

    // Get today's guesses with the correct key
    const dateKey = `guessHistory_${dateString}`;
    console.log('Looking for guesses with key:', dateKey);
    
    const guessHistory = JSON.parse(localStorage.getItem(dateKey) || '[]');
    console.log('Found guess history:', guessHistory);

    // Also check old format just in case
    const oldGuessHistory = JSON.parse(localStorage.getItem('guessHistory') || '[]');
    console.log('Old format guess history:', oldGuessHistory);

    // If we have old format guesses and no new format guesses, migrate them
    if (oldGuessHistory.length > 0 && guessHistory.length === 0) {
        console.log('Migrating old guesses to new format');
        localStorage.setItem(dateKey, JSON.stringify(oldGuessHistory));
        localStorage.removeItem('guessHistory'); // Clean up old format
    }

    const escapedShareText = shareText ? shareText.replace(/'/g, "\\'").replace(/"/g, '\\"') : '';

    container.innerHTML = `
        <div class="already-played-message">
            <h2>You've already played today!</h2>
            <div class="countdown" id="countdown"></div>

            <div class="game-summary">
                <p class="target-word">Today's word was: <span class="highlight">${lastWord}</span></p>

                <div class="guess-history">
                    <h3>Your Guesses:</h3>
                    ${(guessHistory.length > 0 ? guessHistory : oldGuessHistory).map(guess => `
                        <div class="guess-item" style="background: ${guess.color}20">
                            <div class="guess-word">${guess.word}</div>
                            <div class="guess-feedback">
                                <span class="guess-score">Match: ${guess.score}%</span>
                                <span class="points-earned">+${guess.points} points</span>
                                <span class="guess-message">${guess.message}</span>
                                <span class="emoji">${guess.emoji}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>

                ${WordGame.getScoreSummaryHTML(lastScore, hintsUsed)}

                <div class="share-section">
                    <button class="share-button" onclick="navigator.clipboard.writeText(\`${escapedShareText}\`).then(() => {
                        document.querySelector('.share-tooltip').classList.add('show');
                        setTimeout(() => {
                            document.querySelector('.share-tooltip').classList.remove('show');
                        }, 2000);
                    })">
                        <div class="button-content">
                            <svg class="share-icon" width="24" height="24" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M16,5L19,8L7,20L3,20L3,16L16,5M21,15L21,21L15,21L15,19L19,19L19,15L21,15Z"/>
                            </svg>
                            <span>Share Score!</span>
                        </div>
                    </button>
                    <div class="share-tooltip">Copied to clipboard!</div>
                </div>
            </div>

            <div id="already-played-leaderboard"></div>
        </div>`;

    this.updateCountdown();
    setInterval(() => this.updateCountdown(), 1000);
    this.showLeaderboard('already-played-leaderboard');
}

cleanupOldGuesses() {
    const today = new Date();
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('guessHistory_')) {
            const dateString = key.replace('guessHistory_', '');
            const guessDate = new Date(dateString);
            
            // Remove histories older than 7 days
            if ((today - guessDate) > (7 * 24 * 60 * 60 * 1000)) {
                localStorage.removeItem(key);
            }
        }
    }
}
    updateCountdown() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setHours(24, 0, 0, 0);  // Next midnight in local time
        
        const diff = tomorrow - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        const countdownEl = document.getElementById('countdown');
        if (countdownEl) {
            countdownEl.textContent = `Next word in: ${hours}h ${minutes}m ${seconds}s`;
        }
    }


    initializeDOM() {
        // Your existing initializeDOM code stays the same
        this.gameContainer = document.getElementById('game-container');
        this.gameCore = this.gameContainer.querySelector('.game-core');
        this.loadingElement = document.getElementById('loading');
        this.guessForm = document.getElementById('guess-form');
        this.guessInput = document.getElementById('guess-input');
        this.guessesContainer = document.getElementById('guesses-container');
        this.currentScoreElement = document.getElementById('current-score');
        this.highScoreElement = document.getElementById('high-score');
        this.hintsPanel = this.gameContainer.querySelector('.hints-panel');

        const sectionToggles = document.querySelectorAll('.section-toggle');
        sectionToggles.forEach(toggle => {
            toggle.setAttribute('aria-expanded', 'false');
            toggle.addEventListener('click', () => {
                const content = toggle.nextElementSibling;
                const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
                toggle.setAttribute('aria-expanded', !isExpanded);
                content.classList.toggle('show');
            });
        });

        const toggleButton = document.getElementById('toggle-instructions');
        const instructionsContent = document.querySelector('.instructions-content');
        
        if (toggleButton && instructionsContent) {
            toggleButton.addEventListener('click', () => {
                const isVisible = instructionsContent.style.display === 'block';
                instructionsContent.style.display = isVisible ? 'none' : 'block';
                toggleButton.textContent = isVisible ? 'Show Rules' : 'Hide Rules';
                if (!isVisible) {
                    instructionsContent.classList.add('show');
                } else {
                    instructionsContent.classList.remove('show');
                }
            });
        }
        const scoreDisplay = document.querySelector('.score-display');
        if (scoreDisplay) {
            const guessesLeft = document.createElement('div');
            guessesLeft.className = 'guesses-left';
            guessesLeft.innerHTML = `
                <div class="guess-label">Guesses Left</div>
                <div id="guesses-count" class="guess-value">${this.gameState.guessesLeft}</div>
            `;
            scoreDisplay.appendChild(guessesLeft);
        }
    }

    attachEventListeners() {
        // Your existing attachEventListeners code stays the same
        this.guessForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.makeGuess();
        });
        
        this.guessInput.addEventListener('input', () => {
            this.guessInput.classList.remove('error');
        });
    }

async initGame() {
    try {
        // Use the client's local date
        const clientDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
        console.log('Initializing game with client date:', {
            rawDate: new Date(),
            formattedDate: clientDate,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        });
        
        const response = await fetch(`/get-target-word?clientDate=${clientDate}`);
        const data = await response.json();
        
        console.log('Game initialization:', {
            clientDate,
            serverResponse: data
        });
        
        this.gameState = {
            ...this.gameState,
            targetWord: data.word,
            hints: data.hints,
            dateString: clientDate,
            wordNumber: data.wordNumber,
            guessesLeft: this.MAX_GUESSES,
            score: 0,
            streak: 0
        };
        
        this.loadingElement.style.display = 'none';
        this.gameContainer.style.display = 'block';
        this.updateDisplay();
        this.showHints();
        
        // Reveal previously shown hints
        const revealedHints = JSON.parse(localStorage.getItem('revealedHints') || '[]');
        revealedHints.forEach(index => {
            const button = this.hintsPanel.querySelector(`[data-hint-index="${index}"]`);
            if (button) {
                // Use a small timeout to ensure the button exists
                setTimeout(() => {
                    this.revealHint(index, button, index === 0);
                }, 100);
            }
        }); // Added this closing bracket

        // Animate in
        this.gameContainer.style.opacity = 0;
        requestAnimationFrame(() => {
            this.gameContainer.style.transition = 'opacity 0.5s';
            this.gameContainer.style.opacity = 1;
        });
    } catch (error) {
        console.error('Error initializing game:', error);
        this.loadingElement.textContent = 'Error loading game. Please refresh.';
    }
}

    // startTimer() {
    //     if (this.timerInterval) clearInterval(this.timerInterval);
        
    //     this.timerInterval = setInterval(() => {
    //         this.gameState.timeLeft--;
    //         this.updateDisplay();
            
    //         if (this.gameState.timeLeft <= 0) {
    //             this.endGame("Time's up!");
    //         }
    //     }, 1000);
    // }

    updateDisplay() {
        // Update scores
        if (this.currentScoreElement) {
            this.currentScoreElement.textContent = this.gameState.score;
        }
        if (this.highScoreElement) {
            this.highScoreElement.textContent = this.gameState.highScore;
        }

        // Update guesses left counter
        const guessesCount = document.getElementById('guesses-count');
        if (guessesCount) {
            guessesCount.textContent = this.gameState.guessesLeft;
            // Add visual feedback for low guesses
            guessesCount.className = 'guess-value' + 
                (this.gameState.guessesLeft === 1 ? ' last-guess' : '');
        }

        // Update streak if exists
        if (this.gameState.streak > 1) {
            const streakDisplay = document.querySelector('.streak');
            if (!streakDisplay) {
                const streakElement = document.createElement('div');
                streakElement.className = 'streak';
                streakElement.textContent = `🔥 ${this.gameState.streak} Streak!`;
                document.querySelector('.score-display').appendChild(streakElement);
            } else {
                streakDisplay.textContent = `🔥 ${this.gameState.streak} Streak!`;
            }
        }
    }

showHints() {
    // Extract hint words from the hint text first
    const firstHint = this.gameState.hints[0];
    if (firstHint) {
        const hintWordsMatch = firstHint.match(/related words: (.*?)$/);
        if (hintWordsMatch) {
            const hintWords = hintWordsMatch[1].split(', ')
                .map(word => this.normalizeWord(word.trim()));
            this.gameState.shownHintWords = new Set(hintWords);
            console.log('Stored normalized hint words:', Array.from(this.gameState.shownHintWords));
        }
    }

    // Then create the hints panel HTML
    this.hintsPanel.innerHTML = `
        <h3>Available Hints</h3>
        <div class="note">💡 Hint words themselves can't be the answer!</div>
        <div class="hints-list">
            ${this.gameState.hints.map((hint, index) => {
                let hintLabel;
                if (index === 0) {
                    hintLabel = '<span class="hint-label">First Hint <span class="hint-cost free">Always Free</span></span>';
                } else {
                    hintLabel = `<span class="hint-label">Hint ${index + 1} <span class="hint-cost">Lowers max possible score 🫣</span></span>`;
                }
                
                return `
                    <div class="hint-item">
                        <button class="hint-button" data-hint-index="${index}">
                            ${hintLabel}
                        </button>
                        <div class="hint-content" style="display: none;">
                            ${hint}
                            ${index === 0 ? '' : 
                                '<div class="hint-info">Using hints changes your maximum possible points:</div>' +
                                '<div class="score-breakdown">' +
                                    '<div>Perfect guess with no hints: 1000 points maximum</div>' +
                                    '<div>Perfect guess with one hint: 750 points maximum</div>' +
                                    '<div>Perfect guess with both hints: 500 points maximum</div>' +
                                    '<div class="note">You have 5 chances to find the word!</div>' +
                                '</div>'
                            }
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    // Add click handlers for hint buttons
    this.hintsPanel.querySelectorAll('.hint-button').forEach(button => {
        button.addEventListener('click', () => {
            const index = parseInt(button.dataset.hintIndex);
            this.revealHint(index, button);
        });
    });

    // Finally, automatically reveal the first hint
    const firstHintButton = this.hintsPanel.querySelector('.hint-button');
    if (firstHintButton) {
        this.revealHint(0, firstHintButton, true);
    }
}

async checkTimeSync() {
    const clientDate = new Date().toISOString().split('T')[0];
    const response = await fetch(`/debug-time?clientDate=${clientDate}`);
    const data = await response.json();
    console.log('Time sync check:', data);
}

revealHint(index, button, isFree = false) {
    if (button.disabled) return;

    // Get hint content element first
    const hintContent = button.nextElementSibling;
    if (!hintContent) {
        console.error('Hint content element not found');
        return;
    }

    if (!isFree && index > 0) {
        console.log('Before hint reveal:', {
            hintsRevealed: this.gameState.hintsRevealed,
            currentScore: this.gameState.score
        });

        this.gameState.hintsRevealed++;
        localStorage.setItem('currentHintsRevealed', this.gameState.hintsRevealed.toString());
        localStorage.setItem('hintsUsed', this.gameState.hintsRevealed.toString());

        console.log('After hint reveal:', {
            hintsRevealed: this.gameState.hintsRevealed,
            currentScore: this.gameState.score
        });
        
        this.gameState.perfectScorePossible = false;
        this.updateDisplay();
    }

    // Show the hint with animation
    button.disabled = true;
    button.classList.add('revealed');
    hintContent.style.display = 'block';
    
    // Store revealed hint
    const revealedHints = JSON.parse(localStorage.getItem('revealedHints') || '[]');
    if (!revealedHints.includes(index)) {
        revealedHints.push(index);
        localStorage.setItem('revealedHints', JSON.stringify(revealedHints));
    }
    
    // Animate hint reveal
    hintContent.style.opacity = '0';
    hintContent.style.transform = 'translateY(-10px)';
    requestAnimationFrame(() => {
        hintContent.style.transition = 'all 0.3s';
        hintContent.style.opacity = '1';
        hintContent.style.transform = 'translateY(0)';
    });
}

showFirstTimeExperience() {
    // Check if tutorial has been shown before
    if (localStorage.getItem('tutorialShown')) {
        return;
    }

    const tutorialContent = document.createElement('div');
    tutorialContent.className = 'tutorial-modal';
    tutorialContent.innerHTML = `
        <div class="tutorial-content">
            <h2>✨ Welcome to WordMaster! ✨</h2>
            
            <div class="tutorial-section">
                <p>Guess the hidden word based on <span class="highlight">meaning relationships!</span></p>
                
                <div class="example-cards">
                    <div class="example-card">
                        <h3>Example 1: "beach" 🏖️</h3>
                        <div class="example-guesses">
                            <div class="guess-item" style="background: #2ecc7120">
                                <span class="word">sand</span>
                                <span class="score">90% match 🔥</span>
                                <span class="explanation">Super close - direct connection!</span>
                            </div>
                            <div class="guess-item" style="background: #f1c40f20">
                                <span class="word">ocean</span>
                                <span class="score">75% match ⭐</span>
                                <span class="explanation">Getting warmer - related place</span>
                            </div>
                            <div class="guess-item" style="background: #3498db20">
                                <span class="word">tree</span>
                                <span class="score">30% match ❄️</span>
                                <span class="explanation">Not really related</span>
                            </div>
                        </div>
                    </div>

                    <div class="example-card">
                        <h3>Example 2: "sleep" 😴</h3>
                        <div class="example-guesses">
                            <div class="guess-item" style="background: #2ecc7120">
                                <span class="word">rest</span>
                                <span class="score">95% match 🔥</span>
                                <span class="explanation">Almost the same meaning!</span>
                            </div>
                            <div class="guess-item" style="background: #f1c40f20">
                                <span class="word">dream</span>
                                <span class="score">80% match ⭐</span>
                                <span class="explanation">Happens while sleeping</span>
                            </div>
                            <div class="guess-item" style="background: #e67e2220">
                                <span class="word">pillow</span>
                                <span class="score">60% match 🌟</span>
                                <span class="explanation">Used for sleeping</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="tips-section">
                <h3>Quick Tips 💡</h3>
                <ul>
                    <li>Think synonyms, categories, and related concepts</li>
                    <li>First hint is always free - use it!</li>
                    <li>Watch the emojis: 🔥 = very close, ❄️ = far off</li>
                    <li>Perfect match = major points!</li>
                </ul>
            </div>

            <button class="got-it-btn">
                Let's play! 🎮
            </button>
        </div>
    `;

    // Add styles
    const styles = `
        .tutorial-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            padding: 1rem;
            animation: fadeIn 0.3s ease-out;
        }

        .tutorial-content {
            background: white;
            padding: 2rem;
            border-radius: 24px;
            max-width: 90%;
            width: 600px;
            max-height: 90vh;
            overflow-y: auto;
            position: relative;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        }

        .tutorial-content h2 {
            text-align: center;
            margin-bottom: 1.5rem;
            color: #1a2027;
            font-size: 1.8rem;
        }

        .highlight {
            background: linear-gradient(120deg, #6366f180 0%, #6366f130 100%);
            padding: 0.2em 0.4em;
            border-radius: 4px;
        }

        .example-cards {
            display: grid;
            gap: 1.5rem;
            margin: 1.5rem 0;
        }

        .example-card {
            background: #f8fafc;
            padding: 1.5rem;
            border-radius: 16px;
        }

        .example-card h3 {
            margin-bottom: 1rem;
            color: #1a2027;
        }

        .example-guesses {
            display: grid;
            gap: 0.75rem;
        }

        .guess-item {
            padding: 1rem;
            border-radius: 12px;
            display: grid;
            gap: 0.25rem;
        }

        .word {
            font-weight: 600;
            color: #1a2027;
        }

        .score {
            color: #4b5563;
            font-size: 0.9rem;
        }

        .explanation {
            font-size: 0.85rem;
            color: #6b7280;
            font-style: italic;
        }

        .tips-section {
            margin-top: 1.5rem;
            padding: 1.5rem;
            background: #f8fafc;
            border-radius: 12px;
        }

        .tips-section h3 {
            margin-bottom: 1rem;
            color: #1a2027;
        }

        .tips-section ul {
            list-style-type: none;
            padding: 0;
            margin: 0;
        }

        .tips-section li {
            margin: 0.5rem 0;
            padding-left: 1.5rem;
            position: relative;
        }

        .tips-section li::before {
            content: "•";
            position: absolute;
            left: 0;
            color: #6366f1;
        }

        .got-it-btn {
            display: block;
            width: 100%;
            padding: 1rem;
            margin-top: 2rem;
            background: #6366f1;
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 1.1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .got-it-btn:hover {
            background: #4f46e5;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 640px) {
            .tutorial-content {
                padding: 1.5rem;
            }
            
            .example-card {
                padding: 1rem;
            }
        }
    `;

    // Add styles to document
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);

    // Add to DOM
    document.body.appendChild(tutorialContent);

    // Add click handler to button
    const gotItBtn = tutorialContent.querySelector('.got-it-btn');
    gotItBtn.addEventListener('click', () => {
        tutorialContent.remove();
        localStorage.setItem('tutorialShown', 'true');
    });
}

async makeGuess() {
    const guess = this.guessInput.value.trim().toLowerCase();
    if (!guess) return;

    // Check if word was already guessed
    if (this.gameState.usedGuesses.has(guess)) {
        const errorElement = this.createAnimatedElement(
            'div',
            'guess-error',
            `<div class="guess-feedback">
                <span class="guess-message">You already tried that word!</span>
                <span class="emoji">🔄</span>
            </div>`,
            this.guessesContainer
        );
        
        setTimeout(() => {
            errorElement.style.opacity = '0';
            setTimeout(() => errorElement.remove(), 300);
        }, 2000);

        this.guessInput.value = '';
        this.guessInput.focus();
        return;
    }

    try {
        const response = await fetch(`/calculate-score?guess=${guess}&target=${this.gameState.targetWord}`);
        const data = await response.json();
        
        // Add word to used guesses if it's valid
        if (data.score !== null) {
            this.gameState.usedGuesses.add(guess);
        }
        
        // If it's a hint word, modify the response data
        if (this.gameState.shownHintWords.has(guess)) {
            data.score = 90;
            data.message = "That's one of the hint words!";
            data.emoji = "💭";
            data.color = "#f1c40f";
        }
        
        console.log('Making guess:', {
            guess,
            matchScore: data.score,
            currentScore: this.gameState.score,
            hintsRevealed: this.gameState.hintsRevealed
        });
        
        // If word is not valid, show error but don't count as a guess
        if (data.score === null) {
            const errorElement = this.createAnimatedElement(
                'div',
                'guess-error',
                `<div class="guess-feedback">
                    <span class="guess-message">${data.message}</span>
                    <span class="emoji">${data.emoji}</span>
                </div>`,
                this.guessesContainer
            );
            
            setTimeout(() => {
                errorElement.style.opacity = '0';
                setTimeout(() => errorElement.remove(), 300);
            }, 2000);

            this.guessInput.value = '';
            this.guessInput.focus();
            return;
        }
        
        // Calculate guess points based on remaining guesses and score
        let guessPoints = this.calculateGuessPoints(data.score);
        
        // Store guess with date
        this.storeGuessHistory(guess, data, guessPoints);
        
        // Create guess element with animation
        const guessElement = this.createAnimatedElement(
            'div',
            'guess-item',
            `<div class="guess-word">${guess}</div>
            <div class="guess-feedback">
                <span class="guess-score">Match: ${data.score}%</span>
                <span class="points-earned">+${guessPoints} points</span>
                <span class="guess-message">${data.message}</span>
                <span class="emoji">${data.emoji}</span>
            </div>`,
            this.guessesContainer,
            { backgroundColor: `${data.color}20` }
        );
        
        // Update game state
        this.gameState.score += guessPoints;
        this.gameState.guessesLeft--;
        this.gameState.streak = data.score >= 70 ? this.gameState.streak + 1 : 0;
        
        // Clear input and update display
        this.guessInput.value = '';
        this.updateDisplay();
        
        // Check win/lose conditions
        if (data.score === 100 || this.gameState.guessesLeft === 0) {
            console.log('Game ending condition met:', 
                data.score === 100 ? 'Perfect match' : 'No guesses left');
            
            this.applyFinalScore(data.score === 100);
            
            // Disable input immediately
            this.guessInput.disabled = true;
            this.guessForm.querySelector('button').disabled = true;
            
            await this.endGame(data.score === 100 ? 'You got it!' : 'Game Over!');
            return;
        }
    } catch (error) {
        console.error('Error making guess:', error);
        this.guessInput.classList.add('error');
    }
}

storeGuessHistory(guess, data, guessPoints) {
    const dateKey = `guessHistory_${this.gameState.dateString}`;
    let guessHistory = JSON.parse(localStorage.getItem(dateKey) || '[]');
    
    // Add new guess
    guessHistory.push({
        word: guess,
        score: data.score,
        points: guessPoints,
        message: data.message,
        emoji: data.emoji,
        color: data.color
    });
    
    // Ensure we only keep the most recent MAX_GUESSES
    if (guessHistory.length > this.MAX_GUESSES) {
        guessHistory = guessHistory.slice(-this.MAX_GUESSES);
    }
    
    localStorage.setItem(dateKey, JSON.stringify(guessHistory));
}


// Update calculateGuessPoints
calculateGuessPoints(matchScore) {
    console.log('Calculating points:', {
        matchScore,
        currentScore: this.gameState.score,
        hintsRevealed: this.gameState.hintsRevealed,
        guessesLeft: this.gameState.guessesLeft
    });

    // Check if guess was a hint word
    const currentGuess = this.guessInput.value.trim().toLowerCase();
    const normalizedGuess = this.normalizeWord(currentGuess);
    
    // Convert hint words Set to Array, normalize each word, and check for match
    const normalizedHintWords = Array.from(this.gameState.shownHintWords)
        .map(word => this.normalizeWord(word));
    
    if (normalizedHintWords.includes(normalizedGuess)) {
        console.log('Hint word variant detected:', {
            original: currentGuess,
            normalized: normalizedGuess,
            hintWords: normalizedHintWords
        });
        return 90;  // Score for hint words
    }


    if (this.gameState.shownHintWords.has(currentGuess)) {
        return 90;
    }

    // For perfect match (getting the actual word)
    if (matchScore === 100) {
        const currentScore = this.gameState.score;
        let maxPossible;
        
        // Calculate maximum possible based on hints used
        switch (this.gameState.hintsRevealed) {
            case 0:
                maxPossible = 1000;
                break;
            case 1:
                maxPossible = 750;
                break;
            default:
                maxPossible = 400;
                break;
        }
        
        // Apply guess penalty
        const guessesUsed = this.MAX_GUESSES - this.gameState.guessesLeft;
        const guessPenalty = guessesUsed * 50;
        maxPossible = Math.max(300, maxPossible - guessPenalty);
        
        // Calculate how many more points can be awarded
        const remainingPoints = Math.max(300, maxPossible - currentScore);
        
        console.log('Perfect match calculation:', {
            maxPossible,
            currentScore,
            guessesUsed,
            guessPenalty,
            remainingPoints
        });
        
        return remainingPoints;
    }
    
    // Regular scoring for non-perfect guesses
    if (matchScore >= 90) return 100;
    if (matchScore >= 70) return 50;
    if (matchScore >= 50) return 25;
    return 10;
}

testScoring() {
    console.log('Testing scoring scenarios:');
    
    // Test Case 1: Perfect first try, no hints
    this.gameState.score = 0;
    this.gameState.hintsRevealed = 0;
    console.log('Perfect first try, no hints:', this.calculateGuessPoints(100)); // Should be 1000

    // Test Case 2: Perfect after 50 points, no hints
    this.gameState.score = 50;
    this.gameState.hintsRevealed = 0;
    console.log('Perfect after 50 points, no hints:', this.calculateGuessPoints(100)); // Should be 950

    // Test Case 3: Perfect first try with one hint
    this.gameState.score = 0;
    this.gameState.hintsRevealed = 1;
    console.log('Perfect first try with one hint:', this.calculateGuessPoints(100)); // Should be 750

    // Test Case 4: Perfect after 50 points with one hint
    this.gameState.score = 50;
    this.gameState.hintsRevealed = 1;
    console.log('Perfect after 50 points with one hint:', this.calculateGuessPoints(100)); // Should be 700

    // Test Case 5: Perfect first try with two hints
    this.gameState.score = 0;
    this.gameState.hintsRevealed = 2;
    console.log('Perfect first try with two hints:', this.calculateGuessPoints(100)); // Should be 500

    // Test Case 6: Perfect after 50 points with two hints
    this.gameState.score = 50;
    this.gameState.hintsRevealed = 2;
    console.log('Perfect after 50 points with two hints:', this.calculateGuessPoints(100)); // Should be 450
}

calculateHintsPenalty() {
    const hints = this.gameState.hintsRevealed;
    if (hints <= 1) return 0; // First hint is free
    return -(hints - 1) * 250; // -250 points per additional hint
}

// Remove the win bonus calculation since it's built into the guess points
calculateWinBonus() {
    return 0;
}

applyFinalScore(isWin) {
    const baseScore = this.gameState.score;
    const hintsDeduction = this.calculateHintsPenalty();
    const finalScore = Math.max(0, baseScore + hintsDeduction);
    
    // Store final score for later use
    localStorage.setItem('lastScore', finalScore.toString());
    
    this.gameState.score = finalScore;
    this.gameState.scoreBreakdown = {
        baseScore,
        hintsDeduction,
        finalScore
    };
}
// Update endGame method in game.js
    async endGame(message) {
        clearInterval(this.timerInterval);
        
        const finalScore = this.gameState.score;
        const hintsUsed = this.gameState.hintsRevealed;
        const breakdown = this.gameState.scoreBreakdown;
        const isWin = message === 'You got it!';
        
        // Use the dateString from gameState
        if (!this.gameState.dateString) {
            console.error('Missing dateString in gameState:', this.gameState);
            return;
        }

        // Save completion state for today
        localStorage.setItem('lastPlayedDate', this.gameState.dateString);
        localStorage.setItem('lastScore', finalScore.toString());
        localStorage.setItem('lastWord', this.gameState.targetWord);
        localStorage.setItem('hintsUsed', hintsUsed.toString());

        const generateShareText = () => {
            // Get only today's guesses
            const dateKey = `guessHistory_${this.gameState.dateString}`;
            const guessHistory = JSON.parse(localStorage.getItem(dateKey) || '[]');
            
            // Take only up to MAX_GUESSES (3) most recent guesses
            const currentGuesses = guessHistory.slice(-this.MAX_GUESSES);
            
            const journeyText = currentGuesses.map((guess, index) => 
                `Word ${index + 1}: ${guess.score}% ${guess.emoji}`
            ).join('\n');

            const wasSuccess = currentGuesses.some(guess => guess.score === 100);
            
            // Get random message based on success/failure
            const randomMessage = wasSuccess 
                ? WordGame.SUCCESS_MESSAGES[Math.floor(Math.random() * WordGame.SUCCESS_MESSAGES.length)]
                : WordGame.FAILURE_MESSAGES[Math.floor(Math.random() * WordGame.FAILURE_MESSAGES.length)];

            // Make sure blocks only show current game's guesses
            const guessBlocks = Array(5).fill('⬜').map((block, i) => {
                if (i < guessHistory.length) return '🟦';
                return block;
            });
            
            const hintBlocks = Array(2).fill('⬜').map((block, i) => {  // Hints still stay at 3
                if (i < this.gameState.hintsRevealed) return '💡';
                return block;
            });

            return [
                `🧠 WordMaster ${this.gameState.dateString}`,
                '',
                randomMessage,
                '',
                '✨ My Journey:',
                journeyText,
                '',
                `Score: ${this.gameState.score}`,
                '',
                `Guesses: ${guessBlocks.join('')}`,
                `Hints: ${hintBlocks.join('')}`,
                '',
                'Play at: https://word-association-game.onrender.com/'
            ].join('\n');
        };

        // Save share text for later
        const shareText = generateShareText();
        localStorage.setItem('lastShareText', shareText);
        
        // Add score to tracker with the correct dateString
        const isNewScore = this.scoreTracker.addScore(finalScore, this.gameState.dateString);
        
        
        // Check for high score and handle accumulated score submission
        if (finalScore > this.gameState.highScore || !this.scoreTracker.getPlayerName()) {
            this.gameState.highScore = Math.max(finalScore, this.gameState.highScore);
            localStorage.setItem('wordGameHighScore', this.gameState.highScore.toString());
            
            try {
                const name = prompt(
                    this.scoreTracker.getPlayerName() 
                        ? 'You got it!!! And you got a new high score! Enter your name:'
                        : 'Enter your name for the leaderboard:'
                );
                
                if (name) {
                    this.scoreTracker.setPlayerName(name);
                    await this.submitAccumulatedScore();
                }
            } catch (error) {
                console.error('Error submitting score:', error);
            }
        } else if (isNewScore) {
            // Submit accumulated score update even if not a new high score
            await this.submitAccumulatedScore();
        }
        
        const endGameElement = this.createAnimatedElement(
            'div',
            'end-game-modal',
            `
                <div class="end-game-content">
                    <button class="close-modal" style="
                        position: absolute;
                        top: 10px;
                        right: 10px;
                        background: none;
                        border: none;
                        font-size: 1.5rem;
                        cursor: pointer;
                        padding: 5px;
                        color: #64748b;
                    ">×</button>
                    <div class="end-game-header ${isWin ? 'winner' : ''}">
                        <div class="result-emoji">${isWin ? '🎯' : '🙇'}</div>
                        <h2 class="result-text">
                            ${isWin ? 'Brilliant!' : 'Game Over'}
                            ${isWin ? '<span class="emoji-celebration">🎉 🔝</span>' : ''}
                        </h2>
                        <p class="target-word">The word was: <span class="highlight">${this.gameState.targetWord}</span></p>
                        <p class="daily-info">WordMaster ${this.gameState.dateString}</p>
                    </div>

                    <!-- Share button near the top -->
                      <button class="share-button" onclick="
                        navigator.clipboard.writeText(\`${shareText}\`).then(() => {
                            // Find the tooltip within this specific modal
                            const tooltip = this.closest('.end-game-content').querySelector('.share-tooltip');
                            tooltip.classList.add('show');
                            setTimeout(() => {
                                tooltip.classList.remove('show');
                            }, 2000);
                        })">
                        <div class="button-content">
                            <svg class="share-icon" width="24" height="24" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M16,5L19,8L7,20L3,20L3,16L16,5M21,15L21,21L15,21L15,19L19,19L19,15L21,15Z"/>
                            </svg>
                            <span>Share Your Score!</span>
                        </div>
                    </button>
                    <div class="share-tooltip">Copied to clipboard!</div>


                    <!-- Add back the guess history -->
                    <div class="guess-history">
                        <h3>Your Guesses:</h3>
                        ${(() => {
                            const dateKey = `guessHistory_${this.gameState.dateString}`;
                            const guessHistory = JSON.parse(localStorage.getItem(dateKey) || '[]');
                            return guessHistory.map(guess => `
                                <div class="guess-item" style="background: ${guess.color}20">
                                    <div class="guess-word">${guess.word}</div>
                                    <div class="guess-feedback">
                                        <span class="guess-score">Match: ${guess.score}%</span>
                                        <span class="points-earned">+${guess.points} points</span>
                                        <span class="guess-message">${guess.message}</span>
                                        <span class="emoji">${guess.emoji}</span>
                                    </div>
                                </div>
                            `).join('');
                        })()}
                    </div>

                    <div class="score-showcase">
                        <div class="final-score-display">
                            <span class="score-label">Final Score</span>
                            <span class="score-value">${breakdown.finalScore}</span>
                        </div>
                        
                        <div class="score-breakdown">
                            <div class="breakdown-item base-score">
                                <span class="item-label">Base Score</span>
                                <span class="item-value">+${breakdown.baseScore}</span>
                            </div>
                            
                            ${breakdown.hintsDeduction < 0 ? `
                                <div class="breakdown-item penalty">
                                    <span class="item-label">Hints Used (${hintsUsed})</span>
                                    <span class="item-value">${breakdown.hintsDeduction}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    ${breakdown.finalScore > this.gameState.highScore ? `
                        <div class="new-highscore-banner">
                            <div class="trophy-icon">🏆</div>
                            <div class="highscore-text">New High Score!</div>
                        </div>
                    ` : ''}
                </div>
            `,
            this.gameContainer
        );
        
        const closeButton = endGameElement.querySelector('.close-modal');
        closeButton.addEventListener('click', () => {
            endGameElement.remove();
            this.updateGameContentForCompletion(); // Add this line
        });
        
        // Add click handler to close when clicking outside the modal with new behavior
        endGameElement.addEventListener('click', (e) => {
            if (e.target === endGameElement) {
                endGameElement.remove();
                this.updateGameContentForCompletion(); // Add this line
            }
        });
        
        // Start countdown for next word
        this.updateCountdown();
        setInterval(() => this.updateCountdown(), 1000);
        
        // Disable inputs but keep guesses visible
        this.guessInput.disabled = true;
        this.guessForm.querySelector('button').disabled = true;
        const hintButtons = document.querySelectorAll('.hint-button');
        hintButtons.forEach(button => button.disabled = true);
        
        // Show leaderboard
        await this.showLeaderboard();
        localStorage.removeItem('currentHintsRevealed');
        localStorage.removeItem('revealedHints');
    }
    
    async submitAccumulatedScore() {
        const stats = this.scoreTracker.stats;
        if (!stats.playerName) return;

        try {
            await fetch('/submit-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: stats.playerName,
                    score: stats.totalScore,
                    gamesPlayed: stats.gamesPlayed,
                    averageScore: stats.averageScore,
                    dateString: this.gameState.dateString  // Use the stored dateString
                })
            });
        } catch (error) {
            console.error('Error submitting accumulated score:', error);
        }
    }
async showLeaderboard(containerId = null) {
    try {
        const response = await fetch('/leaderboards');
        const { monthly, hallOfFame } = await response.json();
        
        const MIN_GAMES_FOR_HOF = 5;
        const gamesPlayed = this.scoreTracker.stats.gamesPlayed;
        const gamesNeeded = MIN_GAMES_FOR_HOF - gamesPlayed;
        
        // Get the container - either the specified one or the game container
        const container = containerId ? 
            document.getElementById(containerId) : 
            this.gameContainer;

        if (!container) {
            console.error('Leaderboard container not found');
            return;
        }
        
        const leaderboardElement = this.createAnimatedElement(
            'div',
            'leaderboard-container',
            `
                <div class="leaderboard monthly">
                    <h3>🔥 This Month's Champions</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Name</th>
                                <th>Total Score</th>
                                <th>Games</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${monthly.map((entry, index) => `
                                <tr class="${entry.name === this.scoreTracker.getPlayerName() ? 'current-player' : ''}">
                                    <td>${index + 1}</td>
                                    <td>${entry.name}</td>
                                    <td>${entry.totalScore.toLocaleString()}</td>
                                    <td>${entry.gamesPlayed}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="leaderboard hall-of-fame">
                    <h3>🏆 Hall of Fame</h3>
                    ${gamesNeeded > 0 ? `
                        <div class="qualification-message">
                            Play ${gamesNeeded} more game${gamesNeeded === 1 ? '' : 's'} to qualify for Hall of Fame!
                            <div class="progress-bar">
                                <div class="progress" style="width: ${(gamesPlayed/MIN_GAMES_FOR_HOF) * 100}%"></div>
                            </div>
                        </div>
                    ` : ''}
                    <table>
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Name</th>
                                <th>Average</th>
                                <th>Games</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${hallOfFame.map((entry, index) => `
                                <tr class="${entry.name === this.scoreTracker.getPlayerName() ? 'current-player' : ''}">
                                    <td>${index + 1}</td>
                                    <td>${entry.name}</td>
                                    <td>${Math.round(entry.averageScore).toLocaleString()}</td>
                                    <td>${entry.gamesPlayed}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div class="your-stats">
                    <h4>Your Statistics</h4>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <div class="stat-label">Monthly Score</div>
                            <div class="stat-value">${this.scoreTracker.stats.totalScore.toLocaleString()}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-label">Games Played</div>
                            <div class="stat-value">${this.scoreTracker.stats.gamesPlayed}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-label">Average Score</div>
                            <div class="stat-value">${Math.round(this.scoreTracker.stats.averageScore).toLocaleString()}</div>
                        </div>
                    </div>
                </div>
            `,
            container
        );
        
        // Highlight current player's rows
        const currentPlayerRows = leaderboardElement.querySelectorAll('.current-player');
        currentPlayerRows.forEach(row => {
            row.style.backgroundColor = '#6366f120';
            row.style.fontWeight = '600';
        });
    } catch (error) {
        console.error('Error showing leaderboards:', error);
    }
}
    // Helper function to create animated elements
    createAnimatedElement(type, className, innerHTML, parent, styles = {}) {
        const element = document.createElement(type);
        element.className = className;
        element.innerHTML = innerHTML;
        
        // Apply any additional styles
        Object.assign(element.style, styles);
        
        // Set up animation
        element.style.opacity = '0';
        element.style.transform = 'translateY(20px)';
        parent.appendChild(element);
        
        // Trigger animation
        requestAnimationFrame(() => {
            element.style.transition = 'all 0.3s';
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
        });
        
        return element;
    }
}

// Start game when page loads
window.addEventListener('DOMContentLoaded', () => {
    new WordGame();
});