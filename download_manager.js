const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline');

// Load video mapping from lessons_data.js
const lessonsDataContent = fs.readFileSync(path.join(__dirname, 'lessons_data.js'), 'utf8');
const vmMatch = lessonsDataContent.match(/const videoMappingData = (\{[\s\S]*?\});/);
if (!vmMatch) {
    console.error("Không tìm thấy dữ liệu videoMappingData trong lessons_data.js!");
    process.exit(1);
}
const videoMappingData = JSON.parse(vmMatch[1]);

// Ensure destination directories exist
const lessonsDir = path.join(__dirname, 'Videos', 'Lessons');
const testsDir = path.join(__dirname, 'Videos', 'Tests');
fs.mkdirSync(lessonsDir, { recursive: true });
fs.mkdirSync(testsDir, { recursive: true });

// Local FFmpeg binary path
const ffmpegPath = path.join(__dirname, 'ffmpeg.exe');
const hasFfmpeg = fs.existsSync(ffmpegPath);

function pad(num) {
    return String(num).padStart(2, '0');
}

function getFileSizeMB(targetPath) {
    if (!fs.existsSync(targetPath)) return 0;
    const stats = fs.statSync(targetPath);
    return (stats.size / (1024 * 1024)).toFixed(1);
}

// Inspect actual video resolution using local ffmpeg
function getVideoResolution(targetPath) {
    if (!fs.existsSync(targetPath)) return null;
    if (!hasFfmpeg) return null;
    try {
        const probe = spawnSync(ffmpegPath, ['-i', targetPath], { encoding: 'utf8', timeout: 5000 });
        const match = (probe.stderr || '').match(/Video:.*,\s*(\d{3,4})x(\d{3,4})/);
        if (match) {
            const w = parseInt(match[1]);
            const h = parseInt(match[2]);
            return { width: w, height: h, label: h >= 1080 ? '1080p' : (h >= 720 ? '720p' : `${h}p`) };
        }
    } catch (e) {
        // probe failed
    }
    return null;
}

// Check if a file exists AND is at least 720p/1080p HD
function isFileValid(targetPath) {
    if (!fs.existsSync(targetPath)) return false;
    const stats = fs.statSync(targetPath);
    if (stats.size < 1024 * 1024 * 5) return false; // less than 5MB is definitely broken/incomplete

    // If FFmpeg is available, verify resolution is >= 720p (not 360p)
    const res = getVideoResolution(targetPath);
    if (res) {
        return res.height >= 720;
    }

    // Fallback: estimate by file size (> 15MB)
    return stats.size > 1024 * 1024 * 15;
}

