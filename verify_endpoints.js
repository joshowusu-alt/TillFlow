const http = require('http');

const urls = [
    'http://localhost:6200/pos',
    'http://localhost:6200/customers'
];

async function checkUrl(url) {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            console.log(`${url}: ${res.statusCode}`);
            // Consume response to free memory
            res.resume();
            resolve(res.statusCode === 200);
        });

        req.on('error', (e) => {
            console.error(`${url}: Error - ${e.message}`);
            resolve(false);
        });
    });
}

(async () => {
    console.log('Verifying application endpoints...');
    // Wait a bit for server to be fully ready if it just started
    await new Promise(r => setTimeout(r, 2000));

    for (const url of urls) {
        await checkUrl(url);
    }
})();
