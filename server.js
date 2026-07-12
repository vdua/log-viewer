const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON body parsing with large limit for HAR files
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Resolve default application path from environment variable
const DEFAULT_APP_PATH = process.env.DEFAULT_APP ? path.resolve(process.env.DEFAULT_APP) : (process.env.LOGS_DIR ? path.resolve(process.env.LOGS_DIR) : __dirname);
const CONFIG_FILE = path.join(__dirname, 'apps-config.json');

// Load configurations
function loadConfig() {
  let data = {
    apps: [DEFAULT_APP_PATH],
    activeApp: DEFAULT_APP_PATH
  };

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.apps) && parsed.activeApp) {
        data = parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load apps config, using defaults:', err);
  }

  // Ensure default path is always in the list
  if (!data.apps.includes(DEFAULT_APP_PATH)) {
    data.apps.unshift(DEFAULT_APP_PATH);
  }
  
  // Make sure activeApp is valid
  if (!data.apps.includes(data.activeApp)) {
    data.activeApp = DEFAULT_APP_PATH;
  }

  return data;
}

function saveConfig(data) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save apps config:', err);
  }
}

let config = loadConfig();

function getActiveLogsDir() {
  const activeApp = config.activeApp;
  const targetDir = path.join(activeApp, 'code', 'test', 'integration', 'logs');
  if (fs.existsSync(targetDir)) {
    try {
      const stat = fs.statSync(targetDir);
      if (stat.isDirectory()) {
        return targetDir;
      }
    } catch (e) {
      // Ignore
    }
  }
  return activeApp;
}

console.log(`Initial active logs directory resolved to: ${getActiveLogsDir()}`);

// Serve static files from the public folder (always relative to codebase location)
app.use(express.static(path.join(__dirname, 'public')));

// Serve static files from active logs directory (to access screenshots and other raw files dynamically)
app.use('/logs-static', (req, res, next) => {
  const activeLogsDir = getActiveLogsDir();
  express.static(activeLogsDir)(req, res, next);
});

// Helper: Check if directory contains the required files inside active logs directory
function isValidLogDir(dirName) {
  const activeLogsDir = getActiveLogsDir();
  const dirPath = path.join(activeLogsDir, dirName);
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

// Helper: Check if it is a flat log file session
function isFlatFileSession(sessionName) {
  const activeLogsDir = getActiveLogsDir();
  const filePath = path.join(activeLogsDir, `${sessionName}-api.json`);
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile();
  } catch (err) {
    return false;
  }
}

// --- APPLICATION WORKSPACE ENDPOINTS ---

// Endpoint: Get list of applications and active application
app.get('/api/apps', (req, res) => {
  res.json({
    apps: config.apps,
    activeApp: config.activeApp,
    activeLogsDir: getActiveLogsDir()
  });
});

// Endpoint: Add an application path
app.post('/api/apps', (req, res) => {
  const { path: appPath } = req.body;
  if (!appPath) {
    return res.status(400).json({ error: 'Application path is required' });
  }

  const resolvedPath = path.resolve(appPath);
  try {
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Specified path is not a directory' });
    }
  } catch (err) {
    return res.status(400).json({ error: 'Directory does not exist or is inaccessible' });
  }

  if (!config.apps.includes(resolvedPath)) {
    config.apps.push(resolvedPath);
  }
  config.activeApp = resolvedPath;
  saveConfig(config);

  res.json({
    success: true,
    apps: config.apps,
    activeApp: config.activeApp,
    activeLogsDir: getActiveLogsDir()
  });
});

// Endpoint: Set active application
app.post('/api/apps/active', (req, res) => {
  const { path: appPath } = req.body;
  if (!appPath) {
    return res.status(400).json({ error: 'Application path is required' });
  }

  const resolvedPath = path.resolve(appPath);
  if (!config.apps.includes(resolvedPath)) {
    return res.status(400).json({ error: 'Application path is not registered' });
  }

  config.activeApp = resolvedPath;
  saveConfig(config);

  res.json({
    success: true,
    apps: config.apps,
    activeApp: config.activeApp,
    activeLogsDir: getActiveLogsDir()
  });
});