function downloadVideo(url, targetPath, title, forceOverwrite = false) {
    const exists = fs.existsSync(targetPath);
    const resInfo = exists ? getVideoResolution(targetPath) : null;
    const sizeMB = exists ? getFileSizeMB(targetPath) : 0;

    if (!forceOverwrite && exists) {
        if (resInfo && resInfo.height >= 720) {
            console.log(`  [DA CO ${resInfo.label}] ${path.basename(targetPath)} (${sizeMB} MB) - Bo qua.`);
            return true;
        } else if (resInfo && resInfo.height < 720) {
            console.log(`\n  [!] PHAT HIEN BAN THAP ${resInfo.label} (${sizeMB} MB) -> Tu dong tai de ban Full HD 1080p...`);
        } else if (isFileValid(targetPath)) {
            console.log(`  [DA CO VIDEO] ${path.basename(targetPath)} (${sizeMB} MB) - Bo qua.`);
            return true;
        }
    }

    console.log(`\n------------------------------------------------------------`);
    console.log(`[DANG TAI FULL HD 1080p] ${title}`);
    console.log(`URL: ${url}`);
    console.log(`Luu vao: ${targetPath}`);
    console.log(`------------------------------------------------------------`);

    const cookiesPath = path.join(__dirname, 'cookies.txt');
    const hasCookies = fs.existsSync(cookiesPath);

    // Prioritize 1080p separate video stream + best audio stream merged via ffmpeg
    const args = [
        '-f', 'bestvideo[height<=1080]+bestaudio/bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4',
        '--no-playlist',
        '--no-mtime',
        '--force-overwrites',
        '--js-runtimes', 'node',
        '--remote-components', 'ejs:github',
        '--extractor-args', 'youtube:player_client=all',
        '--sleep-interval', '1',
        '-o', targetPath
    ];

    if (hasFfmpeg) {
        args.push('--ffmpeg-location', ffmpegPath);
    }

    if (hasCookies) {
        args.push('--cookies', cookiesPath);
    }

    args.push(url);

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

// ==============================================================
// HEALTH CHECK REPORT
// ==============================================================
function showHealthCheckReport() {
    console.clear();
    console.log("===================================================================================");
    console.log("             BAO CAO KIEM TRA KHO VIDEO CUC BO (HEALTH CHECK REPORT)");
    console.log("===================================================================================\n");

    let totalLessonsHD = 0;
    let totalTestsHD = 0;
    let totalLowRes = 0;
    let missingLessons = [];
    let missingTests = [];
    let lowResFiles = [];
    let totalSizeMB = 0;

    console.log("PHAN | BAI GIANG (LESSON)            | BAI TEST (VIET-ANH / ANH-VIET)");
    console.log("-----+-------------------------------+----------------------------------------------");

    for (let i = 1; i <= 52; i++) {
        const item = videoMappingData.videos[i];
        const lessonTarget = path.join(lessonsDir, `Lesson_${pad(i)}.mp4`);
        const lessonExists = fs.existsSync(lessonTarget);
        const lessonRes = lessonExists ? getVideoResolution(lessonTarget) : null;
        const lessonSize = lessonExists ? getFileSizeMB(lessonTarget) : 0;
        
        let lessonStr = "";
        if (!lessonExists) {
            lessonStr = "[ ] Thieu";
            missingLessons.push(i);
        } else if (lessonRes && lessonRes.height >= 720) {
            lessonStr = `[x] ${lessonRes.label} (${lessonSize}MB)`;
            totalLessonsHD++;
            totalSizeMB += parseFloat(lessonSize);
        } else {
            const lbl = lessonRes ? lessonRes.label : "360p";
            lessonStr = `[!] ${lbl} (${lessonSize}MB) RE-DL`;
            totalLowRes++;
            lowResFiles.push(`Lesson_${pad(i)}.mp4 (${lbl})`);
            totalSizeMB += parseFloat(lessonSize);
        }

        let testStrs = [];
        let hasAllTestsHD = true;
        if (item && item.testVideos && item.testVideos.length > 0) {
            item.testVideos.forEach(t => {
                let fn = t.type === 'vn-en' ? `Test_${pad(i)}_VnEn.mp4` : (t.type === 'en-vn' ? `Test_${pad(i)}_EnVn.mp4` : `Test_${pad(i)}_General.mp4`);
                let p = path.join(testsDir, fn);
                const testExists = fs.existsSync(p);
                const testRes = testExists ? getVideoResolution(p) : null;
                const testSize = testExists ? getFileSizeMB(p) : 0;

                if (!testExists) {
                    hasAllTestsHD = false;
                    testStrs.push(`${t.type}: [ ]`);
                } else if (testRes && testRes.height >= 720) {
                    totalTestsHD++;
                    totalSizeMB += parseFloat(testSize);
                    testStrs.push(`${t.type}: [x] ${testRes.label}`);
                } else {
                    hasAllTestsHD = false;
                    totalLowRes++;
                    const lbl = testRes ? testRes.label : "360p";
                    lowResFiles.push(`${fn} (${lbl})`);
                    totalSizeMB += parseFloat(testSize);
                    testStrs.push(`${t.type}: [!] ${lbl}`);
                }
            });
        }

        if (!hasAllTestsHD) missingTests.push(i);

        const padP = String(i).padStart(2, '0');
        const padLesson = lessonStr.padEnd(29, ' ');
        console.log(`P.${padP} | ${padLesson} | ${testStrs.join('  ')}`);
    }

    console.log("-----+-------------------------------+----------------------------------------------");
    console.log(`\nTONG KET CHAT LUONG:`);
    console.log(`- Video Bai Giang dat 1080p: ${totalLessonsHD} / 52 bai (${Math.round(totalLessonsHD / 52 * 100)}%)`);
    console.log(`- Video Bai Test dat 1080p:  ${totalTestsHD} / 104 video (${Math.round(totalTestsHD / 104 * 100)}%)`);
    console.log(`- Tong dung luong tren o dia: ${(totalSizeMB / 1024).toFixed(2)} GB`);
    
    if (lowResFiles.length > 0) {
        console.log(`\n⚠️  CAN TAI LAI: Co ${lowResFiles.length} file dang bi luu o ban thap (360p):`);
        console.log(`   ${lowResFiles.slice(0, 10).join(', ')}${lowResFiles.length > 10 ? ' ...' : ''}`);
        console.log(`   -> Chon chuc nang [1] hoac [4] de cong cu tu dong tai de ban Full HD 1080p!`);
    }

    if (missingLessons.length > 0) {
        console.log(`\n- Bai giang con thieu: Phan ${missingLessons.join(', ')}`);
    }

    if (missingTests.length > 0) {
        console.log(`- Bai test con thieu/chua dat 1080p: Phan ${missingTests.join(', ')}`);
    }
}

// ==============================================================
// SMART AUTO-RESUME (Only Download Missing Files)
// ==============================================================
function smartAutoResume() {
    console.log("\n=======================================================================");
    console.log("  DANG QUET VA TU DONG TAI BU CAC FILE CON THIEU (SMART AUTO-RESUME)");
    console.log("=======================================================================");
    
    let downloadedCount = 0;

    for (let i = 1; i <= 52; i++) {
        const lessonTarget = path.join(lessonsDir, `Lesson_${pad(i)}.mp4`);
        if (!isFileValid(lessonTarget)) {
            console.log(`\n>>> [BAI GIANG THIEU] Dang tai Phan ${i}...`);
            const res = downloadLesson(i, false);
            if (res) downloadedCount++;
        }

        const item = videoMappingData.videos[i];
        if (item && item.testVideos) {
            item.testVideos.forEach(t => {
                let fn = t.type === 'vn-en' ? `Test_${pad(i)}_VnEn.mp4` : (t.type === 'en-vn' ? `Test_${pad(i)}_EnVn.mp4` : `Test_${pad(i)}_General.mp4`);
                let p = path.join(testsDir, fn);
                if (!isFileValid(p)) {
                    console.log(`\n>>> [BAI TEST THIEU] Dang tai Test Phan ${i} (${t.type})...`);
                    const res = downloadVideo(`https://www.youtube.com/watch?v=${t.videoId}`, p, `Bai Test Phan ${i} (${t.type})`, false);
                    if (res) downloadedCount++;
                }
            });
        }
    }

    console.log(`\n=======================================================================`);
    console.log(`  HOAN TAT QUET VA TAI BU! DA TAI THEM: ${downloadedCount} VIDEO MOI.`);
    console.log(`=======================================================================`);
}

// ==============================================================
// INTERACTIVE CLI MENU
// ==============================================================
function showInteractiveMenu() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const cookiesPath = path.join(__dirname, 'cookies.txt');
    const hasCookies = fs.existsSync(cookiesPath);

    console.clear();
    console.log("=======================================================================");
    console.log("       CONG CU TAI VIDEO FULL HD 1080p - ENGLISH MASTER PRO");
    console.log("=======================================================================");
    console.log(`  Trang thai Cookies: ${hasCookies ? "DA KICH HOAT (cookies.txt)" : "Chua co file cookies.txt"}`);
    console.log("-----------------------------------------------------------------------");
    console.log("");
    console.log("  --- [ TU DONG THONG MINH ] ---");
    console.log("  [1] Tu dong quet & Tai bu toan bo file con thieu (Smart Auto-Resume)");
    console.log("  [2] Bao cao kiem tra kho Video tren may (Health Check Report)");
    console.log("");
    console.log("  --- [ TAI THEO KHOANG TUY CHON (A -> B) ] ---");
    console.log("  [3] Tai khoang Video BAI GIANG (Lessons) (Vi du: tu bai 7 den 51)");
    console.log("  [4] Tai khoang Video BAI TEST (Tests)    (Vi du: tu bai 7 den 51)");
    console.log("  [5] Tai khoang CA BAI GIANG & BAI TEST   (Vi du: tu bai 7 den 51)");
    console.log("");
    console.log("  --- [ TAI THEO PHAN DON LE HOAC TAT CA ] ---");
    console.log("  [6] Tai 1 Phan cu the (Chon so phan: 1 den 52)");
    console.log("  [7] Tai TOAN BO 156 Video (52 Bai giang + 104 Bai test - Full HD 1080p)");
    console.log("");
    console.log("  --- [ TRO GIUP & KHAC PHUC LOI ] ---");
    console.log("  [8] Huong dan nap Cookies vuot loi 'Sign in to confirm you are not a bot'");
    console.log("  [0] Thoat");
    console.log("");
    console.log("=======================================================================");

    rl.question("Vui long nhap lua chon cua ban (0-8): ", (ans) => {
        const opt = ans.trim();

        if (opt === '8') {
            console.clear();
            console.log("=======================================================================");
            console.log("   HUONG DAN NAP FILE COOKIES.TXT DE VUOT CHAN BOT YOUTUBE (1 PHUT)");
            console.log("=======================================================================");
            console.log("\nKhi tai nhieu video lien tiep, YouTube se yeu cau xac thuc ban khong phai bot.");
            console.log("De tai tiep tuc cuc muot, ban chi can 2 buoc don gian:");
            console.log("\n  Buoc 1: Cai tien ich 'Get cookies.txt LOCALLY' tren Chrome/Edge");
            console.log("          (Link: https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)");
            console.log("  Buoc 2: Mo trang web youtube.com tren trinh duyet -> Bam vao icon tien ich -> Bam 'Export'");
            console.log("  Buoc 3: Luu file tai ve thanh ten 'cookies.txt' va bo vao thu muc:");
            console.log(`          ${__dirname}`);
            console.log("\nSau khi bo file cookies.txt vao, cong cu se tu dong nhan dien va tai 100% video khong bao gio bi chan!");
            console.log("=======================================================================");
            promptReturn(rl);
        } else if (opt === '1') {
            smartAutoResume();
            promptReturn(rl);
        } else if (opt === '2') {
            showHealthCheckReport();
            promptReturn(rl);
        } else if (opt === '3') {
            // Download Lessons Range
            rl.question("\nNhap phan BAT DAU (1-52): ", (fromInput) => {
                rl.question("Nhap phan KET THUC (1-52): ", (toInput) => {
                    const from = parseInt(fromInput.trim());
                    const to = parseInt(toInput.trim());
                    if (from >= 1 && to <= 52 && from <= to) {
                        console.log(`\n>>> DANG TAI VIDEO BAI GIANG (LESSONS) TU PHAN ${from} DEN PHAN ${to}...`);
                        for (let i = from; i <= to; i++) {
                            downloadLesson(i, false);
                        }
                        console.log(`\n>>> HOAN TAT TAI BAI GIANG PHAN ${from} DEN ${to}!`);
                    } else {
                        console.log("\n[!] Khoang phan khong hop le (vui long nhap tu 1 den 52).");
                    }
                    promptReturn(rl);
                });
            });
        } else if (opt === '4') {
            // Download Tests Range
            rl.question("\nNhap phan BAT DAU (1-52): ", (fromInput) => {
                rl.question("Nhap phan KET THUC (1-52): ", (toInput) => {
                    const from = parseInt(fromInput.trim());
                    const to = parseInt(toInput.trim());
                    if (from >= 1 && to <= 52 && from <= to) {
                        console.log(`\n>>> DANG TAI VIDEO BAI TEST (TESTS) TU PHAN ${from} DEN PHAN ${to}...`);
                        for (let i = from; i <= to; i++) {
                            downloadTest(i, false);
                        }
                        console.log(`\n>>> HOAN TAT TAI BAI TEST PHAN ${from} DEN ${to}!`);
                    } else {
                        console.log("\n[!] Khoang phan khong hop le (vui long nhap tu 1 den 52).");
                    }
                    promptReturn(rl);
                });
            });
        } else if (opt === '5') {
            // Download Both Range
            rl.question("\nNhap phan BAT DAU (1-52): ", (fromInput) => {
                rl.question("Nhap phan KET THUC (1-52): ", (toInput) => {
                    const from = parseInt(fromInput.trim());
                    const to = parseInt(toInput.trim());
                    if (from >= 1 && to <= 52 && from <= to) {
                        console.log(`\n>>> DANG TAI CA BAI GIANG & BAI TEST TU PHAN ${from} DEN PHAN ${to}...`);
                        for (let i = from; i <= to; i++) {
                            downloadLesson(i, false);
                            downloadTest(i, false);
                        }
                        console.log(`\n>>> HOAN TAT TAI TOAN BO PHAN ${from} DEN ${to}!`);
                    } else {
                        console.log("\n[!] Khoang phan khong hop le (vui long nhap tu 1 den 52).");
                    }
                    promptReturn(rl);
                });
            });
        } else if (opt === '6') {
            // Download Single Part
            rl.question("\nNhap so phan muon tai (1-52): ", (pInput) => {
                const p = parseInt(pInput.trim());
                if (p >= 1 && p <= 52) {
                    console.log(`\n  Chon loai video muon tai cho Phan ${p}:`);
                    console.log(`  [1] Chi tai Video Bai Giang`);
                    console.log(`  [2] Chi tai Video Bai Test (Viet-Anh & Anh-Viet)`);
                    console.log(`  [3] Tai Ca Bai Giang va Bai Test`);
                    rl.question(`Lua chon cua ban (1-3): `, (subOpt) => {
                        const s = subOpt.trim();
                        if (s === '1') {
                            downloadLesson(p, true);
                        } else if (s === '2') {
                            downloadTest(p, true);
                        } else {
                            downloadLesson(p, true);
                            downloadTest(p, true);
                        }
                        console.log(`\n>>> HOAN TAT TAI PHAN ${p}!`);
                        promptReturn(rl);
                    });
                } else {
                    console.log("\n[!] So phan khong hop le!");
                    promptReturn(rl);
                }
            });
        } else if (opt === '7') {
            // Download All 156 Videos
            console.log("\n>>> DANG TAI TOAN BO 156 VIDEO FULL HD 1080p (52 Lessons + 104 Tests)...");
            for (let i = 1; i <= 52; i++) {
                downloadLesson(i, false);
                downloadTest(i, false);
            }
            console.log("\n>>> HOAN TAT TOAN BO 156 VIDEO FULL HD!");
            promptReturn(rl);
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

// CLI args support
const args = process.argv.slice(2);
if (args.length === 0) {
    showInteractiveMenu();
} else {
    const mode = args[0];
    if (mode === 'report') {
        showHealthCheckReport();
    } else if (mode === 'resume') {
        smartAutoResume();
    } else if (mode === 'lessons_range') {
        const from = parseInt(args[1]) || 1;
        const to = parseInt(args[2]) || 52;
        for (let i = from; i <= to; i++) downloadLesson(i, false);
    } else if (mode === 'tests_range') {
        const from = parseInt(args[1]) || 1;
        const to = parseInt(args[2]) || 52;
        for (let i = from; i <= to; i++) downloadTest(i, false);
    } else if (mode === 'both_range') {
        const from = parseInt(args[1]) || 1;
        const to = parseInt(args[2]) || 52;
        for (let i = from; i <= to; i++) {
            downloadLesson(i, false);
            downloadTest(i, false);
        }
    }
}
