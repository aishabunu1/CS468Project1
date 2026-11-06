# CS468 Speed Test (Project 1)

Group Members Team: Aisha Babagana Bunu and Ceren Ayverdi
Deployed URL: http://13.51.69.216/

A browser-based tool that reports **ping (ms)**, **download speed (Mbps)** and **upload speed (Mbps)**, plus the **amount of data used** for each test.

## System requirements
- Node.js 18 or newer (no npm packages to install)
- A modern browser (Chrome, Edge, Firefox, Safari)

## Run locally
    node server.js        
Open http://localhost:8080 and click **Start test**. Set another port with `PORT=3000 node server.js`.
Local runs measure loopback, so the numbers are very high and only show that the code works.

## Deploy to the cloud (AWS EC2 example)
1. Launch an Ubuntu instance (t3.micro is enough). In its security group, allow inbound TCP 80 (or 8080) from anywhere.
2. `sudo apt update && sudo apt install -y nodejs` (Node 18+; otherwise use NodeSource or nvm).
3. Copy this folder to the instance (`scp -r` or `git clone`).
4. `PORT=80 sudo node server.js` (or run on 8080 and open that port). Keep it alive with `nohup node server.js &` or `pm2 start server.js`.
5. Visit `http://<public-ip>/`.
Pick a region close to you, and do not use a burstable/throttled instance type for the final demo.
Do not put a compressing proxy (e.g. gzip in nginx/CloudFront) in front: the test data is random, but compression must not alter the byte counts.

## How it works
Files: `server.js` (backend: ping, download, upload and upload statistics), `public/index.html` (UI and measurement logic).

**Ping.** 11 sequential tiny GET requests to `/ping` over one kept-alive connection; the first (TCP handshake) is discarded. We report the median RTT of the other 10, plus jitter and best RTT.

**Download.** 4 parallel streaming `fetch` requests to `/download`, each asking for a large file of random bytes. The browser counts bytes as they arrive, sampling every 100 ms. The first 2 s (TCP slow start and the initial burst) are excluded from the result. The test stops, and the connections are aborted, as soon as two consecutive 1-second windows agree within 5% (minimum 5 s, maximum 10 s). The server stops sending on abort, so a slow link does not waste data and a fast link finishes in about 5 s.

**Upload.** Same logic with 4 parallel `XMLHttpRequest` POSTs of a 4 MB random blob to `/upload`. The browser's `xhr.upload.onprogress` only drives the live graph. The final speed comes from the server, which records when each chunk actually arrived (`/upload-stats`), so it reflects bytes received, not bytes the browser merely handed to the network. 

**Reported data.** The data used is the actual number of bytes received by the browser (download) or by the server (upload) during the test. Speeds are in megabits per second (1 Mbps = 10^6 bits/s), the same convention used by speedtest.net and fast.com.

## Why we chose these methods
- **4 parallel streams:** one TCP connection can be capped by its window or a lost packet and read too low; several fill the link better, while staying under the browser's ~6 connections per host.
- **First 2 s excluded:** TCP slow start and the initial burst (buffers and mobile networks briefly run faster) do not represent the sustained rate, so we exclude them.
- **Stop when two 1 s windows agree within 5%:** saves data on fast links; the 5 s minimum and 10 s maximum avoid stopping too early or never stopping.
- **Median ping of 10 requests:** the first (TCP handshake) is dropped, and the median ignores a single slow request.
- **Random, uncached data:** it cannot be compressed or served from a cache.
- **`fetch` for download, XHR for upload:** `fetch` streams bytes and aborts instantly; only XHR reports upload progress.
- **Failed requests:** retried after 200 ms, and the test stops with an error after 5 failures.

## Accuracy notes and limitations
- The browser's upload progress events count bytes written to its socket buffer, which can run ahead of what the network delivers. That is why the reported upload speed is measured on the server instead.
- Random data prevents compression from inflating results.
- `Cache-Control: no-store` and a random query string prevent caching.
- Results depend on the distance to the server. Compare against other tools at about the same time, using a server near ours.
- Our ping is a full HTTP request/response, so it reads about 40 to 55 ms higher than speedtest.net even on the same server (speedtest.net uses a lighter WebSocket round trip).

## Cross-check with other tools
Our test server is on AWS in Stockholm (eu-north-1), the only region our account may use. The fairest comparison is therefore speedtest.net with its Stockholm server (Telia). Tools that use Istanbul servers (Cloudflare, hiztesti) are much closer to the client, so their ping is lower and single-connection download can be higher. All tests were run back to back on the Özyeğin campus network.

| Tool (server) | Download (Mbps) | Upload (Mbps) | Ping (ms) |
|---|---|---|---|
| Our test (Stockholm) | 28 to 82 | 19 to 46 | 100 to 125 |
| speedtest.net (Telia, Stockholm) | 84 (avg of 3 runs; ours averaged 82) | 10 to 14 | 40 to 55 lower than ours |
| Cloudflare (Istanbul) | 41.5 (ours at the same time: 28.4) | 14.9 | 13.5 |

Notes:
- On the same Stockholm server, our download matches speedtest.net within about 3%.
- Upload differs between the other tools themselves (10 to 44 Mbps on the same link), and ours falls inside that range. It is measured on the server and agrees with the browser's own estimate within about 10%.
- The campus link varies a lot from minute to minute, so back-to-back runs only match loosely.
- Ping differs because of distance (Stockholm vs Istanbul) and method.