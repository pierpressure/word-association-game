const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
app.use(express.static('public'));
app.use(express.static('data'));

// Add dictionary for word validation
const englishWords = require('an-array-of-english-words');
const validWords = new Set(englishWords);

// Filter to create a set of common words (more likely to give good associations)
const commonWords = new Set(
    englishWords.filter(word => 
        word.length >= 3 && 
        word.length <= 8 && 
        !/[^a-zA-Z]/.test(word)
    )
);

// Will store our word vectors and associations
let wordVectors = null;
let wordList = null;
const TARGET_WORDS = new Set();
const associationCache = new Map();
let dailyWord = null;
let dailyWordTimestamp = 0;
// Add at the top of your file with other global variables
let serverInitialized = false;
let vectorsLoaded = false;

// Add leaderboard storage
let leaderboard = [];
try {
    leaderboard = require('./data/leaderboard.json');
} catch {
    leaderboard = [];
}

// Helper function to validate hint words
function isGoodHintWord(hint, target) {
    // Don't use words that contain the target or vice versa
    if (hint.includes(target) || target.includes(hint)) {
        return false;
    }
    
    // Ensure word is common enough
    if (!commonWords.has(hint)) {
        return false;
    }
    
    // Avoid words that are too similar in spelling
    const sameLength = Math.abs(hint.length - target.length) <= 1;
    const sameStart = hint[0] === target[0];
    const sameEnd = hint[hint.length - 1] === target[target.length - 1];
    
    // Avoid words that are too similar in pattern
    if (sameLength && sameStart && sameEnd) {
        return false;
    }
    
    return true;
}



// Load word vectors and enhance vocabulary
async function loadWordVectors() {
    try {
        // Load GloVe vectors first
        const data = await fs.readFile(path.join(__dirname, 'data/vectors-10k.json'), 'utf8');
        wordVectors = JSON.parse(data);
        wordList = Object.keys(wordVectors);
        
        // Load target words
        const targetWordsData = await fs.readFile(path.join(__dirname, 'data/common-words.json'), 'utf8');
        const parsedData = JSON.parse(targetWordsData);
        
        // Extract words array from the metadata structure
        const targetWordsList = parsedData.words || parsedData; // Handles both new and old format
        
        // Only add words that exist in our vectors
        targetWordsList.forEach(word => {
            if (wordVectors[word]) {
                TARGET_WORDS.add(word);
            } else {
                console.log(`Warning: Word "${word}" not found in vectors, excluding from target words`);
            }
        });
        
        console.log(`Loaded ${wordList.length} word vectors`);
        console.log(`Loaded ${TARGET_WORDS.size} valid target words`);
        
        if (TARGET_WORDS.size === 0) {
            throw new Error('No valid target words found in vectors');
        }
    } catch (error) {
        console.error('Error loading word vectors:', error);
        process.exit(1);
    }
}

// Check if a word is valid
function isValidWord(word) {
    return validWords.has(word.toLowerCase());
}

// Calculate cosine similarity
function cosineSimilarity(vec1, vec2) {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        norm1 += vec1[i] * vec1[i];
        norm2 += vec2[i] * vec2[i];
    }
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

// Updated getRelatedWords with better error handling
function getRelatedWords(word) {
    // Check if vectors are loaded
    if (!vectorsLoaded || !wordVectors) {
        console.error('Word vectors not loaded yet!');
        return [];
    }

    // Check cache first
    if (associationCache.has(word)) {
        return associationCache.get(word);
    }

    console.log(`Getting related words for: ${word}`); // Debug log

    let relatedWords = new Set();
    
    if (!wordVectors[word]) {
        console.error(`No vector found for word: ${word}`);
        return [];
    }

    try {
        // Get more initial candidates for better selection
        const candidates = Object.entries(wordVectors)
            .filter(([w]) => commonWords.has(w)) // Only use common words
            .map(([w, vec]) => ({
                word: w,
                similarity: cosineSimilarity(vec, wordVectors[word])
            }))
            .filter(({similarity}) => similarity > 0.4 && similarity < 0.95)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 20)
            .map(({word}) => word);
        
        console.log(`Found ${candidates.length} initial candidates`); // Debug log
        
        // Filter candidates for better hints
        const goodHints = candidates.filter(w => isGoodHintWord(w, word));
        goodHints.slice(0, 5).forEach(w => relatedWords.add(w));

        console.log(`Found ${relatedWords.size} good hints`); // Debug log

        // If we don't have enough good hints, try broader similarity
        if (relatedWords.size < 5) {
            console.log('Not enough hints, trying broader similarity'); // Debug log
            
            const broaderCandidates = Object.entries(wordVectors)
                .filter(([w]) => commonWords.has(w) && !relatedWords.has(w))
                .map(([w, vec]) => ({
                    word: w,
                    similarity: cosineSimilarity(vec, wordVectors[word])
                }))
                .filter(({similarity}) => similarity > 0.3)
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, 5 - relatedWords.size)
                .map(({word}) => word)
                .filter(w => isGoodHintWord(w, word));
                
            broaderCandidates.forEach(w => relatedWords.add(w));
            console.log(`Added ${broaderCandidates.length} broader candidates`); // Debug log
        }

    } catch (error) {
        console.error('Error generating related words:', error);
        return [];
    }

    const finalWords = Array.from(relatedWords);
    
    // Only cache if we actually found some words
    if (finalWords.length > 0) {
        associationCache.set(word, finalWords);
    }
    
    return finalWords;
}
// Enhanced feedback with emojis and colors
function getFeedback(score) {
    if (score === 100) return { message: "Perfect match!", color: "#2ecc71", emoji: "🎯" };
    if (score >= 90) return { message: "Extremely close!", color: "#27ae60", emoji: "🔥" };
    if (score >= 70) return { message: "Very warm!", color: "#f1c40f", emoji: "☀️" };
    if (score >= 50) return { message: "Getting warmer", color: "#e67e22", emoji: "⭐" };
    if (score >= 30) return { message: "Cold", color: "#3498db", emoji: "❄️" };
    return { message: "Ice cold", color: "#2980b9", emoji: "🧊" };
}

