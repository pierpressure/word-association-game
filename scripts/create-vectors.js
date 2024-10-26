const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

async function createVectorsFile() {
    try {
        // Load common words list
        const commonWordsData = await fs.readFile(
            path.join(__dirname, '../data/common-words.json'),
            'utf8'
        );
        const commonWords = new Set(JSON.parse(commonWordsData));

        // We'll add more common words for better coverage
        const additionalCommonWords = new Set([
            // Basic verbs
            'eat', 'drink', 'sleep', 'walk', 'run', 'jump', 'sit', 'stand',
            'think', 'feel', 'see', 'hear', 'touch', 'smell', 'taste',
            // Common adjectives
            'good', 'bad', 'big', 'small', 'hot', 'cold', 'happy', 'sad',
            'fast', 'slow', 'hard', 'soft', 'loud', 'quiet', 'bright', 'dark',
            // Common nouns
            'cat', 'dog', 'fish', 'baby', 'child', 'woman', 'man', 'people',
            'car', 'bus', 'train', 'plane', 'boat', 'phone', 'computer',
            // Time words
            'today', 'tomorrow', 'yesterday', 'week', 'month', 'year',
            // Numbers and quantities
            'one', 'two', 'three', 'many', 'few', 'some', 'all', 'none',
            // Others
            'yes', 'no', 'maybe', 'please', 'thank', 'sorry', 'hello', 'goodbye'
        ]);

        // Combine both sets
        const allTargetWords = new Set([...commonWords, ...additionalCommonWords]);

        const vectors = {};
        let lineCount = 0;

        // Create readline interface
        const fileStream = require('fs').createReadStream(
            path.join(__dirname, '../data/glove.6B.50d.txt')
        );
        
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        // Process each line
        for await (const line of rl) {
            const values = line.trim().split(' ');
            const word = values[0];

            // Store vector if it's in our target words or is a common word
            if (allTargetWords.has(word) || lineCount < 10000) {
                vectors[word] = values.slice(1).map(Number);
            }

            lineCount++;
            if (lineCount % 10000 === 0) {
                console.log(`Processed ${lineCount} words...`);
            }
        }

        // Write the processed vectors to a file
        await fs.writeFile(
            path.join(__dirname, '../data/vectors-10k.json'),
            JSON.stringify(vectors)
        );

        console.log(`Successfully created vectors file with ${Object.keys(vectors).length} words`);
    } catch (error) {
        console.error('Error creating vectors file:', error);
        process.exit(1);
    }
}

createVectorsFile();