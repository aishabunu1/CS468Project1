# CS468 Speed Test (Project 1)

Group Members: Aisha Babagana Bunu and Ceren Ayverdi
# Project URL: http://13.51.69.216/

This project focused on creating a  browser-based tool that reports **ping (ms)**, **download speed (Mbps)** and **upload speed (Mbps)**, plus the **amount of data used** for each test.

## System requirements
- Node.js 18 or newer (no npm packages to install)
- A modern browser (Safari, Chrome etc)

## Run locally
    node server.js        
Open http://localhost:8080 and click **Start test**. Set another port with `PORT=3000 node server.js`.
Local runs measure loopback, so the numbers are very high and only show that the code works.

## Deploy to the cloud (AWS EC2 example)
1. Launch an Ubuntu instance (t3.micro is enough). In its security group, allow inbound TCP 80 (or 8080) from anywhere.
2. `sudo apt update && sudo apt install -y nodejs` (Node 18+; otherwise use NodeSource or nvm).
3. Copy this folder to the instance (`scp -r` or `git clone`).
4. `sudo PORT=80 node server.js` (or run on 8080 and open that port). To keep it running after the terminal closes and after a reboot, run it as a systemd service: create `/etc/systemd/system/speedtest.service` with `ExecStart=/usr/bin/node /home/ubuntu/speedtest/server.js`, `Environment=PORT=80` and `Restart=always` (check the node path with `which node`), then `sudo systemctl enable --now speedtest`.
5. Visit `http://<public-ip>/`.
Ideally pick a region close to the users. Ours runs in Stockholm (eu-north-1) because that is the only region our account may use. We tried to use frankfurt but our aws free account restriccts it.

## How it works
Files: `server.js` (backend: ping, download, upload and upload statistics), `public/index.html` (UI and measurement logic), `package.json` (project metadata and Node.js version requirement).

**Ping.** 11 sequential tiny GET requests to `/ping` over one kept-alive connection; The first request is discarded to reduce the influence of connection setup and initial-request overhead. We report the median RTT of the other 10, plus jitter and best RTT.

**Download.** 4 parallel streaming `fetch` requests to `/download`, each asking for a large file of random bytes. The browser counts bytes as they arrive, sampling every 100 ms. The first 2 s (TCP slow start and the initial burst) are excluded from the result. The test stops, and the connections are aborted, as soon as two consecutive 1-second windows agree within 5% (minimum 5 s, maximum 10 s). The server stops sending on abort, so a slow link does not waste data and a fast link finishes in about 5 s.

**Upload.** Same logic with 4 parallel `XMLHttpRequest` POSTs of a 16 MB random blob to `/upload`. The browser's `xhr.upload.onprogress` only drives the live graph. The final speed comes from the server, which records when each chunk actually arrived (`/upload-stats`), so it reflects bytes received, not bytes the browser merely handed to the network. 

**Reported data.** The data used is the actual number of bytes received by the browser (download) or by the server (upload) during the test. Speeds are in megabits per second (1 Mbps = 10^6 bits/s), the same convention used by speedtest.net and fast.com.

## Why we chose these methods
- **4 parallel streams:** one TCP connection can be capped by its window or a lost packet and read too low; several fill the link better, while staying under the browser's ~6 connections per host.
- **First 2 s excluded:** TCP slow start and the initial burst (buffers and mobile networks briefly run faster) do not represent the sustained rate, so we exclude them.
- **Stop when two 1 s windows agree within 5%:** saves data on fast links; the 5 s minimum and 10 s maximum avoid stopping too early or never stopping.
- **Median ping of 10 requests:** the first request is discarded to reduce the influence of connection setup and initial-request overhead, and the median ignores a single slow request.
- **Uncached data:** The server sends data with caching disabled, using a randomly generated 1 MB block. This prevents cached responses from artificially increasing the measured download speed.
- **`fetch` for download, XHR for upload:** `fetch` streams bytes and aborts instantly; only XHR reports upload progress.
- **Failed requests:** retried after 200 ms, and the test stops with an error after 5 failures.
