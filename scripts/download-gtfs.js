const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const GTFS_URL = 'https://s3.transitpdf.com/files/uran/improved-gtfs-moscow-official.zip';
const OUTPUT_DIR = path.join(__dirname, '..', 'data');
const GTFS_DIR = path.join(OUTPUT_DIR, 'gtfs');

async function downloadGTFS() {
    console.log('Downloading Moscow GTFS data...');
    
    // Create directories
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    if (!fs.existsSync(GTFS_DIR)) {
        fs.mkdirSync(GTFS_DIR, { recursive: true });
    }
    
    const zipPath = path.join(OUTPUT_DIR, 'moscow-gtfs.zip');
    
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(zipPath);
        
        https.get(GTFS_URL, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Follow redirect
                https.get(response.headers.location, (redirectResponse) => {
                    redirectResponse.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        console.log('Download complete. Extracting...');
                        extractZip(zipPath);
                        resolve();
                    });
                }).on('error', reject);
            } else {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log('Download complete. Extracting...');
                    extractZip(zipPath);
                    resolve();
                });
            }
        }).on('error', reject);
    });
}

function extractZip(zipPath) {
    const AdmZip = require('adm-zip');
    try {
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(GTFS_DIR, true);
        console.log('GTFS data extracted to data/gtfs/');
        splitStopTimesIfNeeded(GTFS_DIR);
        console.log('Done!');
    } catch (e) {
        console.error('Error extracting:', e.message);
        console.log('Trying alternative method with unzipper...');
        extractWithUnzipper(zipPath);
    }
}

function extractWithUnzipper(zipPath) {
    const unzipper = require('unzipper');
    fs.createReadStream(zipPath)
        .pipe(unzipper.Parse())
        .on('entry', (entry) => {
            const fileName = path.basename(entry.path);
            if (fileName && !fileName.startsWith('.')) {
                const filePath = path.join(GTFS_DIR, fileName);
                entry.pipe(fs.createWriteStream(filePath));
            } else {
                entry.autodrain();
            }
        })
        .on('close', () => {
            console.log('GTFS data extracted!');
            splitStopTimesIfNeeded(GTFS_DIR);
        });
}

const MAX_CHUNK_SIZE = 90 * 1024 * 1024; // 90MB

function splitStopTimesIfNeeded(gtfsDir) {
    const stopTimesPath = path.join(gtfsDir, 'stop_times.txt');
    
    if (!fs.existsSync(stopTimesPath)) {
        console.log('stop_times.txt not found, skipping split');
        return;
    }
    
    const stats = fs.statSync(stopTimesPath);
    console.log(`stop_times.txt size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    if (stats.size <= MAX_CHUNK_SIZE) {
        console.log('stop_times.txt is under 90MB, no split needed');
        return;
    }
    
    console.log('Splitting stop_times.txt into chunks...');
    
    const content = fs.readFileSync(stopTimesPath, 'utf8');
    const lines = content.trim().split('\n');
    const header = lines[0];
    const dataLines = lines.slice(1);
    
    const numChunks = 3;
    const chunkSize = Math.ceil(dataLines.length / numChunks);
    
    for (let i = 0; i < numChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, dataLines.length);
        const chunkContent = header + '\n' + dataLines.slice(start, end).join('\n');
        const chunkPath = path.join(gtfsDir, `stop_times_${i + 1}.txt`);
        fs.writeFileSync(chunkPath, chunkContent, 'utf8');
        console.log(`Created stop_times_${i + 1}.txt with ${end - start} lines`);
    }
    
    fs.unlinkSync(stopTimesPath);
    console.log('Deleted original stop_times.txt');
    console.log('Split complete!');
}

downloadGTFS().catch(console.error);
