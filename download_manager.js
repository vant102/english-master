const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline');

// Load video mapping from lessons_data.js
const lessonsDataContent = fs.readFileSync(path.join(__dirname, 'lessons_data.js'), 'utf8');
const vmMatch = lessonsDataContent.match(/const videoMappingData = (\{[\s\S]*?\});/);
if (!vmMatch) {
    console.error("Khong tim thay du lieu videoMappingData trong lessons_data.js!");
    process.exit(1);
}
const videoMappingData = JSON.parse(vmMatch[1]);

// Ensure destination directories exist
const lessonsDir = path.join(__dirname, 'Videos', 'Lessons');
const testsDir = path.join(__dirname, 'Videos', 'Tests');
fs.mkdirSync(lessonsDir, { recursive: true });
fs.mkdirSync(testsDir, { recursive: true });

function pad(num) {
    return String(num).padStart(2, '0');
}

function downloadVideo(url, targetPath, title, forceOverwrite = false) {
    if (!forceOverwrite && fs.existsSync(targetPath)) {
        const stats = fs.statSync(targetPath);
        // If file > 50MB it's already a full 1080p download
        if (stats.size > 1024 * 1024 * 50) {
            console.log(`[DA CO 1080p] ${path.basename(targetPath)} (${(stats.size / 1024 / 1024).toFixed(1)} MB) - Bo qua.`);
            return true;
        }
    }

    console.log(`\n------------------------------------------------------------`);
    console.log(`[DANG TAI FULL HD 1080p] ${title}`);
    console.log(`URL: ${url}`);
    console.log(`Luu vao: ${targetPath}`);
    console.log(`------------------------------------------------------------`);

    // Download in 1080p Full HD and merge with ffmpeg into crystal clear MP4
    const args = [
        '-f', 'bestvideo[height<=1080]+bestaudio/best',
        '--merge-output-format', 'mp4',
        '--no-playlist',
        '--no-mtime',
        '--force-overwrites',
        '-o', targetPath,
        url
    ];

    const result = spawnSync('yt-dlp', args, { stdio: 'inherit', shell: false });
    return result.status === 0;
}

function downloadLesson(part, force = false) {
    const item = videoMappingData.videos[part];
    if (!item || !item.lessonVideo) {
        console.log(`[!] Khong co video bai giang cho Phan ${part}`);
        return false;
    }
    const target = path.join(lessonsDir, `Lesson_${pad(part)}.mp4`);
    const url = `https://www.youtube.com/watch?v=${item.lessonVideo.videoId}`;
    return downloadVideo(url, target, `Phan ${part}: ${item.lessonVideo.title}`, force);
}

function downloadTest(part, force = false) {
    const item = videoMappingData.videos[part];
    if (!item || !item.testVideos || item.testVideos.length === 0) {
        console.log(`[!] Khong co video bai test cho Phan ${part}`);
        return false;
    }

    let success = true;
    item.testVideos.forEach(t => {
        let filename = '';
        if (t.type === 'vn-en') filename = `Test_${pad(part)}_VnEn.mp4`;
        else if (t.type === 'en-vn') filename = `Test_${pad(part)}_EnVn.mp4`;
        else filename = `Test_${pad(part)}_General.mp4`;

        const target = path.join(testsDir, filename);
        const url = `https://www.youtube.com/watch?v=${t.videoId}`;
        const res = downloadVideo(url, target, `Bai Test Phan ${part} (${t.type}): ${t.title}`, force);
        if (!res) success = false;
    });
    return success;
}

