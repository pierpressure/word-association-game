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
            // timeLeft: 60
        };
        
        this.initializeDOM();
        this.attachEventListeners();
        this.initGame();
    }

initializeDOM() {
        // Game containers
        this.gameContainer = document.getElementById('game-container');
        this.gameCore = this.gameContainer.querySelector('.game-core');
        this.loadingElement = document.getElementById('loading');
        this.guessForm = document.getElementById('guess-form');
        this.guessInput = document.getElementById('guess-input');
        this.guessesContainer = document.getElementById('guesses-container');
        this.currentScoreElement = document.getElementById('current-score');
        this.highScoreElement = document.getElementById('high-score');
        
        // Find the hints panel instead of creating it
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

        // Add instructions toggle functionality
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
    }


    attachEventListeners() {
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
            
            this.gameState = {
                ...this.gameState,
                targetWord: data.word,
                hints: data.hints,
                guessesLeft: this.MAX_GUESSES,
                score: 0,
                streak: 0,
                // timeLeft: 60
            };
            
            this.loadingElement.style.display = 'none';
            this.gameContainer.style.display = 'block';
            this.updateDisplay();
            // this.startTimer();
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

    // And update the updateDisplay method:
    updateDisplay() {
        // Update scores
        if (this.currentScoreElement) {
            this.currentScoreElement.textContent = this.gameState.score;
        }
        if (this.highScoreElement) {
            this.highScoreElement.textContent = this.gameState.highScore;
        }

        // Update guesses left status
        const gameInfo = this.gameContainer.querySelector('.game-info');
        if (gameInfo) {
            gameInfo.innerHTML = `
                <span>Guesses Left: ${this.gameState.guessesLeft}</span>
                ${this.gameState.streak > 1 ? `<span class="streak">🔥 ${this.gameState.streak} Streak!</span>` : ''}
            `;
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
                    costLabel = '<span class="hint-cost">Costs 10 points</span>';
                } else {
                    costLabel = '<span class="hint-cost">Costs 15 points</span>';
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
            // Apply final scoring adjustments
            this.applyFinalScore(data.score === 100);
            this.endGame(data.score === 100 ? 'You got it!' : 'Game Over!');
        }
    } catch (error) {
        console.error('Error making guess:', error);
        this.guessInput.classList.add('error');
    }
}

calculateGuessPoints(matchScore) {
    // Base points from match quality
    let points = 0;
    
    if (matchScore === 100) {
        points = 300;  // Increased base points for perfect match
    } else if (matchScore >= 90) {
        points = 150;  // Made high matches more rewarding
    } else if (matchScore >= 70) {
        points = 100;  // Better reward for good guesses
    } else if (matchScore >= 50) {
        points = 50;   // Meaningful points for decent guesses
    } else if (matchScore >= 30) {
        points = 25;   // Still get something for trying
    } else {
        points = 10;   // Base points for any attempt
    }
    
    // Bonus for earlier guesses
    const guessMultiplier = 1 + (this.gameState.guessesLeft - 1) * 0.3;
    points = Math.round(points * guessMultiplier);
    
    // Apply streak bonus if applicable
    if (this.gameState.streak > 1) {
        const streakBonus = 1 + (this.gameState.streak * 0.1);
        points = Math.round(points * streakBonus);
    }
    
    return points;
}

calculateWinBonus() {
    let bonus = 100;  // Increased base bonus for solving
    
    // No hints bonus - significant but not overwhelming
    if (this.gameState.hintsRevealed === 0) {
        bonus += 200;  // Substantial no-hints bonus
        
        // Additional bonus for quick solve without hints
        if (this.gameState.guessesLeft === 2) {
            bonus += 250;  // First guess bonus
        } else if (this.gameState.guessesLeft === 1) {
            bonus += 150;  // Second guess bonus
        } else {
            bonus += 50;   // Third guess still gets something
        }
    } else if (this.gameState.hintsRevealed === 1) {
        // Only used free hint
        bonus += 100;
        if (this.gameState.guessesLeft > 0) {
            bonus += 50 * this.gameState.guessesLeft; // Bonus for quick solve with just free hint
        }
    }
    
    return bonus;
}

calculateHintsPenalty() {
    if (this.gameState.hintsRevealed === 0) {
        return 0;
    }
    
    let penalty = 0;
    // Reduced penalties - still meaningful but not devastating
    if (this.gameState.hintsRevealed >= 1) {
        penalty += 20;
    }
    if (this.gameState.hintsRevealed >= 2) {
        penalty += 30;
    }
    if (this.gameState.hintsRevealed >= 3) {
        penalty += 40;
    }
    
    return -penalty;
}

