const urlInput = document.getElementById('target-url');
const rtmpInput = document.getElementById('rtmp-url');
const keyInput = document.getElementById('stream-key');
const loadBtn = document.getElementById('load-btn');
const streamBtn = document.getElementById('stream-btn');
const statusText = document.getElementById('status-text');
const errorMsg = document.getElementById('error-msg');

let isStreaming = false;

loadBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (url) {
        window.electronAPI.loadURL(url);
    }
});

streamBtn.addEventListener('click', () => {
    if (!isStreaming) {
        const rtmpUrl = rtmpInput.value.trim();
        const streamKey = keyInput.value.trim();

        if (!rtmpUrl || !streamKey) {
            alert('Please enter both RTMP URL and Stream Key');
            return;
        }

        window.electronAPI.startStream({ rtmpUrl, streamKey });
    } else {
        window.electronAPI.stopStream();
    }
});

window.electronAPI.onStreamStatus((status, message) => {
    if (status === 'running') {
        isStreaming = true;
        streamBtn.textContent = 'Stop Stream';
        streamBtn.style.background = 'linear-gradient(135deg, #ff4d4d, #d40000)';
        statusText.textContent = 'Live Streaming';
        statusText.className = 'status-on';
        errorMsg.textContent = '';
    } else if (status === 'stopped' || status === 'error') {
        isStreaming = false;
        streamBtn.textContent = 'Start Stream';
        streamBtn.style.background = 'linear-gradient(135deg, #00f2ff, #00a2ff)';
        statusText.textContent = 'Offline';
        statusText.className = 'status-off';
        
        if (status === 'error' && message) {
            errorMsg.textContent = `Error: ${message}`;
            statusText.textContent = 'Stream Error';
            statusText.className = 'status-error';
        }
    }
});
