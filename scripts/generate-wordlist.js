const fs = require('fs').promises;
const path = require('path');

// Common categories to help identify good target words
const categories = {
    emotions: ['love', 'happy', 'sad', 'angry', 'joy', 'fear', 'peace', 'hope'],
    nature: ['tree', 'river', 'mountain', 'ocean', 'forest', 'flower', 'sky', 'beach'],
    weather: ['rain', 'snow', 'wind', 'storm', 'sunny', 'cloud', 'cold', 'warm'],
    food: ['bread', 'cake', 'fruit', 'pizza', 'cheese', 'sweet', 'lunch', 'cook'],
    home: ['house', 'room', 'door', 'chair', 'table', 'bed', 'garden', 'kitchen'],
    clothes: ['shirt', 'shoes', 'dress', 'coat', 'hat', 'warm', 'style', 'wear'],
    actions: ['walk', 'run', 'jump', 'sleep', 'eat', 'drink', 'play', 'work'],
    time: ['day', 'night', 'hour', 'week', 'month', 'year', 'today', 'morning'],
    qualities: ['good', 'bad', 'big', 'small', 'fast', 'slow', 'hard', 'soft'],
    abstract: ['dream', 'idea', 'truth', 'free', 'life', 'mind', 'soul', 'think'],
    everyday: ['book', 'paper', 'phone', 'clock', 'desk', 'chair', 'window', 'door'],
    activities: ['read', 'write', 'speak', 'listen', 'learn', 'teach', 'help', 'share'],
    feelings: ['kind', 'nice', 'glad', 'proud', 'brave', 'calm', 'fair', 'wise'],
    concepts: ['true', 'real', 'right', 'wrong', 'same', 'full', 'half', 'whole']
};

// Comprehensive list of names to filter out
const commonNames = new Set([
    // Common English names
    ...'john,james,mary,david,william,richard,charles,joseph,thomas,christopher,daniel,paul,mark,donald,george,kenneth,steven,edward,brian,ronald,anthony,kevin,jason,matthew,gary,timothy,jose,larry,jeffrey,frank,scott,eric,stephen,andrew,raymond,gregory,joshua,jerry,dennis,walter,patrick,peter,harold,douglas,henry,carl,arthur,ryan,roger,joe,juan,jack,albert,jonathan,justin,terry,gerald,keith,samuel,willie,ralph,lawrence,nicholas,roy,benjamin,bruce,brandon,adam,harry,fred,wayne,billy,steve,louis,jeremy,aaron,randy,howard,eugene,carlos,russell,bobby,victor,martin,ernest,phillip,todd,jesse,craig,alan,shawn,clarence,sean,philip,chris,johnny,earl,jimmy,antonio,bryan,danny,tony,luis,mike,stanley,leonard,nathan,dale,manuel,rodney,curtis,norman,allen,marvin,vincent,glenn,jeffery,travis,jeff,chad,jacob,melvin,alfred,kyle,francis,bradley,jesus,herbert,frederick,ray,joel,edwin,don,eddie,ricky,troy,randall,barry,alexander,bernard,mario,leroy,francisco,marcus,micheal'.split(','),
    // Common international names
    ...'abdul,abdullah,ahmed,ali,anton,boris,chen,dmitri,feng,giovanni,hassan,igor,ivan,jorge,karim,kim,lei,luigi,magnus,mohamed,muhammad,pavel,pedro,ravi,said,sergei,vladimir,wei,xavier,yuri,zhang'.split(','),
    // Common surnames
    ...'smith,johnson,williams,brown,jones,garcia,miller,davis,rodriguez,martinez,hernandez,lopez,gonzalez,wilson,anderson,thomas,taylor,moore,jackson,martin,lee,perez,thompson,white,harris,sanchez,clark,ramirez,lewis,robinson,walker,young,allen,king,wright,scott,torres,nguyen,hill,flores,green,adams,nelson,baker,hall,rivera,campbell,mitchell,carter,roberts'.split(',')
]);