applyFinalScore(isWin) {
    const baseScore = this.gameState.score;
    console.log('Base accumulated score:', baseScore);
    
    const hintsDeduction = this.calculateHintsPenalty();
    console.log('Hints deduction:', hintsDeduction);
    
    let winBonus = 0;
    if (isWin) {
        winBonus = this.calculateWinBonus();
        console.log('Win bonus:', winBonus);
    }
    
    // Final calculation
    this.gameState.score = Math.max(0, baseScore + hintsDeduction + winBonus);
    console.log('FINAL SCORE:', this.gameState.score);
    
    this.gameState.scoreBreakdown = {
        baseScore,
        hintsDeduction,
        winBonus,
        finalScore: this.gameState.score
    };
}
async endGame(message) {
    clearInterval(this.timerInterval);
    
    const finalScore = this.gameState.score;
    const hintsUsed = this.gameState.hintsRevealed;
    const breakdown = this.gameState.scoreBreakdown;
    const isWin = message === 'You got it!';
    
    // Generate share text
    const generateShareText = () => {
        const guessBlocks = Array(3).fill('⬜').map((block, i) => {
            if (i < (3 - this.gameState.guessesLeft)) return '🟦';  // Used guess
            return block;  // Unused guess
        });
        const hintBlocks = Array(3).fill('⬜').map((block, i) => {
            if (i < hintsUsed) return '💡';  // Used hint
            return block;  // Unused hint
        });

        return `
🎯 WordMaster Score: ${breakdown.finalScore}

Guesses: ${guessBlocks.join('')}
Hints: ${hintBlocks.join('')}

Play WordMaster at: https://word-association-game.onrender.com/
`.trim();
    };
    
    // Check for high score
    if (finalScore > this.gameState.highScore) {
        this.gameState.highScore = finalScore;
        localStorage.setItem('wordGameHighScore', finalScore.toString());
        
        // Submit to leaderboard
        try {
            const name = prompt('New high score! Enter your name:');
            if (name) {
                await fetch('/submit-score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, score: finalScore })
                });
            }
        } catch (error) {
            console.error('Error submitting score:', error);
        }
    }
    
    // Create end game modal
  const endGameElement = this.createAnimatedElement(
    'div',
    'end-game-modal',
    `
        <div class="end-game-content">
            <div class="end-game-header ${isWin ? 'winner' : ''}">
                <div class="result-emoji">${isWin ? '🎯' : '🎲'}</div>
                <h2 class="result-text">${isWin ? 'Brilliant!' : 'Game Over'}</h2>
                <p class="target-word">The word was: <span class="highlight">${this.gameState.targetWord}</span></p>
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
                    
                    ${breakdown.winBonus > 0 ? `
                        <div class="breakdown-item bonus">
                            <span class="item-label">Win Bonus</span>
                            <span class="item-value">+${breakdown.winBonus}</span>
                        </div>
                    ` : ''}
                    
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
            <div class="perfect-score-note">
                ${breakdown.finalScore === 1000 ? 
                    `🏆 You achieved a perfect score! 🏆` : 
                    `Perfect score possible: 1000 points`
                }
            </div>

            <div class="share-section">
                <div class="share-preview">
                    ${generateShareText().split('\n').map(line => 
                        `<div class="share-line">${line}</div>`
                    ).join('')}
                </div>
            </div>

            <div class="end-game-actions">
                <button class="play-again-button" onclick="window.location.reload()">
                    Play Again
                </button>
                <button class="share-button" onclick="navigator.clipboard.writeText(\`${generateShareText()}\`).then(() => {
                    document.querySelector('.share-tooltip').classList.add('show');
                    setTimeout(() => {
                        document.querySelector('.share-tooltip').classList.remove('show');
                    }, 2000);
                })">
                    <span class="button-content">
                        <svg class="share-icon" width="20" height="20" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M16,5L19,8L7,20L3,20L3,16L16,5M21,15L21,21L15,21L15,19L19,19L19,15L21,15Z"/>
                        </svg>
                        Share Score
                    </span>
                </button>
                <div class="share-tooltip">Copied to clipboard!</div>
            </div>
        </div>
    `,
    this.gameContainer
);
    
    // Disable inputs
    this.guessInput.disabled = true;
    this.guessForm.querySelector('button').disabled = true;
    const hintButtons = document.querySelectorAll('.hint-button');
    hintButtons.forEach(button => button.disabled = true);
    
    // Show leaderboard
    await this.showLeaderboard();
}

    async showLeaderboard() {
        try {
            const response = await fetch('/leaderboard');
            const leaderboard = await response.json();
            
            const leaderboardElement = this.createAnimatedElement(
                'div',
                'leaderboard',
                `
                    <h3>Top Scores</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Name</th>
                                <th>Score</th>
                                <th>Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${leaderboard.map((entry, index) => `
                                <tr class="${entry.score === this.gameState.score ? 'current-score' : ''}">
                                    <td>${index + 1}</td>
                                    <td>${entry.name}</td>
                                    <td>${entry.score}</td>
                                    <td>${new Date(entry.date).toLocaleDateString()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `,
                this.gameContainer
            );
        } catch (error) {
            console.error('Error showing leaderboard:', error);
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