function showInteractiveMenu() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.clear();
    console.log("=======================================================================");
    console.log("  CONG CU TAI VIDEO FULL HD 1080p (CHO MAN HINH LON) - ENGLISH MASTER");
    console.log("=======================================================================");
    console.log("");
    console.log("  [1] Tai Full HD 1080p Phan 1 den Phan 5 (Xem cuc net tren man hinh 27\")");
    console.log("  [2] Tai toan bo 52 Video Bai Giang (Full HD 1080p)");
    console.log("  [3] Tai toan bo 104 Video Bai Test (Full HD 1080p)");
    console.log("  [4] Tai TOAN BO 156 Video (Bai Giang + Test - Full HD 1080p)");
    console.log("  [5] Tai mot Phan cu the (Chon so phan: 1 den 52)");
    console.log("  [0] Thoat");
    console.log("");
    console.log("=======================================================================");

    rl.question("Vui long nhap lua chon cua ban (0-5): ", (ans) => {
        const opt = ans.trim();

        if (opt === '1') {
            console.log("\n>>> DANG TAI FULL HD 1080p PHAN 1 DEN PHAN 5...");
            for (let i = 1; i <= 5; i++) {
                downloadLesson(i, true);
                downloadTest(i, true);
            }
            console.log("\n>>> HOAN TAT TAI FULL HD PHAN 1 DEN 5!");
            promptReturn(rl);
        } else if (opt === '2') {
            console.log("\n>>> DANG TAI TOAN BO 52 VIDEO BAI GIANG FULL HD 1080p...");
            for (let i = 1; i <= 52; i++) {
                downloadLesson(i, true);
            }
            console.log("\n>>> HOAN TAT TAI 52 VIDEO BAI GIANG!");
            promptReturn(rl);
        } else if (opt === '3') {
            console.log("\n>>> DANG TAI TOAN BO 104 VIDEO BAI TEST FULL HD 1080p...");
            for (let i = 1; i <= 52; i++) {
                downloadTest(i, true);
            }
            console.log("\n>>> HOAN TAT TAI 104 VIDEO BAI TEST!");
            promptReturn(rl);
        } else if (opt === '4') {
            console.log("\n>>> DANG TAI TOAN BO 156 VIDEO FULL HD 1080p...");
            for (let i = 1; i <= 52; i++) {
                downloadLesson(i, true);
                downloadTest(i, true);
            }
            console.log("\n>>> HOAN TAT TOAN BO 156 VIDEO FULL HD!");
            promptReturn(rl);
        } else if (opt === '5') {
            rl.question("\nNhap so phan ban muon tai (1-52): ", (partInput) => {
                const p = parseInt(partInput.trim());
                if (p >= 1 && p <= 52) {
                    console.log(`\n>>> DANG TAI FULL HD VIDEO PHAN ${p}...`);
                    downloadLesson(p, true);
                    downloadTest(p, true);
                    console.log(`\n>>> HOAN TAT TAI PHAN ${p}!`);
                } else {
                    console.log("\n[!] So phan khong hop le (vui long nhap tu 1 den 52).");
                }
                promptReturn(rl);
            });
        } else if (opt === '0') {
            rl.close();
            process.exit(0);
        } else {
            console.log("\n[!] Lua chon khong hop le!");
            promptReturn(rl);
        }
    });
}

function promptReturn(rl) {
    rl.question("\nNhan Enter de quay lai Menu chinh...", () => {
        rl.close();
        showInteractiveMenu();
    });
}

// Check arguments or start menu
const args = process.argv.slice(2);
if (args.length === 0) {
    showInteractiveMenu();
} else {
    const mode = args[0];
    const targetPart = parseInt(args[1]);

    if (mode === 'lesson_all') {
        for (let i = 1; i <= 52; i++) downloadLesson(i, true);
    } else if (mode === 'test_all') {
        for (let i = 1; i <= 52; i++) downloadTest(i, true);
    } else if (mode === 'all') {
        for (let i = 1; i <= 52; i++) {
            downloadLesson(i, true);
            downloadTest(i, true);
        }
    } else if (mode === 'range') {
        const from = parseInt(args[1]) || 1;
        const to = parseInt(args[2]) || 5;
        for (let i = from; i <= to; i++) {
            downloadLesson(i, true);
            downloadTest(i, true);
        }
    } else if (mode === 'part' && targetPart) {
        downloadLesson(targetPart, true);
        downloadTest(targetPart, true);
    }
}
