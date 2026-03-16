const { app, BrowserWindow, ipcMain, BrowserView } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

let mainWindow;
let streamView;
let ffmpegProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "PumpLive Streamer",
    backgroundColor: '#0a0a0a'
  });

  mainWindow.loadFile('index.html');

  // Create the BrowserView where the target website will be loaded
  streamView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.setBrowserView(streamView);
  
  const updateViewBounds = () => {
    const [width, height] = mainWindow.getContentSize();
    // Header is approx 150px, Footer is 40px
    streamView.setBounds({ x: 0, y: 151, width: width, height: height - 151 - 40 });
  };

  updateViewBounds();
  streamView.setAutoResize({ width: true, height: true });
  
  mainWindow.on('resize', updateViewBounds);
  
  // Load a default page
  streamView.webContents.loadURL('https://google.com');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers for UI interactions
ipcMain.on('load-url', (event, url) => {
  if (streamView) {
    streamView.webContents.loadURL(url);
  }
});

ipcMain.on('start-stream', async (event, { rtmpUrl, streamKey }) => {
  if (ffmpegProcess) return;

  const fullRtmpPath = `${rtmpUrl}/${streamKey}`;
  const { PassThrough } = require('stream');
  const streamInput = new PassThrough();
  
  ffmpegProcess = ffmpeg()
    .input(streamInput)
    .inputFormat('image2pipe')
    .inputOptions([
      '-framerate 20',
      '-probesize 32',
      '-analyzeduration 0'
    ])
    .output(fullRtmpPath)
    .outputOptions([
      '-c:v libx264',
      '-preset ultrafast',
      '-tune zerolatency',
      '-pix_fmt yuv420p',
      '-g 40',
      '-b:v 2000k',
      '-maxrate 2000k',
      '-bufsize 4000k',
      '-f flv',
      '-tls_verify 0',
      '-flvflags no_duration_filesize',
      '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2'
    ])
    .on('start', (commandLine) => {
      console.log('FFmpeg started with:', commandLine);
      event.reply('stream-status', 'running');
      startCaptureLoop();
    })
    .on('stderr', (stderrLine) => {
      if (stderrLine.includes('frame=') || stderrLine.includes('Error') || stderrLine.includes('failed') || stderrLine.includes('Connection')) {
        console.log('FFmpeg Log:', stderrLine.trim());
      }
    })
    .on('error', (err) => {
      console.error('FFmpeg error:', err.message);
      event.reply('stream-status', 'error', err.message);
      stopCaptureLoop();
      ffmpegProcess = null;
    })
    .on('end', () => {
      event.reply('stream-status', 'stopped');
      ffmpegProcess = null;
    });

  let isCapturing = false;
  let captureInterval;
  let frameCount = 0;

  function startCaptureLoop() {
    if (isCapturing) return;
    isCapturing = true;
    frameCount = 0;
    
    captureInterval = setInterval(async () => {
      if (!isCapturing || !ffmpegProcess || !streamInput.writable) return;
      
      try {
        if (streamView.webContents.isDestroyed()) {
          stopCaptureLoop();
          return;
        }
        
        const image = await streamView.webContents.capturePage().catch(err => {
          console.error('Capture page task failed:', err);
          return null;
        });

        if (image && !image.isEmpty()) {
          const buffer = image.toPNG(); // PNG is preferred by image2pipe
          if (streamInput.writable) {
            streamInput.write(buffer);
            frameCount++;
            if (frameCount % 20 === 0) {
              console.log(`Backend: Captured and piped ${frameCount} frames`);
            }
          }
        }
      } catch (e) {
        console.error('Capture loop exception:', e);
      }
    }, 50); // ~20 FPS
  }

  function stopCaptureLoop() {
    isCapturing = false;
    if (captureInterval) {
      clearInterval(captureInterval);
      captureInterval = null;
    }
    if (streamInput && !streamInput.destroyed) {
      streamInput.end();
    }
  }

  ffmpegProcess.run();

  ipcMain.once('stop-stream', () => {
    stopCaptureLoop();
    if (ffmpegProcess) {
      ffmpegProcess.kill('SIGINT');
    }
  });
});
