const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const dailyWords = require('./data/daily-words.json');

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

function getDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
}

function getDailyWord() {
    const startDate = new Date(dailyWords.startDate);
    // Force dates to be compared at midnight UTC
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);
    
    const daysDiff = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
    const wordIndex = daysDiff % dailyWords.words.length;
    
    // Format date consistently in YYYY-MM-DD format
    const dateString = today.toISOString().split('T')[0];
    
    return {
        word: dailyWords.words[wordIndex],
        dateString: dateString,
        wordNumber: daysDiff + 1
    };
}

function isGoodHintWord(hint, target) {
    // Don't use words that contain the target or vice versa
    if (hint.includes(target) || target.includes(hint)) {
        return false;
    }
    
    // Ensure word is common enough
    if (!commonWords.has(hint)) {
        return false;
    }
    
    // Allow more similar words to help players
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

function isGoodRelatedWord(word, original) {
    // Reject if it starts with capital (likely a name)
    if (/^[A-Z]/.test(word)) return false;

    // Reject common name suffixes
    if (word.endsWith('son') || word.endsWith('ton')) return false;

    // Reject if it looks like a name (common prefixes/suffixes)
    const namePatterns = [
        /^mc/, /^van/, /^de/, /^la/, /^san/,
        /ville$/, /berg$/, /burg$/, /ford$/
    ];
    if (namePatterns.some(pattern => pattern.test(word))) return false;

    // For color words, ensure related words are about color
    const colors = ['red', 'blue', 'green', 'brown', 'black', 'white', 'yellow', 'pink', 'purple', 'orange'];
    if (colors.includes(original.toLowerCase())) {
        const colorRelated = [
            'dark', 'light', 'bright', 'pale', 'deep', 'shade', 'tint', 'hue',
            'colored', 'paint', 'dye', 'color', 'tone', 'tinted', 'shaded'
        ];
        return colorRelated.includes(word) || colors.includes(word);
    }

    // Only allow letters, 3-10 chars long
    if (!/^[a-z]{3,10}$/.test(word)) return false;

    return true;
}

function getHints(word) {
    const hints = [];
    
    // Hint 1: Related words (keep this as it's good)
    if (wordVectors[word]) {
        const relatedWords = Object.entries(wordVectors)
            .map(([w, vec]) => ({
                word: w,
                similarity: cosineSimilarity(vec, wordVectors[word])
            }))
            .filter(({word: w, similarity}) => 
                similarity > 0.3 && 
                similarity < 0.7 &&
                w !== word &&
                isGoodRelatedWord(w, word)
            )
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 5)
            .map(({word}) => word);
        
        if (relatedWords.length > 0) {
            hints.push(`Think about these related words: ${relatedWords.join(', ')}`);
        }
    }
    
    // Hint 2: Category and Usage hint
    const categories = {
        emotions: ['happy', 'sad', 'brave', 'calm', 'hope', 'pride', 'joy', 'peace'],
        colors: ['amber', 'azure', 'coral', 'ivory', 'gold', 'pink', 'teal'],
        nature: ['earth', 'flora', 'river', 'coast', 'grove', 'stone', 'storm', 'cloud', 'flame'],
        time: ['dawn', 'delay', 'night', 'april', 'year'],
        movement: ['drift', 'float', 'glide', 'dance', 'climb', 'race', 'swing'],
        materials: ['glass', 'metal', 'steel', 'wood', 'clay', 'silk', 'brick'],
        animals: ['eagle', 'cobra', 'horse', 'wolf', 'swan', 'koala'],
        food: ['bread', 'cream', 'fruit', 'spice', 'candy'],
        body: ['heart', 'pulse', 'brain', 'chest', 'palm'],
        buildings: ['hotel', 'house', 'tower', 'cabin'],
        clothing: ['boots', 'denim', 'lace'],
        tools: ['blade', 'knife', 'torch', 'shield'],
        music: ['chord', 'flute', 'music', 'song'],
        weather: ['storm', 'frost', 'cloud', 'rain'],
        abstract: ['truth', 'peace', 'faith', 'dream', 'ideal', 'logic'],
        actions: ['build', 'carry', 'catch', 'clean', 'climb'],
        qualities: ['brave', 'clear', 'quick', 'fresh', 'pure']
    };
    
    let wordCategory = 'general';
    for (const [category, words] of Object.entries(categories)) {
        if (words.includes(word.toLowerCase())) {
            wordCategory = category;
            break;
        }
    }
    
    // Add category-specific second hint
    const categoryHints = {
        emotions: "This word describes a feeling or emotional state",
        colors: "This word is related to color or appearance",
        nature: "This word is found in nature",
        time: "This word is related to time or timing",
        movement: "This word describes a way of moving",
        materials: "This word is a type of material",
        animals: "This word is a type of animal",
        food: "This word is related to food or drink",
        body: "This word is related to the human body",
        buildings: "This word is a type of building or structure",
        clothing: "This word is related to clothing or fashion",
        tools: "This word is a type of tool or instrument",
        music: "This word is related to music or sound",
        weather: "This word is related to weather or climate",
        abstract: "This word represents an abstract concept",
        actions: "This word describes an action or activity",
        qualities: "This word describes a quality or characteristic",
        general: "This is a common everyday word"
    };
    
    const categoryHint = `${categoryHints[wordCategory]}${word.length <= 4 ? " (it's a short word)" : word.length >= 6 ? " (it's a longer word)" : ""}`;
    hints.push(categoryHint);
    
    // Hint 3: Part of speech + usage context
    const partsOfSpeech = {
        nouns: ['bread', 'cloud', 'heart', 'beach', 'river', 'dream', 'metal', 'queen', 'chest', 'blade', 'tower', 'movie'],
        verbs: ['sleep', 'build', 'climb', 'dance', 'float', 'smile', 'guard', 'dream', 'climb', 'paint', 'shine'],
        adjectives: ['brave', 'quick', 'clear', 'sharp', 'fresh', 'clean', 'bright', 'sweet', 'pure', 'soft'],
    };
    
    let partOfSpeech = 'noun'; // default
    if (partsOfSpeech.verbs.includes(word.toLowerCase())) {
        partOfSpeech = 'verb';
    } else if (partsOfSpeech.adjectives.includes(word.toLowerCase())) {
        partOfSpeech = 'adjective';
    }
    
    const contextTemplates = {
        noun: [
            "This is a thing you can __",
            "You might find this in __",
            "This is often associated with __",
            "This can be described as __",
            "You might see this __"
        ],
        verb: [
            "Something you might do when __",
            "An action often done __",
            "Something that can be done __",
            "An activity related to __",
            "A way to __"
        ],
        adjective: [
            "Used to describe things that are __",
            "A quality found in __",
            "A characteristic of __",
            "Something that feels __",
            "Often describes __"
        ]
    };

    const templates = contextTemplates[partOfSpeech];
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    let contextWords = '';
    if (wordVectors[word]) {
        const contextRelations = Object.entries(wordVectors)
            .map(([w, vec]) => ({
                word: w,
                similarity: cosineSimilarity(vec, wordVectors[word])
            }))
            .filter(({word: w, similarity}) => 
                similarity > 0.3 && 
                similarity < 0.5 &&
                w !== word &&
                !w.includes(word) &&
                !word.includes(w)
            )
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 2)
            .map(({word}) => word);
            
        if (contextRelations.length > 0) {
            contextWords = contextRelations.join(' or ');
        }
    }

    let partOfSpeechHint = `This word is a ${partOfSpeech}. `;
    partOfSpeechHint += template.replace('__', contextWords || 'in everyday situations');

    if (partOfSpeech === 'noun') {
        partOfSpeechHint += word.length > 4 ? "\nIt's a longer noun." : "\nIt's a short noun.";
    } else if (partOfSpeech === 'verb') {
        const pastTense = word + (word.endsWith('e') ? 'd' : 'ed');
        partOfSpeechHint += `\nThink about how things are "${pastTense}".`;
    } else if (partOfSpeech === 'adjective') {
        partOfSpeechHint += "\nIt describes a quality or characteristic.";
    }

    hints.push(partOfSpeechHint);
    
    return hints;
}
function getWordCategory(word) {
    const categories = {
        colors: ['red', 'blue', 'green', 'brown', 'black', 'white', 'yellow', 'pink', 'purple', 'orange'],
        emotions: ['happy', 'sad', 'angry', 'calm', 'love', 'hope', 'fear', 'joy'],
        actions: ['run', 'jump', 'swim', 'dance', 'sing', 'play', 'write', 'read'],
        nature: ['tree', 'flower', 'river', 'ocean', 'mountain', 'sky', 'sun', 'moon'],
        objects: ['book', 'chair', 'table', 'door', 'window', 'clock', 'phone', 'lamp']
    };

    for (const [category, words] of Object.entries(categories)) {
        if (words.includes(word.toLowerCase())) {
            return category;
        }
    }
    return null;
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
    const { word, dateString, wordNumber } = getDailyWord();
    const hints = getHints(word);
    res.json({ word, hints, dateString, wordNumber });
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