// Endpoint: Remove an application from the list
app.delete('/api/apps', (req, res) => {
  const { path: appPath } = req.body;
  if (!appPath) {
    return res.status(400).json({ error: 'Application path is required' });
  }

  const resolvedPath = path.resolve(appPath);
  const defaultPath = process.env.DEFAULT_APP ? path.resolve(process.env.DEFAULT_APP) : (process.env.LOGS_DIR ? path.resolve(process.env.LOGS_DIR) : __dirname);
  
  if (resolvedPath === defaultPath) {
    return res.status(400).json({ error: 'Cannot remove the default application' });
  }

  config.apps = config.apps.filter(app => app !== resolvedPath);
  
  if (config.activeApp === resolvedPath) {
    config.activeApp = defaultPath;
  }
  
  saveConfig(config);

  res.json({
    success: true,
    apps: config.apps,
    activeApp: config.activeApp,
    activeLogsDir: getActiveLogsDir()
  });
});


// --- LOG SESSION ENDPOINTS ---

// Endpoint: List all log directories and flat files
app.get('/api/logs', (req, res) => {
  try {
    const activeLogsDir = getActiveLogsDir();
    
    // Check if the directory exists; if not, return empty array to prevent throwing errors
    if (!fs.existsSync(activeLogsDir)) {
      return res.json([]);
    }

    const files = fs.readdirSync(activeLogsDir);
    const logDirs = [];

    // 1. Scan directory-based log sessions
    for (const file of files) {
      if (isValidLogDir(file)) {
        const dirPath = path.join(activeLogsDir, file);
        const stats = fs.statSync(dirPath);
        
        // Get sizes of the log files
        const ndjsonSize = fs.statSync(path.join(dirPath, 'index.ndjson')).size;
        const bodiesSize = fs.statSync(path.join(dirPath, 'bodies.json')).size;
        
        // Count total APIs in index.ndjson
        const content = fs.readFileSync(path.join(dirPath, 'index.ndjson'), 'utf8');
        const totalApis = content.split('\n').filter(line => line.trim().length > 0).length;

        logDirs.push({
          name: file,
          isFlatFile: false,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
          totalApis,
          sizeBytes: ndjsonSize + bodiesSize
        });
      }
    }

    // 2. Scan flat file-based log sessions (*-api.json)
    for (const file of files) {
      if (file.endsWith('-api.json') && !file.startsWith('.')) {
        const filePath = path.join(activeLogsDir, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          const sessionName = file.slice(0, -9); // remove '-api.json'
          
          let totalApis = 0;
          let sizeBytes = stats.size;
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            if (Array.isArray(data)) {
              totalApis = data.length;
            }
          } catch (e) {
            console.error(`Error parsing flat log file ${file}:`, e);
          }

          // Count error files and add sizes
          const errFiles = files.filter(f => f.startsWith(`${sessionName}-err-`) && f.endsWith('.json'));
          totalApis += errFiles.length;
          for (const errFile of errFiles) {
            sizeBytes += fs.statSync(path.join(activeLogsDir, errFile)).size;
            const pngFile = errFile.slice(0, -4) + 'png';
            if (fs.existsSync(path.join(activeLogsDir, pngFile))) {
              sizeBytes += fs.statSync(path.join(activeLogsDir, pngFile)).size;
            }
          }

          logDirs.push({
            name: sessionName,
            isFlatFile: true,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
            totalApis,
            sizeBytes: sizeBytes
          });
        }
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

// Endpoint: Import a HAR file as a log session
app.post('/api/logs/import-har', (req, res) => {
  try {
    const { filename, harData } = req.body;
    if (!harData || !harData.log || !Array.isArray(harData.log.entries)) {
      return res.status(400).json({ error: 'Invalid HAR data structure' });
    }

    const entries = harData.log.entries;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    
    // Create safe session name
    const sanitizedFilename = (filename || 'import')
      .replace(/\.har$/i, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 30);
    const sessionName = `${sanitizedFilename}-${timestamp}`;

    const activeLogsDir = getActiveLogsDir();
    const dirPath = path.join(activeLogsDir, sessionName);

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const indexLines = [];
    const bodiesObj = {};
    let index = 1;

    for (const entry of entries) {
      const request = entry.request;
      const response = entry.response;
      if (!request || !response) continue;

      let urlPath = '';
      try {
        const parsedUrl = new URL(request.url);
        urlPath = parsedUrl.pathname + parsedUrl.search;
      } catch (e) {
        urlPath = request.url || '/unknown-url';
      }

      const method = request.method || 'GET';
      const status = response.status || 200;

      // Extract request body
      let reqBody = null;
      if (request.postData && request.postData.text) {
        try {
          reqBody = JSON.parse(request.postData.text);
        } catch (e) {
          reqBody = request.postData.text;
        }
      }

      // Extract response body
      let resBody = null;
      if (response.content && response.content.text) {
        try {
          resBody = JSON.parse(response.content.text);
        } catch (e) {
          resBody = response.content.text;
        }
      }

      bodiesObj[String(index)] = {
        req: reqBody,
        res: resBody
      };

      // Format description/extraInfo column
      let extraInfo = 'HAR-Import';
      const reqPayload = reqBody?.RequestPayload || reqBody;
      const resPayload = resBody;

      // Try to find mobile number
      const mobile = reqPayload?.leadProfile?.mobileNumber || reqPayload?.formData?.mobileNumber;
      if (mobile) {
        extraInfo += ` | Mobile: ${mobile}`;
      }

      // Try to find state safely
      const resJourneyStateInfo = resPayload?.formData?.journeyStateInfo;
      const stateVal = reqPayload?.formData?.journeyStateInfo?.[0]?.state || 
                       resPayload?.formData?.journeyStateInfo?.[0]?.state ||
                       (Array.isArray(resJourneyStateInfo) && resJourneyStateInfo.length > 0 ? resJourneyStateInfo[resJourneyStateInfo.length - 1]?.state : null);
      if (stateVal) {
        extraInfo += ` | State: ${stateVal}`;
      }

      indexLines.push(`${index} ${method} ${urlPath} ${status} ${extraInfo}`);
      index++;
    }

    fs.writeFileSync(path.join(dirPath, 'index.ndjson'), indexLines.join('\n') + '\n', 'utf8');
    fs.writeFileSync(path.join(dirPath, 'bodies.json'), JSON.stringify(bodiesObj, null, 2), 'utf8');

    res.json({
      success: true,
      sessionName,
      totalApis: index - 1
    });
  } catch (err) {
    console.error('Error importing HAR file:', err);
    res.status(500).json({ error: 'Failed to import HAR file: ' + err.message });
  }
});

// Endpoint: Get parsed API index for a folder or flat file session
app.get('/api/logs/:folder/apis', (req, res) => {
  const { folder } = req.params;
  const activeLogsDir = getActiveLogsDir();
  
  if (isFlatFileSession(folder)) {
    try {
      const filePath = path.join(activeLogsDir, `${folder}-api.json`);
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      const apis = [];

      let index = 1;
      if (Array.isArray(data)) {
        for (const item of data) {
          apis.push({
            id: index++,
            method: "POST", // Mock backend requests are typically POST
            path: item.ep || "API Call",
            status: item.status || 200,
            scenario: item.fields ? Object.entries(item.fields).map(([k, v]) => `${k}=${v}`).join(', ') : ''
          });
        }
      }

      // Check for any associated error JSON files and append as error API calls
      const files = fs.readdirSync(activeLogsDir);
      const errFiles = files.filter(f => f.startsWith(`${folder}-err-`) && f.endsWith('.json'));
      for (const errFile of errFiles) {
        try {
          const errFilePath = path.join(activeLogsDir, errFile);
          const errContent = fs.readFileSync(errFilePath, 'utf8');
          const errData = JSON.parse(errContent);
          
          apis.push({
            id: index++,
            method: "ERROR",
            path: errData.screen ? `ERR@${errData.screen}` : "ERR@unknown",
            status: 500,
            scenario: errData.trail ? errData.trail[errData.trail.length - 1] : "Test failed"
          });
        } catch (e) {
          console.error(`Error reading error log ${errFile}:`, e);
        }
      }

      return res.json(apis);
    } catch (err) {
      console.error(`Error reading flat log apis for ${folder}:`, err);
      return res.status(500).json({ error: 'Failed to retrieve API index' });
    }
  }

  if (!isValidLogDir(folder)) {
    return res.status(400).json({ error: 'Invalid or inaccessible log directory' });
  }

  try {
    const ndjsonPath = path.join(activeLogsDir, folder, 'index.ndjson');
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

// Endpoint: Get full request/response bodies for a folder or flat file session
app.get('/api/logs/:folder/bodies', (req, res) => {
  const { folder } = req.params;
  const activeLogsDir = getActiveLogsDir();

  if (isFlatFileSession(folder)) {
    try {
      const filePath = path.join(activeLogsDir, `${folder}-api.json`);
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      const bodies = {};

      let index = 1;
      if (Array.isArray(data)) {
        for (const item of data) {
          bodies[index++] = {
            req: {
              endpoint: item.ep,
              status: item.status
            },
            res: item.fields || {}
          };
        }
      }

      // Check for any associated error JSON files and capture their payloads & screenshots
      const files = fs.readdirSync(activeLogsDir);
      const errFiles = files.filter(f => f.startsWith(`${folder}-err-`) && f.endsWith('.json'));
      for (const errFile of errFiles) {
        try {
          const errFilePath = path.join(activeLogsDir, errFile);
          const errContent = fs.readFileSync(errFilePath, 'utf8');
          const errData = JSON.parse(errContent);
          
          const pngFile = errFile.slice(0, -4) + 'png';
          const screenshotUrl = fs.existsSync(path.join(activeLogsDir, pngFile)) ? `/logs-static/${pngFile}` : null;

          bodies[index++] = {
            req: errData,
            res: {
              error: errData.trail ? errData.trail[errData.trail.length - 1] : "Test failed",
              screenshot: screenshotUrl
            }
          };
        } catch (e) {
          console.error(`Error reading error body for ${errFile}:`, e);
        }
      }

      return res.json(bodies);
    } catch (err) {
      console.error(`Error reading flat log bodies for ${folder}:`, err);
      return res.status(500).json({ error: 'Failed to retrieve payloads' });
    }
  }

  if (!isValidLogDir(folder)) {
    return res.status(400).json({ error: 'Invalid or inaccessible log directory' });
  }

  try {
    const bodiesPath = path.join(activeLogsDir, folder, 'bodies.json');
    const content = fs.readFileSync(bodiesPath, 'utf8');
    const bodies = JSON.parse(content);
    res.json(bodies);
  } catch (err) {
    console.error(`Error reading bodies.json for ${folder}:`, err);
    res.status(500).json({ error: 'Failed to retrieve payloads' });
  }
});

// Endpoint: Delete a specific log session (folder or flat files)
app.delete('/api/logs/:folder', (req, res) => {
  const { folder } = req.params;
  const activeLogsDir = getActiveLogsDir();
  try {
    if (isFlatFileSession(folder)) {
      const apiFile = path.join(activeLogsDir, `${folder}-api.json`);
      if (fs.existsSync(apiFile)) {
        fs.unlinkSync(apiFile);
      }
      
      const files = fs.readdirSync(activeLogsDir);
      const associatedFiles = files.filter(f => f.startsWith(`${folder}-err-`) && (f.endsWith('.json') || f.endsWith('.png')));
      for (const file of associatedFiles) {
        fs.unlinkSync(path.join(activeLogsDir, file));
      }
      
      return res.json({ success: true, message: `Session ${folder} deleted successfully` });
    }

    if (isValidLogDir(folder)) {
      const dirPath = path.join(activeLogsDir, folder);
      fs.rmSync(dirPath, { recursive: true, force: true });
      return res.json({ success: true, message: `Directory ${folder} deleted successfully` });
    }

    return res.status(404).json({ error: 'Log session not found' });
  } catch (err) {
    console.error(`Error deleting log session ${folder}:`, err);
    res.status(500).json({ error: 'Failed to delete log session' });
  }
});

// Endpoint: Delete all log sessions (both directory-based and flat files)
app.delete('/api/logs', (req, res) => {
  const activeLogsDir = getActiveLogsDir();
  try {
    if (!fs.existsSync(activeLogsDir)) {
      return res.json({ success: true, message: 'Log directory does not exist' });
    }

    const files = fs.readdirSync(activeLogsDir);
    let deletedCount = 0;

    for (const file of files) {
      if (isValidLogDir(file)) {
        const dirPath = path.join(activeLogsDir, file);
        fs.rmSync(dirPath, { recursive: true, force: true });
        deletedCount++;
      }
      else if (file.endsWith('-api.json') && !file.startsWith('.')) {
        const filePath = path.join(activeLogsDir, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          const sessionName = file.slice(0, -9);
          fs.unlinkSync(filePath);
          
          const assocFiles = files.filter(f => f.startsWith(`${sessionName}-err-`) && (f.endsWith('.json') || f.endsWith('.png')));
          for (const assocFile of assocFiles) {
            const assocPath = path.join(activeLogsDir, assocFile);
            if (fs.existsSync(assocPath)) {
              fs.unlinkSync(assocPath);
            }
          }
          deletedCount++;
        }
      }
    }

    res.json({ success: true, message: `Successfully deleted ${deletedCount} log sessions` });
  } catch (err) {
    console.error('Error deleting all log sessions:', err);
    res.status(500).json({ error: 'Failed to delete all log sessions' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
