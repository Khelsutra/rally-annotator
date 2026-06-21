// Minimal static server for the E2E fixtures (no extra dependency). Serves the page +
// the WebM over http://localhost so the content script (matches <all_urls>) injects
// without needing file:// access. Supports HTTP Range requests — browsers require 206
// range responses to seek within a <video>.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const types = { ".html": "text/html", ".webm": "video/webm", ".js": "text/javascript" };
const port = Number(process.env.PORT || 5188);

http
  .createServer(async (req, res) => {
    try {
      const url = (req.url || "/").split("?")[0];
      const file = url === "/" ? "index.html" : url.replace(/^\//, "");
      const full = path.join(dir, file);
      const { size } = await stat(full);
      const ctype = types[path.extname(file)] || "application/octet-stream";
      const buf = await readFile(full);

      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        const start = m && m[1] ? parseInt(m[1], 10) : 0;
        const end = m && m[2] ? parseInt(m[2], 10) : size - 1;
        res.writeHead(206, {
          "content-type": ctype,
          "accept-ranges": "bytes",
          "content-range": `bytes ${start}-${end}/${size}`,
          "content-length": end - start + 1,
        });
        res.end(buf.subarray(start, end + 1));
        return;
      }
      res.writeHead(200, { "content-type": ctype, "accept-ranges": "bytes", "content-length": size });
      res.end(buf);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  })
  .listen(port, () => console.log(`fixture server on http://localhost:${port}`));
