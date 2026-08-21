const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');
const readline = require('readline');

// Retrieve GitHub Token from Git Credential Manager
function getGitHubToken() {
    const proc = spawnSync('git', ['credential', 'fill'], {
        input: 'protocol=https\nhost=github.com\n\n',
        encoding: 'utf8'
    });
    const lines = (proc.stdout || '').split('\n');
    const token = lines.find(l => l.startsWith('password='))?.replace('password=', '')?.trim();
    if (!token) {
        console.error("[!] Khong the lay token tu Git Credential Manager!");
        process.exit(1);
    }
    return token;
}

const token = getGitHubToken();
const REPO_OWNER = 'vant102';
const REPO_NAME = 'english-master';

// Define the 4 Release buckets
const RELEASES_CONFIG = {
    'v-lessons-1-26': {
        name: 'Media Assets: Lessons Part 1-26 (Full HD 1080p)',
        desc: 'Kho Video Bai Giang Phan 1 den 26 - Full HD 1080p'
    },
    'v-lessons-27-52': {
        name: 'Media Assets: Lessons Part 27-52 (Full HD 1080p)',
        desc: 'Kho Video Bai Giang Phan 27 den 52 - Full HD 1080p'
    },
    'v-tests-1-26': {
        name: 'Media Assets: Tests Part 1-26 (Full HD 1080p)',
        desc: 'Kho Video Bai Test Phan 1 den 26 - Full HD 1080p'
    },
    'v-tests-27-52': {
        name: 'Media Assets: Tests Part 27-52 (Full HD 1080p)',
        desc: 'Kho Video Bai Test Phan 27 den 52 - Full HD 1080p'
    }
};

// Cache for release IDs and existing assets
const releaseCache = {};

function pad(num) {
    return String(num).padStart(2, '0');
}

// GitHub API Helper
function apiRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const defaultHeaders = {
            'User-Agent': 'English-Master-Uploader',
            'Authorization': 'token ' + token,
            'Accept': 'application/vnd.github.v3+json'
        };
        options.headers = Object.assign(defaultHeaders, options.headers || {});

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(body); } catch(e) {}
                resolve({ statusCode: res.statusCode, data: parsed, raw: body });
            });
        });

        req.on('error', err => reject(err));
        if (postData) req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        req.end();
    });
}

