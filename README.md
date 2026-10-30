# Speed Test (Project 1)

Team: Bunu and Ayverdi
Deployed URL: <paste your cloud URL here>

A browser-based tool that reports **ping (ms)**, **download speed (Mbps)** and **upload speed (Mbps)**, plus the **amount of data used** for each test.

## System requirements
- Node.js 18 or newer (no npm packages to install)
- A modern browser (Chrome, Edge, Firefox, Safari)

## Run locally
    node server.js        # or: npm start
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
Files: `server.js` (backend), `public/index.html` (UI and measurement logic).

**Ping.** 11 sequential tiny GET requests to `/ping` over one kept-alive connection; the first (TCP handshake) is discarded. We report the median RTT of the other 10, plus jitter and best RTT.

**Download.** 4 parallel streaming `fetch` requests to `/download`, each asking for a large file of random bytes. The browser counts bytes as they arrive, sampling every 100 ms. The first 1 s (TCP slow start) is excluded from the result. The test stops, and the connections are aborted, as soon as two consecutive 1-second windows agree within 5% (minimum 3 s, maximum 10 s). The server stops sending on abort, so a slow link does not waste data and a fast link finishes in about 3 s.

**Upload.** Same logic with 4 parallel `XMLHttpRequest` POSTs of a 4 MB random blob to `/upload`, counting bytes with `xhr.upload.onprogress`.

**Reported data.** The data used is the actual number of bytes received (download) or handed to the network (upload) during the test. Speeds are in megabits per second (1 Mbps = 10^6 bits/s), the same convention used by speedtest.net and fast.com.

## Accuracy notes and limitations
- Upload progress events count bytes written to the browser's socket buffer, so upload can read slightly high on very slow links; the warm-up exclusion and stability window reduce this.
- Random data prevents compression from inflating results.
- `Cache-Control: no-store` and a random query string prevent caching.
- Results depend on the distance to the server. Compare against speedtest.net / fast.com / hiztesti.com.tr using a server near the cloud region, at about the same time.
