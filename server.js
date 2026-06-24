const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Resolve the log directory from environment variable or fallback to current directory
const LOGS_DIR = process.env.LOGS_DIR ? path.resolve(process.env.LOGS_DIR) : __dirname;
console.log(`Logs directory configured as: ${LOGS_DIR}`);

// Serve static files from the public folder (always relative to codebase location)
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Check if directory contains the required files inside LOGS_DIR
function isValidLogDir(dirName) {
  const dirPath = path.join(LOGS_DIR, dirName);
  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return false;
    
    // Ignore node_modules, git, and hidden directories
    if (dirName === 'node_modules' || dirName.startsWith('.')) return false;
    
    return fs.existsSync(path.join(dirPath, 'index.ndjson')) &&
           fs.existsSync(path.join(dirPath, 'bodies.json'));
  } catch (err) {
    return false;
  }
}

// Endpoint: List all log directories
app.get('/api/logs', (req, res) => {
  try {
    const files = fs.readdirSync(LOGS_DIR);
    const logDirs = [];

    for (const file of files) {
      if (isValidLogDir(file)) {
        const dirPath = path.join(LOGS_DIR, file);
        const stats = fs.statSync(dirPath);
        
        // Get sizes of the log files
        const ndjsonSize = fs.statSync(path.join(dirPath, 'index.ndjson')).size;
        const bodiesSize = fs.statSync(path.join(dirPath, 'bodies.json')).size;
        
        // Count total APIs in index.ndjson
        const content = fs.readFileSync(path.join(dirPath, 'index.ndjson'), 'utf8');
        const totalApis = content.split('\n').filter(line => line.trim().length > 0).length;

        logDirs.push({
          name: file,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
          totalApis,
          sizeBytes: ndjsonSize + bodiesSize
        });
      }
    }

    // Sort by creation time descending (most recent first)
    logDirs.sort((a, b) => b.createdAt - a.createdAt);

    res.json(logDirs);
  } catch (err) {
    console.error('Error listing log directories:', err);
    res.status(500).json({ error: 'Failed to read log directories' });
  }
});

// Endpoint: Get parsed API index for a folder
app.get('/api/logs/:folder/apis', (req, res) => {
  const { folder } = req.params;
  
  if (!isValidLogDir(folder)) {
    return res.status(400).json({ error: 'Invalid or inaccessible log directory' });
  }

  try {
    const ndjsonPath = path.join(LOGS_DIR, folder, 'index.ndjson');
    const content = fs.readFileSync(ndjsonPath, 'utf8');
    const lines = content.split('\n');
    const apis = [];

    // Parse lines like: "1 POST /content/hdfc_customerinfo/api/login.json 200 XPL-663..."
    // Pattern: index method path status scenario
    const regex = /^(\d+)\s+([A-Z]+)\s+(\S+)\s+(\d+)\s+(.*)$/;

    for (const line of lines) {
      if (!line.trim()) continue;
      const match = line.match(regex);
      if (match) {
        apis.push({
          id: parseInt(match[1], 10),
          method: match[2],
          path: match[3],
          status: parseInt(match[4], 10),
          scenario: match[5].trim()
        });
      } else {
        // Fallback for lines that don't match the strict regex
        const parts = line.split(/\s+/);
        if (parts.length >= 4) {
          apis.push({
            id: parseInt(parts[0], 10),
            method: parts[1],
            path: parts[2],
            status: parseInt(parts[3], 10),
            scenario: parts.slice(4).join(' ').trim()
          });
        }
      }
    }

    res.json(apis);
  } catch (err) {
    console.error(`Error reading index.ndjson for ${folder}:`, err);
    res.status(500).json({ error: 'Failed to retrieve API index' });
  }
});

// Endpoint: Get full request/response bodies for a folder
app.get('/api/logs/:folder/bodies', (req, res) => {
  const { folder } = req.params;

  if (!isValidLogDir(folder)) {
    return res.status(400).json({ error: 'Invalid or inaccessible log directory' });
  }

  try {
    const bodiesPath = path.join(LOGS_DIR, folder, 'bodies.json');
    const content = fs.readFileSync(bodiesPath, 'utf8');
    const bodies = JSON.parse(content);
    res.json(bodies);
  } catch (err) {
    console.error(`Error reading bodies.json for ${folder}:`, err);
    res.status(500).json({ error: 'Failed to retrieve payloads' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
