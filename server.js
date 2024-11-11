const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const dailyWords = require('./data/daily-words.json');
const commonStopWords = new Set(['the', 'and', 'but', 'or', 'so', 'than', 'then', 'they', 'them']);
const wordCategories = require('./data/wordCategories.js');

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
// let leaderboard = [];
let monthlyLeaderboard = [];
let hallOfFame = [];
let usedWords = new Set();
const WORDS_HISTORY_FILE = 'data/used-words.json';

// Load used words on startup
async function loadUsedWords() {
    try {
        const data = await fs.readFile(WORDS_HISTORY_FILE, 'utf8');
        usedWords = new Set(JSON.parse(data));
        console.log(`Loaded ${usedWords.size} used words`);
        
        // Calculate remaining words
        const remainingWords = dailyWords.words.filter(word => !usedWords.has(word));
        console.log(`Remaining unused words: ${remainingWords.length}`);
        
        if (remainingWords.length < 100) {
            console.warn('Warning: Running low on unused words!');
        }
    } catch (error) {
        console.log('No used words file found, starting fresh');
        usedWords = new Set();
    }
}

async function initLeaderboards() {
    try {
        // Load both leaderboards
        const monthly = await fs.readFile(path.join(__dirname, 'data/monthly-leaderboard.json'), 'utf8')
            .catch(() => '[]');
        const allTime = await fs.readFile(path.join(__dirname, 'data/hall-of-fame.json'), 'utf8')
            .catch(() => '[]');
        
        monthlyLeaderboard = JSON.parse(monthly);
        hallOfFame = JSON.parse(allTime);
        
        // Clean old monthly entries (older than current month)
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        monthlyLeaderboard = monthlyLeaderboard.filter(entry => {
            const entryDate = new Date(entry.lastUpdated);
            return entryDate.getMonth() === currentMonth && 
                   entryDate.getFullYear() === currentYear;
        });
        
        // Sort both leaderboards
        monthlyLeaderboard.sort((a, b) => b.totalScore - a.totalScore);
        hallOfFame.sort((a, b) => b.averageScore - a.averageScore);
        
        // Save cleaned data
        await saveLeaderboards();
        
    } catch (error) {
        console.error('Error initializing leaderboards:', error);
        monthlyLeaderboard = [];
        hallOfFame = [];
    }
}

async function saveLeaderboards() {
    try {
        await fs.writeFile(
            path.join(__dirname, 'data/monthly-leaderboard.json'),
            JSON.stringify(monthlyLeaderboard, null, 2)
        );
        await fs.writeFile(
            path.join(__dirname, 'data/hall-of-fame.json'),
            JSON.stringify(hallOfFame, null, 2)
        );
    } catch (error) {
        console.error('Error saving leaderboards:', error);
    }
}

function getWordStem(word) {
    // Common suffixes to check
    const suffixes = [
        'ed', 'ing', 's', 'es', 'd', 
        'er', 'ers', 'est',
        'ly', 'ily',
        'ness', 'less',
        'able', 'ible',
        'tion', 'sion', 'ment'
    ];
    
    // Sort by length (longest first) to handle cases like 'iness' before 'ing'
    suffixes.sort((a, b) => b.length - a.length);
    
    let stem = normalizeWordForSelection(word.toLowerCase());
    
    for (const suffix of suffixes) {
        if (stem.endsWith(suffix)) {
            // Special cases for doubled consonants
            let withoutSuffix = stem.slice(0, -suffix.length);
            
            // Handle doubled consonants (e.g., 'shared' -> 'share')
            if (suffix === 'ed' && withoutSuffix.match(/[^aeiou][aeiou][^aeiou]$/)) {
                withoutSuffix = withoutSuffix.slice(0, -1);
            }
            
            // Only return stem if it exists in our word vectors
            if (wordVectors[withoutSuffix]) {
                return withoutSuffix;
            }
        }
    }
    
    return stem;
}

function normalizeWordForSelection(word) {
    // Prefer US spellings for consistency
    const variants = {
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
    'armour': 'armor'    
    };
    
    return variants[word.toLowerCase()] || word;
}

function getDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
}

