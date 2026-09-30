// Real Chrome DOM, events, and storage; isolated fixtures never open the learning platform.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run() {
    const chrome = process.env.CHROME_PATH || (process.platform === 'win32'
        ? path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')
        : '/usr/bin/google-chrome');
    assert.ok(fs.existsSync(chrome), 'Chrome missing; set CHROME_PATH');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'conch-browser-test-'));
    const server = http.createServer((_req, res) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><html><body><main id="fixture"></main></body></html>');
    });
    let child;
    let ws;
    let peerWs;
    let call;
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        child = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
            '--no-first-run', '--no-default-browser-check', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
        let launchError;
        child.on('error', error => { launchError = error; });
        const portFile = path.join(profile, 'DevToolsActivePort');
        const deadline = Date.now() + 15000;
        while (!fs.existsSync(portFile) && Date.now() < deadline && !launchError) await delay(100);
        if (launchError) throw launchError;
        assert.ok(fs.existsSync(portFile), 'Chrome debugging endpoint did not start');
        const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
        const base = 'http://127.0.0.1:' + port;
        const url = 'http://127.0.0.1:' + server.address().port + '/home/my/myTask';
        const target = await (await fetch(base + '/json/new?' + encodeURIComponent(url), { method: 'PUT' })).json();
        ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
        let sequence = 0;
        const pending = new Map();
        ws.onmessage = event => {
            const message = JSON.parse(event.data);
            const entry = pending.get(message.id);
            if (entry) { clearTimeout(entry.timeout); pending.delete(message.id); entry.resolve(message); }
        };
        call = (method, params = {}) => new Promise((resolve, reject) => {
            const id = ++sequence;
            const timeout = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 10000);
            pending.set(id, { resolve, timeout });
            ws.send(JSON.stringify({ id, method, params }));
        });
        const evaluate = async expression => {
            const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
            if (result.error || result.result.exceptionDetails) throw new Error(JSON.stringify(result.error || result.result.exceptionDetails));
            return result.result.result.value;
        };
        for (let tries = 0; tries < 50 && !await evaluate("!!document.getElementById('fixture')"); tries++) await delay(100);
        await evaluate(`document.getElementById('fixture').innerHTML = '<div class="group cursor-pointer" data-tp-id="11">地图一<br>学习地图 进行中</div><div class="group cursor-pointer" data-tp-id="12">地图二<br>学习地图 进行中</div>';document.querySelectorAll('[data-tp-id]').forEach(el=>{el.dataset.clicks='0';el.addEventListener('click',()=>{el.dataset.clicks=String(Number(el.dataset.clicks)+1);});});`);
        let source = fs.readFileSync(path.join(__dirname, 'pc.js'), 'utf8');
        source = source.replace('    setInterval(mainLoop, CONFIG.checkInterval);', '').replace('    setTimeout(mainLoop, 1000);', '');
        source = source.replace(/\}\)\(\);\s*$/, 'CONFIG.enableJitter=false;window.testApi={state,mainLoop,pauseAutomation,getTaskSelection,getSubVideoKey,getCurrentCourseId,switchToNextSubVideoOrCourse,handleMyTaskPage,saveTaskSelection,setConcurrencySetting};})();');
        await evaluate(source);
        await evaluate("testApi.mainLoop();document.getElementById('_kme_tool_host').shadowRoot.querySelectorAll('#jinpei-task-list input')[0].click()");
        assert.deepEqual(await evaluate('testApi.getTaskSelection().ids'), ['12']);
        await evaluate("document.getElementById('_kme_tool_host').shadowRoot.getElementById('jinpei-toggle-btn').click()");
        await delay(1300);
        assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('[data-tp-id]')).map(e=>Number(e.dataset.clicks))"), [0, 1]);
        await evaluate("testApi.pauseAutomation('test');history.pushState({},'', '/home/training/study/12');document.getElementById('fixture').innerHTML='<div id=\"first\" class=\"group cursor-pointer text-primary\" data-course-id=\"101\" data-chapter-id=\"21\">同名小节<br>00:01:00<svg data-icon=\"check\"></svg></div><div id=\"next\" class=\"group cursor-pointer\" data-course-id=\"101\" data-chapter-id=\"22\">同名小节<br>00:01:00</div>';window.nextClicks=0;document.getElementById('next').addEventListener('click',()=>nextClicks++);testApi.state.enabled=true");
        await evaluate('testApi.state.enabled=false;testApi.mainLoop()');
        assert.deepEqual(await evaluate("(()=>{const r=document.getElementById('_kme_tool_host').shadowRoot;return {visible:r.getElementById('jinpei-task-selection').style.display,checks:Array.from(r.querySelectorAll('#jinpei-task-list input')).map(e=>e.checked)};})()"), { visible: 'block', checks: [false, true] });
        await evaluate("document.getElementById('_kme_tool_host').shadowRoot.querySelectorAll('#jinpei-task-list input')[0].click();testApi.state.enabled=true");
        assert.equal(await evaluate('testApi.getCurrentCourseId()'), '101');
        assert.notEqual(await evaluate("testApi.getSubVideoKey(document.getElementById('first'))"), await evaluate("testApi.getSubVideoKey(document.getElementById('next'))"));
        await evaluate('testApi.switchToNextSubVideoOrCourse()');
        assert.equal(await evaluate('nextClicks'), 1);
        await evaluate("testApi.pauseAutomation('test finished')");
        const taskFixture = `history.pushState({},'', '/home/my/myTask');document.getElementById('fixture').innerHTML='<div class="group cursor-pointer" data-tp-id="11">地图一<br>学习地图 进行中</div><div class="group cursor-pointer" data-tp-id="12">地图二<br>学习地图 进行中</div>';document.querySelectorAll('[data-tp-id]').forEach(el=>{el.dataset.clicks='0';el.addEventListener('click',()=>{el.dataset.clicks=String(Number(el.dataset.clicks)+1);});});`;
        await evaluate(taskFixture + "testApi.saveTaskSelection({mode:'all'});testApi.setConcurrencySetting(2)");
        const peer = await (await fetch(base + '/json/new?' + encodeURIComponent(url), { method: 'PUT' })).json();
        peerWs = new WebSocket(peer.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { peerWs.onopen = resolve; peerWs.onerror = reject; });
        let peerSequence = 0;
        const peerEvaluate = expression => new Promise((resolve, reject) => {
            const id = ++peerSequence;
            const timeout = setTimeout(() => reject(new Error('Peer CDP timeout')), 10000);
            peerWs.onmessage = event => {
                const result = JSON.parse(event.data);
                if (result.id !== id) return;
                clearTimeout(timeout);
                if (result.error || result.result.exceptionDetails) reject(new Error(JSON.stringify(result.error || result.result.exceptionDetails)));
                else resolve(result.result.result.value);
            };
            peerWs.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
        });
        for (let tries = 0; tries < 50 && !await peerEvaluate("!!document.getElementById('fixture')"); tries++) await delay(100);
        await peerEvaluate(taskFixture + source);
        await Promise.all([
            evaluate('testApi.state.enabled=true;testApi.handleMyTaskPage()'),
            peerEvaluate('testApi.state.enabled=true;testApi.handleMyTaskPage()'),
        ]);
        let assignments;
        const assignmentDeadline = Date.now() + 10000;
        do {
            assignments = await Promise.all([
                evaluate("Array.from(document.querySelectorAll('[data-tp-id]')).map(e=>Number(e.dataset.clicks))"),
                peerEvaluate("Array.from(document.querySelectorAll('[data-tp-id]')).map(e=>Number(e.dataset.clicks))"),
            ]);
            if (assignments.every(counts => counts.reduce((a, b) => a + b, 0) === 1)) break;
            await delay(200);
        } while (Date.now() < assignmentDeadline);
        if (assignments.some(counts => counts.reduce((a, b) => a + b, 0) !== 1)) {
            console.log('Scheduler diagnostics:', await evaluate('({url:location.href,state:testApi.state,selection:testApi.getTaskSelection()})'),
                await peerEvaluate('({url:location.href,state:testApi.state,selection:testApi.getTaskSelection()})'));
        }
        assert.deepEqual(assignments.sort((a, b) => b[0] - a[0]), [[1, 0], [0, 1]]);
        console.log('Chrome passed: task selector on all pages, single clicks, stable IDs, marked-section continuation, and cross-map scheduling with native Web Locks.');
    } finally {
        if (call && ws?.readyState === WebSocket.OPEN) await call('Browser.close').catch(() => {});
        ws?.close();
        peerWs?.close();
        if (child && child.exitCode === null) { await delay(500); if (child.exitCode === null) child.kill(); }
        server.closeAllConnections();
        server.close();
        // Delete only the profile this test created in the OS temp directory.
        assert.equal(path.dirname(profile), os.tmpdir());
        assert.ok(path.basename(profile).startsWith('conch-browser-test-'));
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
