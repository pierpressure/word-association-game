const fs = require('fs').promises;
const path = require('path');

const similarityThresholds = {
    min: 0.35,
    max: 0.75
};

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


function isGoodWord(word) {
    // Only letters allowed
    if (!/^[a-z]+$/.test(word)) return false;
    
    // Length between 4 and 7 characters
    if (word.length < 4 || word.length > 7) return false;
    
    // No repeating letters more than twice
    if (/(.)\1{2,}/.test(word)) return false;
    
    // Filter out common helper words and prepositions
    const helperWords = new Set([
        'after', 'also', 'been', 'from', 'have', 'into', 'just',
        'like', 'made', 'many', 'more', 'most', 'much', 'only',
        'over', 'some', 'such', 'than', 'that', 'them', 'then',
        'they', 'this', 'very', 'were', 'what', 'when', 'will',
        'with', 'your'
    ]);
    if (helperWords.has(word)) return false;

    return true;
}


async function generateDailyWords() {
    try {
        console.log('Loading vector data...');
        const vectorData = await fs.readFile(path.join(__dirname, '../data/vectors-10k.json'), 'utf8');
        console.log('Parsing vector data...');
        const wordVectors = JSON.parse(vectorData);
        console.log(`Loaded ${Object.keys(wordVectors).length} word vectors`);
        
		const categories = {
		    emotions: [
		        'love', 'happy', 'peace', 'hope', 'joy', 'calm', 'dream',
		        'smile', 'laugh', 'brave', 'pride', 'cheer', 'glad', 'safe'
		    ],
		    nature: [
		        'ocean', 'river', 'forest', 'sky', 'beach', 'cloud', 'star',
		        'lake', 'moon', 'tree', 'rose', 'bird', 'wind', 'rain', 'sun'
		    ],
		    activities: [
		        'dance', 'write', 'learn', 'play', 'read', 'swim', 'run',
		        'sing', 'paint', 'cook', 'build', 'climb', 'grow', 'sleep'
		    ],
		    objects: [
		        'book', 'light', 'clock', 'door', 'chair', 'table', 'home',
		        'desk', 'bread', 'fruit', 'phone', 'paper', 'glass', 'lamp'
		    ],
		    concepts: [
		        'truth', 'mind', 'time', 'life', 'soul', 'heart', 'free',
		        'faith', 'dream', 'hope', 'magic', 'power', 'luck', 'gift'
		    ],
		    qualities: [
		        'bold', 'wise', 'pure', 'kind', 'fair', 'warm', 'soft',
		        'sweet', 'rich', 'wild', 'calm', 'good', 'cool', 'sure'
		    ],
		    food: [
		        'bread', 'cake', 'soup', 'fish', 'fruit', 'sweet', 'spice',
		        'mint', 'salt', 'sugar', 'herb', 'food', 'meal', 'cook'
		    ],
		    colors: [
		        'blue', 'green', 'gold', 'pink', 'white', 'brown', 'rose',
		        'gray', 'ruby', 'amber'
		    ],
		    time: [
		        'dawn', 'dusk', 'noon', 'night', 'today', 'week', 'year',
		        'hour', 'spring', 'fall'
		    ]
		};
        function scoreWord(word) {
            if (!isGoodWord(word)) return 0;
            if (!wordVectors[word]) return 0;
            
            let score = 0;
            const vector = wordVectors[word];
            
            // Check vector magnitude (prefer common words)
            const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
            if (magnitude >= 2.5 && magnitude <= 6) score += 2;
            
            // Check related words
            let relatedCount = 0;
            const entries = Object.entries(wordVectors).slice(0, 1000);
            for (const [w, vec] of entries) {
                if (!isGoodWord(w)) continue;
                const similarity = cosineSimilarity(vector, vec);
                if (similarity > similarityThresholds.min && similarity < similarityThresholds.max) relatedCount++;
                if (relatedCount >= 10) break;
            }
            if (relatedCount >= 10) score += 3;
            
            return score;
        }

        const selectedWords = new Set();
        for (const [category, seeds] of Object.entries(categories)) {
            console.log(`\nProcessing category: ${category}`);
            const categoryWords = new Set(seeds);
            
            for (const seed of seeds) {
                console.log(`  Processing seed word: ${seed}`);
                if (!wordVectors[seed] || !isGoodWord(seed)) {
                    console.log(`  Warning: Skipping seed word "${seed}"`);
                    continue;
                }
                
                let similarWords = [];
                let processed = 0;
                for (const [word, vec] of Object.entries(wordVectors)) {
                    if (!isGoodWord(word)) continue;
                    
                    processed++;
                    if (processed % 1000 === 0) {
                        process.stdout.write(`\r    Processed ${processed} words...`);
                    }
                    
                    const similarity = cosineSimilarity(wordVectors[seed], vec);
                    if (similarity > similarityThresholds.min && similarity < similarityThresholds.max) {
                        similarWords.push({ word, similarity });
                        if (similarWords.length >= 30) break;
                    }
                }
                console.log(`\n    Found ${similarWords.length} similar words`);
                
                similarWords
                    .sort((a, b) => scoreWord(b.word) - scoreWord(a.word))
                    .slice(0, 10)
                    .forEach(({word}) => categoryWords.add(word));
            }
            
            const bestWords = Array.from(categoryWords)
                .filter(isGoodWord)
                .map(word => ({
                    word,
                    score: scoreWord(word)
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 30)
                .map(({word}) => word);
            
            console.log(`Found ${bestWords.length} good words for category ${category}`);
            bestWords.forEach(word => selectedWords.add(word));
        }

        const finalWords = Array.from(selectedWords)
            .filter(isGoodWord)
            .sort();

        const dailyWords = {
            words: finalWords,
            startDate: "2024-01-01",
            metadata: {
                totalWords: finalWords.length,
                lastUpdated: new Date().toISOString(),
                categories: Object.keys(categories),
                wordsPerCategory: Object.fromEntries(
                    Object.keys(categories).map(cat => [
                        cat, 
                        finalWords.filter(w => categories[cat].includes(w)).length
                    ])
                )
            }
        };

        await fs.writeFile(
            path.join(__dirname, '../data/daily-words.json'),
            JSON.stringify(dailyWords, null, 2)
        );

        console.log('\nGeneration complete!');
        console.log(`Generated ${finalWords.length} daily words`);
        console.log('\nSample words:', finalWords.slice(0, 20));
        console.log('\nCategory distribution:', dailyWords.metadata.wordsPerCategory);
        
    } catch (error) {
        console.error('Error generating daily words:', error);
        console.error(error.stack);
    }
}

generateDailyWords();