function getHints(word) {
    const hints = [];
    
    // Hint 1 (Free): Related words
    if (wordVectors[word]) {
        const relatedWords = Object.entries(wordVectors)
            .map(([w, vec]) => ({
                word: w,
                similarity: cosineSimilarity(vec, wordVectors[word])
            }))
            .filter(({similarity}) => similarity > 0.3 && similarity < 0.7)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 5)
            .map(({word}) => word);
        
        if (relatedWords.length > 0) {
            hints.push(`Think about these related words: ${relatedWords.join(', ')}`);
        } else {
            const broaderRelatedWords = Object.entries(wordVectors)
                .map(([w, vec]) => ({
                    word: w,
                    similarity: cosineSimilarity(vec, wordVectors[word])
                }))
                .filter(({similarity}) => similarity > 0.2)
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, 3)
                .map(({word}) => word);
            
            hints.push(`Think about words like: ${broaderRelatedWords.join(', ')}`);
        }
    } else {
        hints.push("Think about common English words");
    }

    // Hint 2 (-10 points): Word length
    hints.push(`${word.length} letters long`);
    
    // Hint 3 (-15 points): First letter
    hints.push(`Starts with '${word[0].toUpperCase()}'`);
    
    return hints;
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/calculate-score', (req, res) => {
    const { guess, target } = req.query;
    
    if (!guess || !target) {
        return res.status(400).json({ error: 'Missing guess or target word' });
    }

    const guessLower = guess.toLowerCase();
    const targetLower = target.toLowerCase();

    // First check if it's a valid English word
    if (!isValidWord(guessLower)) {
        return res.json({ 
            score: null,
            message: "Not a valid English word, try again", 
            color: "#e74c3c",
            emoji: "❌"
        });
    }

    // Check if we have vectors for the words
    if (!wordVectors[guessLower] || !wordVectors[targetLower]) {
        return res.json({ 
            score: 10,
            message: "Valid word, but not very related", 
            color: "#95a5a6",
            emoji: "🤔"
        });
    }

    // If exact match
    if (guessLower === targetLower) {
        return res.json({ score: 100, ...getFeedback(100) });
    }

    // Calculate semantic similarity
    const similarity = cosineSimilarity(
        wordVectors[guessLower],
        wordVectors[targetLower]
    );

    const score = Math.round(Math.max(0, Math.min(99, similarity * 100)));
    res.json({ score, ...getFeedback(score) });
});

app.get('/get-target-word', (req, res) => {
    const targetWordsArray = Array.from(TARGET_WORDS);
    
    // Double check that we have valid words
    if (targetWordsArray.length === 0) {
        console.error('No valid target words available');
        return res.status(500).json({ error: 'Game configuration error' });
    }
    
    // Select word and verify it has vectors
    let word = targetWordsArray[Math.floor(Math.random() * targetWordsArray.length)];
    
    // This should never happen due to our filtering, but just in case
    if (!wordVectors[word]) {
        console.error(`Selected word "${word}" not found in vectors despite filtering`);
        // Try to find any valid word
        word = Object.keys(wordVectors)[0];
    }
    
    const hints = getHints(word);
    
    res.json({ 
        word,
        hints,
        category: 'random'
    });
});

app.get('/leaderboard', (req, res) => {
    res.json(leaderboard.slice(0, 10));
});

app.post('/submit-score', express.json(), (req, res) => {
    const { name, score } = req.body;
    
    if (!name || typeof score !== 'number') {
        return res.status(400).json({ error: 'Invalid score submission' });
    }
    
    leaderboard.push({ name, score, date: new Date().toISOString() });
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 100);
    
    fs.writeFile(
        path.join(__dirname, 'data/leaderboard.json'),
        JSON.stringify(leaderboard, null, 2)
    ).catch(console.error);
    
    res.json({ success: true });
});

// Replace the initServer function and initialization code at the bottom of your file with this:
async function initServer() {
    if (serverInitialized) {
        console.log('Server already initialized, skipping...');
        return;
    }

    try {
        await loadWordVectors();
        
        // Only start server if vectors loaded successfully and server isn't already running
        if (!serverInitialized) {
            const server = app.listen(3000, () => {
                serverInitialized = true;
                console.log('Enhanced Word Game Server running on http://localhost:3000');
                console.log(`Loaded ${wordList.length} word vectors and ${TARGET_WORDS.size} target words`);
            }).on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    console.log('Port 3000 is already in use. Please close other instances or use a different port.');
                    process.exit(1);
                } else {
                    console.error('Server error:', error);
                    process.exit(1);
                }
            });
        }
    } catch (error) {
        console.error('Failed to initialize server:', error);
        if (!serverInitialized) {
            console.log('Retrying in 5 seconds...');
            setTimeout(initServer, 5000);
        }
    }
}

// Remove any other calls to loadWordVectors or app.listen
// Just call initServer once
initServer();