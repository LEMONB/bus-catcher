const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const GTFS_URL = 'https://busmaps.ru/static/gtfs/moscow-gtfs.zip';
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
        });
}

downloadGTFS().catch(console.error);
