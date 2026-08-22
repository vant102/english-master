// Deno Deploy Edge Video Streamer for English Master Pro
// Fixes iOS/iPadOS Safari playback by rewriting GitHub Releases headers to native video/mp4 & inline

Deno.serve(async (req) => {
    const url = new URL(req.url);

    // Root check / health check
    if (url.pathname === '/' || url.pathname === '') {
        return new Response('English Master Pro Video Streamer (Edge CDN) is Online! 🚀', {
            status: 200,
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                'Access-Control-Allow-Headers': 'Range, Content-Type, Accept, Origin, User-Agent',
                'Access-Control-Max-Age': '86400'
            }
        });
    }

    // Path pattern: /v-lessons-1-26/Lesson_01.mp4 or /v-tests-1-26/Test_01_General.mp4
    const githubReleaseUrl = 'https://github.com/vant102/english-master/releases/download' + url.pathname;

    const reqHeaders = new Headers();
    // Forward Range header for video seeking & scrubbing
    if (req.headers.has('range')) {
        reqHeaders.set('range', req.headers.get('range'));
    }
    reqHeaders.set('User-Agent', 'English-Master-Edge-Streamer');

    try {
        const ghRes = await fetch(githubReleaseUrl, {
            headers: reqHeaders,
            redirect: 'follow'
        });

        const resHeaders = new Headers(ghRes.headers);

        // Core fix for Apple iOS / iPadOS Safari & AVFoundation:
        resHeaders.set('Content-Type', 'video/mp4');
        resHeaders.set('Content-Disposition', 'inline');
        resHeaders.set('Access-Control-Allow-Origin', '*');
        resHeaders.set('Accept-Ranges', 'bytes');
        resHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');

        return new Response(ghRes.body, {
            status: ghRes.status,
            headers: resHeaders
        });
    } catch (err) {
        return new Response('Streaming error: ' + err.message, {
            status: 500,
            headers: {
                'Content-Type': 'text/plain',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
});
