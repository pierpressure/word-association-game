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
    constructor() {
        this.MAX_GUESSES = 3;
        this.gameState = {
            targetWord: null,
            guessesLeft: this.MAX_GUESSES,
            score: 0,
            highScore: parseInt(localStorage.getItem('wordGameHighScore') || '0'),
            streak: 0,
            hints: [],
            hintsRevealed: 0,
            dateString: null,  // Initialize dateString
            wordNumber: null   // Also track word number if needed
        };
        this.scoreTracker = new ScoreTracker();

        const lastPlayed = localStorage.getItem('lastPlayedDate');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayString = today.toISOString().split('T')[0];
        
        if (lastPlayed === todayString) {
            this.showAlreadyPlayedMessage();
            return;
        }

        this.initializeDOM();
        this.attachEventListeners();
        this.initGame();
    }

updateGameContentForCompletion() {
    const container = document.querySelector('.container');
    const gameContainer = document.getElementById('game-container');
    const guessForm = document.getElementById('guess-form');
    const guessesContainer = document.getElementById('guesses-container');
    
    // Hide the form
    if (guessForm) {
        guessForm.style.display = 'none';
    }

    // Clear or hide the original guesses container
    if (guessesContainer) {
        guessesContainer.style.display = 'none';
    }

    // Get the stored data
    const lastScore = parseInt(localStorage.getItem('lastScore') || '0');
    const lastWord = localStorage.getItem('lastWord');
    const guessHistory = JSON.parse(localStorage.getItem('guessHistory') || '[]');
    const hintsUsed = parseInt(localStorage.getItem('hintsUsed') || '0');
    const shareText = localStorage.getItem('lastShareText');

    // Create the completion content
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

        <div class="share-section">
            <button class="share-button" onclick="navigator.clipboard.writeText('${shareText}').then(() => {
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

    // Add the completion content after the guesses container
    if (guessesContainer && guessesContainer.parentNode) {
        guessesContainer.parentNode.insertBefore(completionContent, guessesContainer.nextSibling);
    }
}
showAlreadyPlayedMessage() {
    const container = document.querySelector('.container');
    if (!container) return;

    // Disable any existing game elements
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.style.display = 'none';
    }

    const guessForm = document.getElementById('guess-form');
    if (guessForm) {
        guessForm.style.display = 'none';
    }

    const lastScore = parseInt(localStorage.getItem('lastScore') || '0');
    const lastWord = localStorage.getItem('lastWord');
    const guessHistory = JSON.parse(localStorage.getItem('guessHistory') || '[]');
    const hintsUsed = parseInt(localStorage.getItem('hintsUsed') || '0');
    const shareText = localStorage.getItem('lastShareText');

    container.innerHTML = `
        <div class="already-played-message">
            <h2>You've already played today!</h2>
            <div class="countdown" id="countdown"></div>

            <div class="game-summary">
                <p class="target-word">Today's word was: <span class="highlight">${lastWord}</span></p>

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

                <div class="share-section">
                    <button class="share-button" onclick="navigator.clipboard.writeText('${shareText}').then(() => {
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

    // Start countdown to next word
    this.updateCountdown();
    setInterval(() => this.updateCountdown(), 1000);

    // Show leaderboard in the new dedicated container
    this.showLeaderboard('already-played-leaderboard');
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
            const response = await fetch('/get-target-word');
            const data = await response.json();
            
            // Store all the data from server response
            this.gameState = {
                ...this.gameState,
                targetWord: data.word,
                hints: data.hints,
                dateString: data.dateString,    // Make sure we store this
                wordNumber: data.wordNumber,    // And this if needed
                guessesLeft: this.MAX_GUESSES,
                score: 0,
                streak: 0
            };
            
            console.log('Game initialized with date:', this.gameState.dateString); // Debug log
            
            this.loadingElement.style.display = 'none';
            this.gameContainer.style.display = 'block';
            this.updateDisplay();
            this.showHints();
            
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
    this.hintsPanel.innerHTML = `
        <h3>Available Hints</h3>
        <div class="hints-list">
            ${this.gameState.hints.map((hint, index) => {
                let costLabel;
                if (index === 0) {
                    costLabel = '<span class="hint-cost free">Free!</span>';
                } else if (index === 1) {
                    costLabel = '<span class="hint-cost">Costs 300 points</span>';
                } else {
                    costLabel = '<span class="hint-cost">Costs 200 points</span>';
                }
                
                return `
                    <div class="hint-item">
                        <button class="hint-button" data-hint-index="${index}">
                            <span class="hint-label">
                                ${index === 0 ? 'First Hint' : index === 1 ? 'Second Hint' : 'Final Hint'} 
                                ${costLabel}
                            </span>
                        </button>
                        <div class="hint-content" style="display: none;">
                            ${hint}
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

    // Automatically reveal the first hint (it's free)
    const firstHintButton = this.hintsPanel.querySelector('.hint-button');
    if (firstHintButton) {
        this.revealHint(0, firstHintButton, true);
    }
}

// Add this new method for revealing hints:
revealHint(index, button, isFree = false) {
    if (button.disabled) return;

    const hintContent = button.nextElementSibling;
    if (!isFree) {
        // Deduct points based on hint index
        const cost = index === 1 ? 10 : 15;  // Second hint costs 10, third costs 15
        this.gameState.score = Math.max(0, this.gameState.score - cost);
        this.gameState.hintsRevealed++;
        this.updateDisplay();
    }

    // Show the hint with animation
    button.disabled = true;
    button.classList.add('revealed');
    hintContent.style.display = 'block';
    
    // Animate hint reveal
    hintContent.style.opacity = '0';
    hintContent.style.transform = 'translateY(-10px)';
    requestAnimationFrame(() => {
        hintContent.style.transition = 'all 0.3s';
        hintContent.style.opacity = '1';
        hintContent.style.transform = 'translateY(0)';
    });
}
    async makeGuess() {
        const guess = this.guessInput.value.trim().toLowerCase();
        if (!guess) return;

        try {
            const response = await fetch(`/calculate-score?guess=${guess}&target=${this.gameState.targetWord}`);
            const data = await response.json();
            
            // // Debug logs
            // console.log('Guess:', guess);
            // console.log('Score:', data.score);
            // console.log('Guesses left:', this.gameState.guessesLeft);
            // console.log('Game state:', this.gameState);
            
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
            
            // Store the guess data
            const guessHistory = JSON.parse(localStorage.getItem('guessHistory') || '[]');
            guessHistory.push({
                word: guess,
                score: data.score,
                points: guessPoints,
                message: data.message,
                emoji: data.emoji,
                color: data.color
            });
            localStorage.setItem('guessHistory', JSON.stringify(guessHistory));
            
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
                // console.log('Game ending condition met:', 
                (data.score === 100 ? 'Perfect match' : 'No guesses left');
                
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
calculateGuessPoints(matchScore) {
    // Base points for the guess quality
    let points = 0;
    
    if (matchScore === 100) {
        // Perfect match base points depend on which guess it is
        switch (this.MAX_GUESSES - this.gameState.guessesLeft) {
            case 0: // First guess with auto hint = 1000
                points = 1000;
                break;
            case 1: // Second guess with auto hint = 750
                points = 750;
                break;
            case 2: // Third guess with auto hint = 500
                points = 500;
                break;
        }
    } else if (matchScore >= 90) {
        points = 100;
    } else if (matchScore >= 70) {
        points = 50;
    } else if (matchScore >= 50) {
        points = 25;
    } else {
        points = 10;
    }
    
    return points;
}

calculateHintsPenalty() {
    // First hint is automatic and free
    // Additional hints have significant but not devastating penalties
    const penalties = [0, 0, 300, 200];
    const totalPenalty = penalties.slice(0, this.gameState.hintsRevealed + 1).reduce((a, b) => a + b, 0);
    return -totalPenalty;
}

// Remove the win bonus calculation since it's built into the guess points
calculateWinBonus() {
    return 0;
}

applyFinalScore(isWin) {
    const baseScore = this.gameState.score;
    const hintsDeduction = this.calculateHintsPenalty();
    
    // Simpler final calculation
    this.gameState.score = Math.max(0, baseScore + hintsDeduction);
    
    // Store breakdown for display
    this.gameState.scoreBreakdown = {
        baseScore,
        hintsDeduction,
        finalScore: this.gameState.score
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
            const guessBlocks = Array(3).fill('⬜').map((block, i) => {
                if (i < (3 - this.gameState.guessesLeft)) return '🟦';
                return block;
            });
            const hintBlocks = Array(3).fill('⬜').map((block, i) => {
                if (i < hintsUsed) return '💡';
                return block;
            });
            
            return `
👑 WordMaster 👑  ${this.gameState.dateString}
Score: ${breakdown.finalScore}

Guesses: ${guessBlocks.join('')}
Hints: ${hintBlocks.join('')}

Play at: https://word-association-game.onrender.com/
            `.trim();
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
        
        // Create end game modal with close button
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

                <div class="share-section">
                    <div class="share-preview">
                        <h4>Share your results!</h4>
                        ${shareText.split('\n').map(line => 
                            `<div class="share-line">${line}</div>`
                        ).join('')}
                    </div>
                    
                    <button class="share-button" onclick="navigator.clipboard.writeText(\`${shareText}\`).then(() => {
                        document.querySelector('.share-tooltip').classList.add('show');
                        setTimeout(() => {
                            document.querySelector('.share-tooltip').classList.remove('show');
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