function seededRandom(seed) {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

// Modify getDailyWord function
async function getDailyWord(clientDateString) {
    if (!clientDateString) {
        console.error('No client date provided');
        clientDateString = new Date().toLocaleDateString('en-CA');
    }

    // Use date as seed for consistent selection
    const seed = parseInt(clientDateString.replace(/-/g, ''));
    
    // If running low on words, reset the used words
    if (usedWords.size > dailyWords.words.length - 50) {
        console.log('Resetting used words tracking - starting fresh cycle');
        usedWords.clear();
        await fs.writeFile(WORDS_HISTORY_FILE, JSON.stringify(Array.from(usedWords)));
    }

    // Get the word for this date consistently
    const dateKey = `${clientDateString}`;
    let selectedWord;

    // Check if we already used a word for this date
    const todayHistory = Array.from(usedWords).find(item => 
        typeof item === 'object' && item.date === dateKey
    );

    if (todayHistory) {
        // Use the same word we used before for this date
        selectedWord = todayHistory.word;
    } else {
        // Get available words (excluding ones used on other dates)
        const usedWordsList = Array.from(usedWords)
            .map(item => typeof item === 'object' ? item.word : item);
        const availableWords = dailyWords.words.filter(word => 
            !usedWordsList.includes(word)
        );

        // Use seeded random to consistently select word
        const index = Math.floor(seededRandom(seed) * availableWords.length);
        selectedWord = availableWords[index];

        // Store with date information
        usedWords.add({
            date: dateKey,
            word: selectedWord
        });
        await fs.writeFile(WORDS_HISTORY_FILE, JSON.stringify(Array.from(usedWords)));
    }

    // Return word data
    return {
        word: normalizeWordForSelection(selectedWord),
        dateString: clientDateString,
        wordNumber: dailyWords.words.length - (dailyWords.words.filter(w => 
            !Array.from(usedWords).some(used => 
                (typeof used === 'object' ? used.word : used) === w
            )
        )).length + 1,
        remainingWords: dailyWords.words.length - usedWords.size
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


async function validateDailyWords() {
    const invalidWords = [];
    const validWords = [];
    
    dailyWords.words.forEach(word => {
        if (wordVectors[word.toLowerCase()]) {
            validWords.push(word);
        } else {
            invalidWords.push(word);
        }
    });

    // Sort invalid words alphabetically for easier review
    invalidWords.sort();

    // console.log('All invalid words:');
    // console.log(JSON.stringify(invalidWords, null, 2));  // Pretty print the full array
    // console.log('\nInvalid word count by letter:');
    
    // Group by first letter for analysis
    const byLetter = invalidWords.reduce((acc, word) => {
        const firstLetter = word[0];
        acc[firstLetter] = acc[firstLetter] || [];
        acc[firstLetter].push(word);
        return acc;
    }, {});

    Object.entries(byLetter).sort().forEach(([letter, words]) => {
        // console.log(`${letter}: ${words.length} words (${words.join(', ')})`);
    });

    // console.log(`\nSummary:`);
    // console.log(`Total words: ${dailyWords.words.length}`);
    // console.log(`Valid words: ${validWords.length}`);
    // console.log(`Invalid words: ${invalidWords.length}`);

    // Optionally write the filtered list back to the file
    const newDailyWords = {
        ...dailyWords,
        words: validWords
    };

    await fs.writeFile(
        path.join(__dirname, 'data/daily-words.json'),
        JSON.stringify(newDailyWords, null, 2)
    );
    
    // Also write out invalid words to a separate file for reference
    await fs.writeFile(
        path.join(__dirname, 'data/invalid-words.json'),
        JSON.stringify({
            invalidWords: invalidWords,
            byLetter: byLetter,
            totalInvalid: invalidWords.length,
            totalValid: validWords.length
        }, null, 2)
    );
    
    return validWords;
}
// Load word vectors and enhance vocabulary
async function loadWordVectors() {
    try {
        // Load GloVe vectors first
        const data = await fs.readFile(path.join(__dirname, 'data/vectors-10k.json'), 'utf8');
        wordVectors = JSON.parse(data);
        wordList = Object.keys(wordVectors);
        vectorsLoaded = true;  // Add this line!
        
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
        
        // console.log(`Loaded ${wordList.length} word vectors`);
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
    if (!vectorsLoaded || !wordVectors) {
        console.error('Word vectors not loaded yet!');
        return [];
    }

    if (associationCache.has(word)) {
        console.log('Returning cached related words for:', word);
        return associationCache.get(word);
    }

    console.log(`Getting related words for: ${word}`);

    let relatedWords = new Set();
    let usedStems = new Set();  // Track word stems we've already used
    
    if (!wordVectors[word]) {
        console.error(`No vector found for word: ${word}`);
        return [];
    }

    try {
        const candidates = Object.entries(wordVectors)
            .filter(([w]) => {
                // Normalize both words
                const normalizedW = normalizeWordForSelection(w);
                const normalizedTarget = normalizeWordForSelection(word);
                
                // Filter out the target word and normalized variants
                if (normalizedW === normalizedTarget) return false;
                
                // Only use common words
                if (!commonWords.has(w)) return false;
                
                // Get stem of current candidate
                const stem = getWordStem(w);
                
                // If we've already used this stem, skip it
                if (usedStems.has(stem)) return false;
                
                // Mark this stem as used
                usedStems.add(stem);
                
                return true;
            })
            .map(([w, vec]) => ({
                word: w,
                similarity: cosineSimilarity(vec, wordVectors[word])
            }))
            .filter(({similarity}) => similarity > 0.4 && similarity < 0.95)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 20)
            .map(({word}) => word);
        
        console.log(`Found ${candidates.length} initial candidates for: ${word}`);
        
        const goodHints = candidates
            .filter(w => isGoodHintWord(w, word))
            .slice(0, 5);

        // Log the filtered words and their stems for debugging
        console.log('Chosen hints with stems:', 
            goodHints.map(w => ({
                word: w,
                stem: getWordStem(w)
            }))
        );

        goodHints.forEach(w => relatedWords.add(w));

        // If we need more words, get broader candidates
        if (relatedWords.size < 5) {
            const broaderCandidates = Object.entries(wordVectors)
                .filter(([w]) => {
                    if (normalizeWordForSelection(w) === normalizeWordForSelection(word)) return false;
                    if (!commonWords.has(w)) return false;
                    if (relatedWords.has(w)) return false;
                    
                    const stem = getWordStem(w);
                    if (usedStems.has(stem)) return false;
                    
                    usedStems.add(stem);
                    return true;
                })
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
        }

        const finalWords = Array.from(relatedWords);
        console.log('Final related words for', word, ':', finalWords);

        if (finalWords.length > 0) {
            associationCache.set(word, finalWords);
        }
        
        return finalWords;
    } catch (error) {
        console.error('Error getting related words:', error);
        return [];
    }
}

function getFeedback(score) {
    if (score === 100) return { message: "Perfect match!", color: "#2ecc71", emoji: "🎯" };
    if (score >= 90) return { message: "Extremely close!", color: "#27ae60", emoji: "🔥" };
    if (score >= 70) return { message: "Very warm!", color: "#f1c40f", emoji: "☀️" };
    if (score >= 50) return { message: "Getting warmer", color: "#e67e22", emoji: "⭐" };
    if (score >= 30) return { message: "Cold", color: "#3498db", emoji: "❄️" };
    return { message: "Ice cold", color: "#2980b9", emoji: "🧊" };
}

function calculateScore(similarity) {
    // Adjusted scoring thresholds
    if (similarity >= 0.8) return 100;  // Perfect/near perfect
    if (similarity >= 0.6) return 90;   // Very close
    if (similarity >= 0.4) return 70;   // Warm
    if (similarity >= 0.25) return 50;  // Getting warmer
    if (similarity >= 0.15) return 30;  // Cold
    return 10;  // Ice cold
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


// Function to get hints for a word
function getWordHints(word) {
    // Find the category for this word
    let category = null;
    for (const [catName, cat] of Object.entries(wordCategories)) {
        if (cat.words.includes(word.toLowerCase())) {
            category = cat;
            break;
        }
    }

    if (category) {
        return {
            type: category.type,
            context: category.contexts[Math.floor(Math.random() * category.contexts.length)]
        };
    }

    // Fallback for uncategorized words
    return {
        type: "This is a common word",
        context: "Something you might encounter regularly"
    };
}

function getSingularForm(word) {
    word = word.toLowerCase().trim();
    
    // Handle words ending in 'ies' -> 'y'
    if (word.endsWith('ies')) {
        // Make sure it's not just a word ending in 'ies' (e.g., 'ties' -> 'tie')
        if (word.length > 3 && !'aeiou'.includes(word[word.length - 4])) {
            return word.slice(0, -3) + 'y';
        }
    }
    
    // Handle words ending in 'es'
    if (word.endsWith('es')) {
        // Special cases where we remove 'es'
        if (word.endsWith('shes') || 
            word.endsWith('ches') || 
            word.endsWith('xes') || 
            word.endsWith('zes') || 
            word.endsWith('sses')) {
            return word.slice(0, -2);
        }
        // Regular 's' ending
        return word.slice(0, -1);
    }
    
    // Handle regular 's' ending
    if (word.endsWith('s') && !word.endsWith('ss')) {
        return word.slice(0, -1);
    }
    
    return word;
}

function getHints(word) {
    const hints = [];
    
    // Hint 1: Word relations (keep this part as is)
    if (wordVectors && wordVectors[word]) {
        const relatedWords = Object.entries(wordVectors)
            .map(([w, vec]) => ({
                word: w,
                similarity: cosineSimilarity(vec, wordVectors[word])
            }))
            .filter(({word: w, similarity}) => {
                return similarity > 0.35 && 
                       similarity < 0.9 &&
                       w.length >= 3 &&
                       commonWords.has(w) &&
                       !w.includes(word) &&
                       !word.includes(w) &&
                       !/[^a-z]/.test(w);
            })
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 4)
            .map(({word}) => word);
        
        if (relatedWords.length > 0) {
            hints.push(`Think about these related words: ${relatedWords.join(', ')}`);
        } else {
            hints.push(`Think about common everyday words`);
        }
    }
    
    // Hint 2 & 3: Use categories
    for (const [catName, category] of Object.entries(wordCategories)) {
        if (category.words.includes(word.toLowerCase())) {
            // Add hint 2 (type and first letter)
            hints.push(`${category.type}. Starts with '${word[0].toUpperCase()}'`);
            
            // Add hint 3 (random context)
            const randomContext = category.contexts[Math.floor(Math.random() * category.contexts.length)];
            hints.push(randomContext);
            
            break;  // Exit once we've found the right category
        }
    }

    // Make sure we always return three hints
    while (hints.length < 3) {
        if (hints.length === 1) {
            hints.push(`This is a common word. Starts with '${word[0].toUpperCase()}'`);
        } else {
            hints.push(`Has ${word.length} letters`);
        }
    }

    // console.log('Generated hints for word:', word, hints);  // Debug log
    
    return hints;
}



function getWordCategory(word, categories) {
    for (const [catName, category] of Object.entries(categories)) {
        if (category.words.includes(word.toLowerCase())) {
            return category;
        }
    }
    return null;
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Fix the calculate-score endpoint:
app.get('/calculate-score', (req, res) => {
    let { guess, target } = req.query;
    
    if (!guess || !target) {
        return res.status(400).json({ error: 'Missing guess or target word' });
    }

    // Normalize both guess and target
    const guessLower = guess.toLowerCase().trim();
    const targetLower = target.toLowerCase().trim();

    // Get singular forms
    const normalizedGuess = getSingularForm(guessLower);
    const normalizedTarget = getSingularForm(targetLower);

    // Log for debugging
    console.log('Word forms:', {
        original: { guess: guessLower, target: targetLower },
        normalized: { guess: normalizedGuess, target: normalizedTarget }
    });

    // First check if it's a valid English word (check both original and singular form)
    if (!isValidWord(guessLower) && !isValidWord(normalizedGuess)) {
        return res.json({ 
            score: null,
            message: "Not a valid English word, try again", 
            color: "#e74c3c",
            emoji: "❌"
        });
    }

    // Get related words (hints) for the target word
    const hintWords = getRelatedWords(targetLower);
    
    // Check if guess is a hint word (check both forms)
    if (hintWords.includes(guessLower) || hintWords.includes(normalizedGuess)) {
        console.log('Guess is a hint word:', guessLower);
        return res.json({
            score: 90,
            message: "Very close, but that's a hint word!",
            color: "#f1c40f",
            emoji: "💭"
        });
    }

    // Check for exact match AFTER checking if it's a hint word
    if (guessLower === targetLower || normalizedGuess === normalizedTarget) {
        return res.json({ 
            score: 100,
            message: "Perfect match!",
            color: "#2ecc71",
            emoji: "🎯"
        });
    }

    // Calculate similarity using both forms and take the better score
    let similarity = 0;
    
    if (wordVectors[guessLower] && wordVectors[targetLower]) {
        similarity = cosineSimilarity(wordVectors[guessLower], wordVectors[targetLower]);
    }
    
    // Try with normalized forms if they exist in vectors
    if (wordVectors[normalizedGuess] && wordVectors[normalizedTarget]) {
        const normalizedSimilarity = cosineSimilarity(
            wordVectors[normalizedGuess], 
            wordVectors[normalizedTarget]
        );
        similarity = Math.max(similarity, normalizedSimilarity);
    }
    
    const calculatedScore = calculateScore(similarity);
    const feedback = getFeedback(calculatedScore);
    
    return res.json({
        score: calculatedScore,
        ...feedback
    });
});

app.get('/get-target-word', async (req, res) => {
    try {
        const clientDate = req.query.clientDate;
        const wordData = await getDailyWord(clientDate);
    
        // Get related words and handle variants
        const relatedWords = getRelatedWords(wordData.word)
            .map(word => {
                // Check if it's a variant
                const variants = {
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
                    'armour': 'armor'   
                    // ... rest of your variants ...
                };
                return variants[word.toLowerCase()] || word;
            });

        // Get hints for the word
        const hints = [
            `Think about these related words: ${relatedWords.join(', ')}`,
            `Starts with '${wordData.word[0].toUpperCase()}'`,
            `Has ${wordData.word.length} letters`
        ];

        // Send both word data and hints
        res.json({
            ...wordData,
            hints: hints
        });
    } catch (error) {
        console.error('Error getting target word:', error);
        res.status(500).json({ error: 'Failed to get target word' });
    }
});

app.get('/words-status', async (req, res) => {
    const totalWords = dailyWords.words.length;
    const usedWordsCount = usedWords.size;
    const remainingWords = totalWords - usedWordsCount;
    
    res.json({
        totalWords,
        usedWords: usedWordsCount,
        remainingWords,
        startDate: dailyWords.startDate,
        lastUpdated: dailyWords.metadata.lastUpdated,
        cycleNumber: Math.floor(usedWords.size / totalWords) + 1
    });
});

app.get('/leaderboards', (req, res) => {
    res.json({
        monthly: monthlyLeaderboard.slice(0, 10),
        hallOfFame: hallOfFame.slice(0, 10)
    });
});

app.get('/debug-time', (req, res) => {
    const clientDate = req.query.clientDate;
    res.json({
        serverTime: new Date().toISOString(),
        clientDate: clientDate,
        clientParsed: clientDate ? new Date(clientDate).toISOString() : null,
        wordDetails: getDailyWord(clientDate)
    });
});
app.post('/submit-score', express.json(), (req, res) => {
    const { name, score, gamesPlayed, averageScore } = req.body;
    
    if (!name || typeof score !== 'number') {
        return res.status(400).json({ error: 'Invalid score submission' });
    }
    
    const now = new Date();
    
    // Update monthly leaderboard
    const monthlyEntry = monthlyLeaderboard.find(entry => entry.name === name);
    if (monthlyEntry) {
        monthlyEntry.totalScore += score;
        monthlyEntry.gamesPlayed = gamesPlayed;
        monthlyEntry.lastUpdated = now.toISOString();
    } else {
        monthlyLeaderboard.push({
            name,
            totalScore: score,
            gamesPlayed: 1,
            lastUpdated: now.toISOString()
        });
    }
    
    // Update Hall of Fame if qualified
    const MIN_GAMES_FOR_HOF = 5; // Require minimum games to qualify
    if (gamesPlayed >= MIN_GAMES_FOR_HOF) {
        const hofEntry = hallOfFame.find(entry => entry.name === name);
        if (hofEntry) {
            if (averageScore > hofEntry.averageScore) {
                hofEntry.averageScore = averageScore;
                hofEntry.gamesPlayed = gamesPlayed;
                hofEntry.lastUpdated = now.toISOString();
            }
        } else {
            hallOfFame.push({
                name,
                averageScore,
                gamesPlayed,
                lastUpdated: now.toISOString()
            });
        }
    }
    
    // Sort and trim leaderboards
    monthlyLeaderboard.sort((a, b) => b.totalScore - a.totalScore);
    hallOfFame.sort((a, b) => b.averageScore - a.averageScore);
    
    monthlyLeaderboard = monthlyLeaderboard.slice(0, 100);
    hallOfFame = hallOfFame.slice(0, 50);
    
    saveLeaderboards();
    
    res.json({ success: true });
});

// Replace the initServer function and initialization code at the bottom of your file with this:
async function initServer() {
    if (serverInitialized) {
        console.log('Server already initialized, skipping...');
        return;
    }

    try {
        // Add loadUsedWords to the initialization sequence
        await loadUsedWords();
        await loadWordVectors();
        const validWords = await validateDailyWords();
        await initLeaderboards();
        
        // Only start server if all initialization succeeded
        if (!serverInitialized) {
            const server = app.listen(3000, () => {
                serverInitialized = true;
                console.log(`Loaded ${usedWords.size} tracked words`);
                const remainingWords = dailyWords.words.filter(word => !usedWords.has(word));
                console.log(`Remaining unused words: ${remainingWords.length}`);
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

// Just call initServer once - remove the separate loadUsedWords call
initServer();