async function generateWordList() {
    try {
        console.log('Loading word vectors...');
        const vectorData = await fs.readFile(path.join(__dirname, '../data/vectors-10k.json'), 'utf8');
        const wordVectors = JSON.parse(vectorData);

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

        // Enhanced word validation
        function isGoodWord(word) {
            // Basic checks
            if (word.length < 3 || word.length > 8) return false;
            if (!/^[a-z]+$/.test(word)) return false;
            
            // Check against common names
            if (commonNames.has(word.toLowerCase())) return false;
            
            // Check for name patterns
            const namePatterns = [
                /^[A-Z][a-z]+/,  // Capitalized words
                /^(mc|mac|van|von|ben|ibn|bin|san)/i,  // Name prefixes
                /^[A-Z]\./,  // Initials
                /(jr|sr|ii|iii|iv)$/i,  // Name suffixes
                /^[A-Z]+$/,  // All caps
                /[0-9]/,  // Contains numbers
                /([A-Z])/g  // Multiple capitals
            ];
            if (namePatterns.some(pattern => pattern.test(word))) return false;

            // Check for uncommon letter patterns
            const foreignPatterns = [
                /aa|ee|ii|oo|uu/i,  // Double vowels
                /^(al|el|abd|abu|ibn|ben|bar|bat)/i,  // Common name prefixes
                /^(dh|bh|gh|kh|ph|th|sh)/i,  // Digraphs common in names
                /^[^aeiou]{4}/i,  // Too many starting consonants
                /[^aeiou]{5}/i,  // Too many consonants in a row
                /'|-/  // Contains apostrophe or hyphen
            ];
            if (foreignPatterns.some(pattern => pattern.test(word))) return false;

            // Vector magnitude check for word commonness
            const vector = wordVectors[word];
            const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
            if (magnitude < 2.5 || magnitude > 8) return false;

            // Check semantic similarity to name-related concepts
            const nameIndicators = ['name', 'person', 'man', 'woman'];
            let nameScore = 0;
            for (const indicator of nameIndicators) {
                if (wordVectors[indicator]) {
                    nameScore += cosineSimilarity(vector, wordVectors[indicator]);
                }
            }
            if (nameScore / nameIndicators.length > 0.3) return false;

            return true;
        }

        // Find good target words
        const goodWords = new Set();
        
        // Add category seed words
        for (const categoryWords of Object.values(categories)) {
            for (const word of categoryWords) {
                if (wordVectors[word] && isGoodWord(word)) {
                    goodWords.add(word);
                }
            }
        }

        // Find related words
        console.log('Finding related words...');
        const processedWords = new Set();
        
        for (const seedWord of goodWords) {
            if (processedWords.has(seedWord)) continue;
            processedWords.add(seedWord);
            
            const vector = wordVectors[seedWord];
            const similarWords = Object.entries(wordVectors)
                .map(([word, vec]) => ({
                    word,
                    similarity: cosineSimilarity(vector, vec)
                }))
                .filter(({word, similarity}) => {
                    return similarity > 0.4 &&
                           similarity < 0.95 &&
                           isGoodWord(word) &&
                           word !== seedWord;
                })
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, 5)
                .map(({word}) => word);
            
            similarWords.forEach(word => {
                if (isGoodWord(word)) {
                    goodWords.add(word);
                }
            });
        }

        // Final validation pass
        const finalWordList = Array.from(goodWords)
            .filter(word => {
                // Ensure word has enough semantic relationships
                const vector = wordVectors[word];
                const relatedWords = Object.entries(wordVectors)
                    .map(([w, vec]) => ({
                        word: w,
                        similarity: cosineSimilarity(vector, vec)
                    }))
                    .filter(({similarity}) => similarity > 0.3)
                    .length;
                
                return relatedWords >= 5;
            })
            .sort();

        // Final validation and reporting
        console.log('\nValidating final word list...');
        const potentialNames = finalWordList.filter(word => {
            return commonNames.has(word) ||
                   word[0] === word[0].toUpperCase() ||
                   /^(al|el|abd|abu|ibn|ben)/.test(word);
        });

        if (potentialNames.length > 0) {
            console.warn('\nWarning: Possible names found:', potentialNames);
            // Remove them from final list
            finalWordList = finalWordList.filter(word => !potentialNames.includes(word));
        }

        // Save results
        const output = {
            words: finalWordList,
            metadata: {
                totalWords: finalWordList.length,
                generatedAt: new Date().toISOString(),
                categories: Object.keys(categories)
            }
        };

        await fs.writeFile(
            path.join(__dirname, '../data/common-words.json'),
            JSON.stringify(output, null, 2)
        );

        // Print statistics
        console.log(`\nGenerated word list with ${finalWordList.length} words`);
        console.log('Sample words:', finalWordList.slice(0, 20));
        
        // Length distribution
        const lengthDist = {};
        finalWordList.forEach(word => {
            lengthDist[word.length] = (lengthDist[word.length] || 0) + 1;
        });
        
        console.log('\nWord length distribution:');
        Object.entries(lengthDist)
            .sort(([a], [b]) => Number(a) - Number(b))
            .forEach(([len, count]) => {
                console.log(`${len} letters: ${count} words (${(count/finalWordList.length*100).toFixed(1)}%)`);
            });

        // Category coverage
        console.log('\nCategory coverage:');
        for (const [category, words] of Object.entries(categories)) {
            const found = words.filter(w => finalWordList.includes(w));
            console.log(`${category}: ${found.length}/${words.length} words (${(found.length/words.length*100).toFixed(1)}%)`);
        }

    } catch (error) {
        console.error('Error generating word list:', error);
    }
}

// Run the generator
generateWordList();