// Ensure a GitHub Release exists and get its details + existing assets
async function getOrCreateRelease(tag) {
    if (releaseCache[tag]) return releaseCache[tag];

    const config = RELEASES_CONFIG[tag] || { name: tag, desc: tag };
    const getRes = await apiRequest({
        hostname: 'api.github.com',
        path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${tag}`,
        method: 'GET'
    });

    let releaseData = null;
    if (getRes.statusCode === 200) {
        releaseData = getRes.data;
    } else {
        console.log(`[+] Dang khoi tao Release tren GitHub: ${tag}...`);
        const postRes = await apiRequest({
            hostname: 'api.github.com',
            path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, {
            tag_name: tag,
            name: config.name,
            body: config.desc,
            draft: false,
            prerelease: false
        });

        if (postRes.statusCode === 201) {
            releaseData = postRes.data;
            console.log(`[✓] Khoi tao Release ${tag} thanh cong! (ID: ${releaseData.id})`);
        } else {
            throw new Error(`Khong the tao release ${tag}: ${postRes.statusCode} - ${postRes.raw}`);
        }
    }

    // Get list of existing asset filenames
    const existingAssets = (releaseData.assets || []).map(a => ({
        name: a.name,
        size: a.size,
        id: a.id,
        downloadUrl: a.browser_download_url
    }));

    releaseCache[tag] = {
        id: releaseData.id,
        uploadUrl: releaseData.upload_url,
        assets: existingAssets
    };

    return releaseCache[tag];
}

// Upload a single file to a release
async function uploadFileToRelease(tag, filePath, fileName, currentIdx, totalCount) {
    if (!fs.existsSync(filePath)) {
        console.log(`  [!] Khong tim thay file cuc bo: ${filePath}`);
        return false;
    }

    const relInfo = await getOrCreateRelease(tag);
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);

    // Check if asset is already uploaded with matching size
    const existing = relInfo.assets.find(a => a.name === fileName);
    if (existing && Math.abs(existing.size - fileSize) < 1024) {
        console.log(`  [${currentIdx}/${totalCount}] [DA CO TREN GITHUB] ${fileName} (${sizeMB} MB) - Bo qua.`);
        return true;
    }

    // If existing but size differs, delete old asset first
    if (existing) {
        console.log(`  [-] Xoa ban cu cua ${fileName} tren GitHub truoc khi upload moi...`);
        await apiRequest({
            hostname: 'api.github.com',
            path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/assets/${existing.id}`,
            method: 'DELETE'
        });
    }

    console.log(`\n-----------------------------------------------------------------------`);
    console.log(`  [${currentIdx}/${totalCount}] DANG UPLOAD: ${fileName} (${sizeMB} MB) -> [${tag}]`);
    console.log(`-----------------------------------------------------------------------`);

    const startTime = Date.now();

    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'uploads.github.com',
            path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/${relInfo.id}/assets?name=${encodeURIComponent(fileName)}`,
            method: 'POST',
            headers: {
                'User-Agent': 'English-Master-Uploader',
                'Authorization': 'token ' + token,
                'Content-Type': 'video/mp4',
                'Content-Length': fileSize
            }
        }, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                const speed = ((fileSize / (1024 * 1024)) / elapsed).toFixed(1);

                if (res.statusCode === 201) {
                    console.log(`  [✓] UPLOAD THANH CONG ${fileName} trong ${elapsed}s (${speed} MB/s)`);
                    resolve(true);
                } else {
                    console.log(`  [!] Loi upload ${fileName}: Status ${res.statusCode} - ${body.slice(0, 100)}`);
                    resolve(false);
                }
            });
        });

        req.on('error', (err) => {
            console.log(`  [!] Loi ket noi khi upload ${fileName}: ${err.message}`);
            resolve(false);
        });

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(req);
    });
}

// Build task list for Lessons
function getLessonsTaskList() {
    const list = [];
    const lessonsDir = path.join(__dirname, 'Videos', 'Lessons');
    for (let i = 1; i <= 52; i++) {
        const fn = `Lesson_${pad(i)}.mp4`;
        const tag = i <= 26 ? 'v-lessons-1-26' : 'v-lessons-27-52';
        list.push({
            tag: tag,
            fileName: fn,
            filePath: path.join(lessonsDir, fn),
            part: i,
            type: 'lesson'
        });
    }
    return list;
}

// Build task list for Tests
function getTestsTaskList() {
    const list = [];
    const testsDir = path.join(__dirname, 'Videos', 'Tests');
    if (!fs.existsSync(testsDir)) return list;

    const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.mp4')).sort();
    files.forEach(fn => {
        // Extract part number from filename (e.g. Test_01_General.mp4 -> 1)
        const match = fn.match(/Test_(\d+)_/i);
        const part = match ? parseInt(match[1]) : 1;
        const tag = part <= 26 ? 'v-tests-1-26' : 'v-tests-27-52';
        list.push({
            tag: tag,
            fileName: fn,
            filePath: path.join(testsDir, fn),
            part: part,
            type: 'test'
        });
    });
    return list;
}

// Run batch upload with auto-retry
async function runBatchUpload(taskList, title) {
    console.log("\n=======================================================================");
    console.log(`   BAT DAU TIEN TRINH UPLOAD: ${title}`);
    console.log(`   Tong so video can dong bo: ${taskList.length} video`);
    console.log("=======================================================================\n");

    let successCount = 0;
    let failedList = [];

    for (let i = 0; i < taskList.length; i++) {
        const task = taskList[i];
        let ok = false;
        let retries = 2;

        while (!ok && retries >= 0) {
            ok = await uploadFileToRelease(task.tag, task.filePath, task.fileName, i + 1, taskList.length);
            if (!ok && retries > 0) {
                console.log(`  [!] Dang thu lai sau 3 giay... (Con ${retries} lan thu)`);
                await new Promise(r => setTimeout(r, 3000));
            }
            retries--;
        }

        if (ok) successCount++;
        else failedList.push(task.fileName);
    }

    console.log(`\n=======================================================================`);
    console.log(`   HOAN TAT DONG BO ${title}!`);
    console.log(`   Thanh cong: ${successCount} / ${taskList.length} video`);
    if (failedList.length > 0) {
        console.log(`   Con loi: ${failedList.join(', ')}`);
    } else {
        console.log(`   TAT CA VIDEO DA CO SAN TREN GITHUB RELEASES CDN! 🎉`);
    }
    console.log(`=======================================================================\n`);
}

// Status report of all releases on GitHub
async function showReleasesReport() {
    console.clear();
    console.log("=======================================================================");
    console.log("     BAO CAO TIEN DO VIDEO TREN GITHUB RELEASES (CLOUD ASSETS)");
    console.log("=======================================================================\n");

    const tags = Object.keys(RELEASES_CONFIG);
    let totalAssets = 0;
    let totalSizeMB = 0;

    for (const tag of tags) {
        console.log(`>>> Dang kiem tra Release: [${tag}]...`);
        try {
            const rel = await getOrCreateRelease(tag);
            const count = rel.assets.length;
            const sizeMB = rel.assets.reduce((acc, a) => acc + (a.size / (1024*1024)), 0).toFixed(1);
            totalAssets += count;
            totalSizeMB += parseFloat(sizeMB);
            console.log(`    - So file: ${count} video`);
            console.log(`    - Dung luong: ${sizeMB} MB`);
            console.log(`    - Danh sach: ${rel.assets.slice(0, 5).map(a => a.name).join(', ')}${count > 5 ? ' ...' : ''}\n`);
        } catch(e) {
            console.log(`    - Chua tao release nay.\n`);
        }
    }

    console.log("-----------------------------------------------------------------------");
    console.log(`TONG SO VIDEO DA CO TREN CLOUD: ${totalAssets} / 156 video (${(totalAssets/156*100).toFixed(0)}%)`);
    console.log(`TONG DUNG LUONG TREN CLOUD:     ${(totalSizeMB / 1024).toFixed(2)} GB`);
    console.log("=======================================================================\n");
}

// CLI Interactive Menu
function showMenu() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.clear();
    console.log("=======================================================================");
    console.log("    CONG CU DONG BO VIDEO 1080p LEN GITHUB RELEASES - ENGLISH MASTER");
    console.log("=======================================================================");
    console.log("  [1] Upload TOAN BO 156 Video (52 Bai giang + 104 Bai test - Full HD)");
    console.log("  [2] Chi upload 52 Video BAI GIANG (Lessons)");
    console.log("  [3] Chi upload 104 Video BAI TEST (Tests)");
    console.log("  [4] Kiem tra bao cao Video hien co tren GitHub Releases");
    console.log("  [0] Thoat");
    console.log("=======================================================================");

    rl.question("Nhap lua chon cua ban (0-4): ", async (ans) => {
        const opt = ans.trim();
        rl.close();

        if (opt === '1') {
            const allTasks = [...getLessonsTaskList(), ...getTestsTaskList()];
            await runBatchUpload(allTasks, "TOAN BO 156 VIDEO (52 Lessons + 104 Tests)");
        } else if (opt === '2') {
            await runBatchUpload(getLessonsTaskList(), "52 VIDEO BAI GIANG (LESSONS)");
        } else if (opt === '3') {
            await runBatchUpload(getTestsTaskList(), "104 VIDEO BAI TEST (TESTS)");
        } else if (opt === '4') {
            await showReleasesReport();
        } else if (opt === '0') {
            process.exit(0);
        } else {
            console.log("Lua chon khong hop le!");
        }

        const rlReturn = readline.createInterface({ input: process.stdin, output: process.stdout });
        rlReturn.question("Nhan Enter de quay lai Menu...", () => {
            rlReturn.close();
            showMenu();
        });
    });
}

// Support command line arguments directly
const args = process.argv.slice(2);
if (args.length === 0) {
    showMenu();
} else {
    const mode = args[0];
    (async () => {
        if (mode === 'all') {
            await runBatchUpload([...getLessonsTaskList(), ...getTestsTaskList()], "TOAN BO 156 VIDEO");
        } else if (mode === 'lessons') {
            await runBatchUpload(getLessonsTaskList(), "52 VIDEO BAI GIANG");
        } else if (mode === 'tests') {
            await runBatchUpload(getTestsTaskList(), "104 VIDEO BAI TEST");
        } else if (mode === 'report') {
            await showReleasesReport();
        }
    })();
}
