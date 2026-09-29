const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createLockManager() {
    const queues = new Map();
    return {
        async query() { return { held: [...queues.keys()].map(name => ({ name })), pending: [] }; },
        request(name, options, callback) {
            if (typeof options === 'function') { callback = options; options = {}; }
            if (options.ifAvailable && queues.has(name)) return Promise.resolve().then(() => callback(null));
            return new Promise((resolve, reject) => {
                const queue = queues.get(name) || [];
                queues.set(name, queue);
                queue.push({ callback, resolve, reject });
                if (queue.length === 1) run();
                function run() {
                    const item = queue[0];
                    Promise.resolve().then(() => item.callback({ name })).then(item.resolve, item.reject).finally(() => {
                        queue.shift();
                        if (queue.length) run(); else queues.delete(name);
                    });
                }
            });
        }
    };
}

function setup(initialStorage = [], initialLocalStorage = [], shared = {}) {
    let now = 0;
    let nextTimer = 0;
    const timers = new Map();
    const storage = new Map([['jinpei_auto_running', 'true'], ...initialStorage]);
    const localStorageMap = shared.storage || new Map([...initialLocalStorage]);
    const openedUrls = [];
    const video = { paused: false, muted: true, playbackRate: 1, currentTime: 0, duration: 100, ended: false,
        plays: 0, pause() { this.paused = true; }, play() { this.plays++; this.paused = false; this.ended = false; return Promise.resolve(); } };
    const current = { completed: false, className: 'text-primary', innerText: '当前小节\n00:01:40',
        querySelector(selector) { return selector === '[title], .truncate' ? { innerText: '当前小节' } : (this.completed ? {} : null); } };
    const next = { ...current, className: '', clicks: 0, click() { this.clicks++; } };
    const fixture = { video, items: [current, next], courses: [], catalogClicks: 0 };
    const hud = new Map();
    const catalog = { innerText: '学习目录', children: [], closest() { return { click() { fixture.catalogClicks++; } }; } };
    class Document {
        get hidden() { return true; }
        get visibilityState() { return 'hidden'; }
        get webkitVisibilityState() { return 'hidden'; }
        addEventListener() {}
        getElementById(id) {
            if (!hud.has(id)) hud.set(id, { style: {}, innerText: '', addEventListener() {}, title: '' });
            return hud.get(id);
        }
        querySelector(selector) { return selector === 'video' ? fixture.video : null; }
        querySelectorAll(selector) {
            if (selector.startsWith('div.group.cursor-pointer,')) return fixture.items;
            if (selector.startsWith('[class*="panelContent"]')) return fixture.courses;
            if (selector === 'li, div, span, button') return [catalog];
            return [];
        }
    }
    const context = {
        Document, document: new Document(), window: {
            addEventListener() {},
            open(url) { openedUrls.push(url); return { closed: false }; },
            close() { this.closed = true; },
            closed: false
        },
        location: { href: 'https://pc.kmelearning.com/home/training/study/1', reloads: 0, reload() { this.reloads++; } },
        sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        navigator: { locks: shared.locks || createLockManager() },
        localStorage: { get length() { return localStorageMap.size; }, key: index => [...localStorageMap.keys()][index] ?? null, getItem: key => localStorageMap.get(key) ?? null, setItem: (key, value) => localStorageMap.set(key, value), removeItem: key => localStorageMap.delete(key) },
        console: { log() {}, warn() {}, error() {} }, Date: { now: () => now },
        setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; },
        clearTimeout(id) { timers.delete(id); }, setInterval() {},
    };
    vm.createContext(context);
    const source = fs.readFileSync(path.join(__dirname, 'pc.js'), 'utf8');
    vm.runInContext(source.replace(/\}\)\(\);\s*$/, 'CONFIG.enableJitter = false; window.testApi = { state, switchToNextSubVideoOrCourse, mainLoop, pauseAutomation, calculateCourseTotalProgress, detectCourseExam, getHandledCourses, markCourseHandled, isCourseHandled, getHandledMaps, markMapHandled, getCourseItems, autoDismissDialogs, updateHUD, simulateHumanClick, randomBetween, setManagedTimeout, STORAGE_KEYS, getStorageItem, setStorageItem, removeStorageItem, CONFIG, checkWatchdog, getWatchdogState, setWatchdogState, clearWatchdogState, markSubVideoFailed, isSubVideoFailed, getFailedSubVideos, watchdogRuntime, getConcurrencySetting, setConcurrencySetting, getActiveTabs, registerTabHeartbeat, unregisterTab, getCurrentlyActiveCourses, isCourseBusyByOtherTab, tryClaimCourseSlot, TAB_ID }; })();'), context);
    timers.clear(); // 初始化主循环由测试显式调用。
    function advance(ms) {
        const end = now + ms;
        while (true) {
            const pending = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!pending) break;
            timers.delete(pending[0]); now = pending[1].at; pending[1].fn();
        }
        now = end;
    }
    return { ...context.window.testApi, context, fixture, current, next, advance, timers, storage, localStorageMap, openedUrls };
}

const settleLocks = () => new Promise(resolve => setImmediate(resolve));
function twoWindows(concurrency = 2) {
    const shared = { storage: new Map(), locks: createLockManager() };
    const a = setup([], [], shared);
    const b = setup([], [], shared);
    a.setConcurrencySetting(concurrency);
    return { a, b, shared };
}

test('两个窗口同时领取同一课程，只有一个成功', async () => {
    const { a, b } = twoWindows();
    const results = await Promise.all([
        a.tryClaimCourseSlot('c1', '课程一', '1'),
        b.tryClaimCourseSlot('c1', '课程一', '1'),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(Object.keys(a.getActiveTabs()).length, 1);
});

test('不同课程同时领取，独立心跳互不覆盖，暂停仅删除自己的记录', async () => {
    const { a, b } = twoWindows();
    assert.deepEqual(await Promise.all([
        a.tryClaimCourseSlot('c1', '课程一', '1'),
        b.tryClaimCourseSlot('c2', '课程二', '1'),
    ]), [true, true]);
    a.registerTabHeartbeat('错误的路由ID', '课程一', '1');
    b.registerTabHeartbeat('c2', '课程二', '1');
    assert.equal(a.getActiveTabs()[a.TAB_ID].courseKey, 'c1');
    assert.equal(Object.keys(a.getActiveTabs()).length, 2);
    a.pauseAutomation('手动暂停');
    assert.equal(Object.keys(b.getActiveTabs()).length, 1);
    assert.equal(b.getActiveTabs()[b.TAB_ID].courseKey, 'c2');
    await settleLocks();
    assert.equal(await a.tryClaimCourseSlot('c1', '课程一', '1'), false);
});

test('心跳过期仍持有课程锁，退出释放后其他窗口才能领取', async () => {
    const { a, b } = twoWindows();
    assert.equal(await a.tryClaimCourseSlot('c1', '课程一', '1'), true);
    a.advance(121000); b.advance(121000);
    assert.equal(Object.keys(b.getActiveTabs()).length, 0);
    assert.equal(await b.tryClaimCourseSlot('c1', '课程一', '1'), false);
    a.unregisterTab();
    await settleLocks();
    assert.equal(await b.tryClaimCourseSlot('c1', '课程一', '1'), true);
});

test('冻结窗口心跳过期也不能突破并发上限', async () => {
    const { a, b } = twoWindows(1);
    assert.equal(await a.tryClaimCourseSlot('c1', '课程一', '1'), true);
    a.advance(121000); b.advance(121000);
    assert.equal(await b.tryClaimCourseSlot('c2', '课程二', '1'), false);
    a.unregisterTab(); await settleLocks();
    assert.equal(await b.tryClaimCourseSlot('c2', '课程二', '1'), true);
});

test('领取等待期间暂停或跳转，不留下课程锁和占用记录', async () => {
    for (const navigate of [false, true]) {
        const { a, b } = twoWindows();
        const pending = a.tryClaimCourseSlot('c1', '课程一', '1');
        if (navigate) a.context.location.href += '?changed=1';
        else a.pauseAutomation('手动暂停');
        assert.equal(await pending, false);
        assert.equal(Object.keys(b.getActiveTabs()).length, 0);
        assert.equal(await b.tryClaimCourseSlot('c1', '课程一', '1'), true);
    }
});

test('不支持锁或存储不可写时安全暂停，不点击课程、不恢复播放', async () => {
    for (const unavailableLocks of [false, true]) {
        const t = setup();
        t.fixture.video.paused = true;
        if (unavailableLocks) delete t.context.navigator.locks;
        else t.context.localStorage.setItem = () => { throw new Error('quota exceeded'); };
        await t.mainLoop();
        assert.equal(t.state.enabled, false);
        assert.equal(t.fixture.video.plays, 0);
        assert.equal(t.next.clicks, 0);
        assert.equal(Object.keys(t.getActiveTabs()).length, 0);
    }
});

test('两个目录同时调度，分别进入不同课程；重复轮询不会重复领取或点击', async () => {
    const { a, b } = twoWindows();
    function courses() {
        return ['课程一', '课程二'].map(name => ({
            innerText: name + '\n2学时', children: [], offsetParent: {}, clicks: 0,
            click() { this.clicks++; },
        }));
    }
    a.fixture.video = null; b.fixture.video = null;
    a.fixture.courses = courses(); b.fixture.courses = courses();
    const first = a.mainLoop();
    await Promise.all([first, a.mainLoop(), b.mainLoop()]);
    a.advance(1000); b.advance(1000);
    assert.notEqual(a.state.currentCourse, b.state.currentCourse);
    assert.equal(a.fixture.courses.reduce((n, c) => n + c.clicks, 0), 1);
    assert.equal(b.fixture.courses.reduce((n, c) => n + c.clicks, 0), 1);
    assert.equal(Object.keys(a.getActiveTabs()).length, 2);
});

test('直接进入已被占用的播放器时暂停，防止绕过目录领取', async () => {
    const { a, b } = twoWindows();
    a.state.currentCourse = '课程一'; b.state.currentCourse = '课程一';
    assert.equal(await a.tryClaimCourseSlot('c1', '课程一', '1'), true);
    await b.mainLoop();
    assert.equal(b.state.enabled, false);
    assert.equal(b.fixture.video.paused, true);
    assert.equal(a.getActiveTabs()[a.TAB_ID].courseKey, 'c1');
});

test('课程全部完成后释放课程锁与名额', async () => {
    const { a, b } = twoWindows(1);
    assert.equal(await a.tryClaimCourseSlot('c1', '课程一', '1'), true);
    a.fixture.items = [a.current]; a.current.completed = true;
    a.switchToNextSubVideoOrCourse();
    await settleLocks();
    assert.equal(await b.tryClaimCourseSlot('c2', '课程二', '1'), true);
});

test('降低并发数后，冻结窗口仍占用名额，不能新开课程', async () => {
    const { a, b, shared } = twoWindows(2);
    const c = setup([], [], shared);
    assert.equal(await a.tryClaimCourseSlot('c1', '课程一', '1'), true);
    assert.equal(await b.tryClaimCourseSlot('c2', '课程二', '1'), true);
    a.unregisterTab(); await settleLocks();
    c.setConcurrencySetting(1);
    b.advance(121000); c.advance(121000);
    assert.equal(await c.tryClaimCourseSlot('c3', '课程三', '1'), false);
});

test('同步超时重播末尾30秒，重播3次仍未打勾才暂停', async () => {
    const t = setup();
    for (let attempt = 1; attempt <= 3; attempt++) {
        t.fixture.video.currentTime = 100; t.fixture.video.ended = true;
        await t.mainLoop(); t.advance(16500); await new Promise(resolve => setImmediate(resolve));
        assert.equal(t.state.enabled, true);
        assert.equal(t.state.isSwitching, false);
        assert.equal(t.fixture.video.currentTime, 70);
        assert.equal(t.fixture.video.plays, attempt);
    }
    t.fixture.video.currentTime = 100; t.fixture.video.ended = true;
    await t.mainLoop(); t.advance(16500); await new Promise(resolve => setImmediate(resolve));
    assert.equal(t.next.clicks, 0);
    assert.equal(t.state.enabled, false);
    assert.equal(t.fixture.video.paused, true);
    assert.equal(t.storage.has('jinpei_auto_running'), false);
    assert.equal(t.timers.size, 0);
    assert.equal(t.fixture.video.plays, 3);
    assert.match(t.context.document.getElementById('jinpei-hud-status').innerText, /重播 3 次后仍未打勾/);
});

test('结束后进度归零仍从末尾30秒重播，打勾后清除次数并切换', async () => {
    const t = setup();
    t.switchToNextSubVideoOrCourse(); t.advance(12500); await new Promise(resolve => setImmediate(resolve));
    assert.equal(t.fixture.video.currentTime, 70);
    t.current.completed = true;
    t.switchToNextSubVideoOrCourse();
    assert.equal(t.next.clicks, 1);
    assert.equal(t.storage.has(t.STORAGE_KEYS.completionReplay), false);
});

test('短视频从零重播，未知时长安全暂停', async () => {
    const short = setup(); short.fixture.video.duration = 15;
    short.switchToNextSubVideoOrCourse(); short.advance(12500); await new Promise(resolve => setImmediate(resolve));
    assert.equal(short.fixture.video.currentTime, 0);
    assert.equal(short.fixture.video.plays, 1);
    for (const duration of [NaN, Infinity, 0]) {
        const t = setup(); t.fixture.video.duration = duration;
        t.switchToNextSubVideoOrCourse(); t.advance(12500); await new Promise(resolve => setImmediate(resolve));
        assert.equal(t.state.enabled, false);
        assert.equal(t.next.clicks, 0);
    }
});

test('刷新后保留重播次数，不开始第4次重播', async () => {
    const first = setup();
    first.switchToNextSubVideoOrCourse(); first.advance(12500); await new Promise(resolve => setImmediate(resolve));
    const saved = JSON.parse(first.storage.get(first.STORAGE_KEYS.completionReplay)); saved.attempts = 3;
    const t = setup([[first.STORAGE_KEYS.completionReplay, JSON.stringify(saved)]]);
    t.switchToNextSubVideoOrCourse(); t.advance(12500); await new Promise(resolve => setImmediate(resolve));
    assert.equal(t.fixture.video.plays, 0);
    assert.equal(t.state.enabled, false);
});

test('重播播放连续失败3次才暂停，迟到的失败回调不覆盖手动暂停提示', async () => {
    for (const manualPause of [false, true]) {
        const t = setup(); let reject;
        t.fixture.video.play = () => new Promise((_, fail) => { reject = fail; });
        t.switchToNextSubVideoOrCourse(); t.advance(12500); await new Promise(resolve => setImmediate(resolve));
        if (manualPause) t.pauseAutomation('手动暂停');
        reject(new Error('play rejected')); await new Promise(resolve => setImmediate(resolve));
        if (!manualPause) {
            assert.equal(t.state.enabled, true);
            for (let retry = 0; retry < 2; retry++) {
                t.advance(1000);
                reject(new Error('play rejected')); await new Promise(resolve => setImmediate(resolve));
            }
        }
        assert.equal(t.state.enabled, false);
        assert.equal(t.fixture.video.paused, true);
        assert.match(t.context.document.getElementById('jinpei-hud-status').innerText, manualPause ? /手动暂停/ : /重播启动连续失败 3 次/);
    }
});

test('重播期间卡住时暂停，不刷新或标记跳过', async () => {
    const t = setup(); t.switchToNextSubVideoOrCourse(); t.advance(12500); await new Promise(resolve => setImmediate(resolve));
    await t.mainLoop(); t.advance(30000); await t.mainLoop();
    assert.equal(t.state.enabled, false);
    assert.equal(t.context.location.reloads, 0);
    assert.equal(t.getFailedSubVideos().length, 0);
    assert.equal(t.next.clicks, 0);
});

test('会话存储不可用时也最多重播3次', async () => {
    const t = setup();
    t.context.sessionStorage.setItem = () => { throw new Error('storage unavailable'); };
    for (let attempt = 0; attempt < 4; attempt++) {
        t.switchToNextSubVideoOrCourse(); t.advance(12500); await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(t.fixture.video.plays, 3);
    assert.equal(t.state.enabled, false);
    assert.equal(t.next.clicks, 0);
});

test('回退尚未完成或缓冲不足时等待，轮询不并发发起播放', async () => {
    const t = setup(); const video = t.fixture.video;
    video.seeking = true; video.readyState = 1; video.paused = true;
    t.switchToNextSubVideoOrCourse(); t.advance(13000); await t.mainLoop();
    assert.equal(video.plays, 0);
    assert.equal(t.state.enabled, true);
    video.seeking = false; t.advance(500);
    assert.equal(video.plays, 0);
    video.readyState = 2; t.advance(500);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(video.plays, 1);
    assert.equal(t.state.isSwitching, false);
});

test('临时AbortError会重试并恢复，同一轮不多扣重播次数', async () => {
    const t = setup(); const video = t.fixture.video; video.paused = true;
    video.play = () => {
        video.plays++;
        if (video.plays === 1) return Promise.reject(Object.assign(new Error('seek interrupted'), { name: 'AbortError' }));
        video.paused = false; return Promise.resolve();
    };
    t.switchToNextSubVideoOrCourse(); t.advance(12500);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(t.state.enabled, true);
    assert.equal(t.state.isSwitching, true);
    await t.mainLoop(); assert.equal(video.plays, 1);
    t.advance(1000); await new Promise(resolve => setImmediate(resolve));
    assert.equal(video.plays, 2);
    assert.equal(t.state.isSwitching, false);
    assert.equal(JSON.parse(t.storage.get(t.STORAGE_KEYS.completionReplay)).attempts, 1);
});

test('回退一直未完成会超时暂停，手动暂停可取消等待', async () => {
    for (const manual of [false, true]) {
        const t = setup(); t.fixture.video.seeking = true;
        t.switchToNextSubVideoOrCourse(); t.advance(12500);
        if (manual) t.pauseAutomation('手动暂停');
        t.advance(15000);
        assert.equal(t.state.enabled, false);
        assert.equal(t.fixture.video.plays, 0);
        assert.equal(t.timers.size, 0);
        assert.match(t.context.document.getElementById('jinpei-hud-status').innerText, manual ? /手动暂停/ : /恢复播放超时/);
    }
});

test('播放请求永远不返回也会有限重试后暂停', async () => {
    const t = setup(); const video = t.fixture.video;
    video.play = () => { video.plays++; return new Promise(() => {}); };
    t.switchToNextSubVideoOrCourse(); t.advance(27000);
    assert.equal(t.state.enabled, false);
    assert.equal(video.plays, 3);
    assert.equal(t.next.clicks, 0);
});

test('等待回退时更换播放器不会播放旧视频，并释放恢复锁', async () => {
    const t = setup(); const oldVideo = t.fixture.video;
    oldVideo.seeking = true;
    t.switchToNextSubVideoOrCourse(); t.advance(12500);
    t.fixture.video = { ...oldVideo, seeking: false };
    t.advance(1000);
    assert.equal(oldVideo.plays, 0);
    assert.equal(t.state.enabled, true);
    assert.equal(t.state.isSwitching, false);
    assert.equal(t.state.isActionPending, false);
});

test('同步等待期间确认完成后才切换下一节', async () => {
    const t = setup();
    t.switchToNextSubVideoOrCourse(); t.advance(3000);
    assert.equal(t.next.clicks, 0);
    t.current.completed = true; t.advance(3000);
    assert.equal(t.next.clicks, 1);
    t.advance(3000);
    assert.equal(t.state.isSwitching, false);
});

test('慢目录切换持续加锁，空白过渡页不解锁，目录渲染后解锁', async () => {
    const t = setup(); t.current.completed = true; t.fixture.items = [t.current];
    t.switchToNextSubVideoOrCourse(); t.advance(4000); await t.mainLoop();
    assert.equal(t.fixture.catalogClicks, 1);
    assert.equal(t.state.isActionPending, true);
    t.fixture.video = null; await t.mainLoop(); t.advance(500);
    assert.equal(t.state.isSwitching, true);
    t.fixture.courses = [{ innerText: '下一课程\n2学时', children: [], offsetParent: {} }];
    t.advance(500);
    assert.equal(t.state.isSwitching, false);
    assert.equal(t.state.isActionPending, false);
});

test('目录切换超时暂停，不再次点击', async () => {
    const t = setup(); t.current.completed = true; t.fixture.items = [t.current];
    t.switchToNextSubVideoOrCourse(); t.advance(15000); await t.mainLoop();
    assert.equal(t.state.enabled, false);
    assert.equal(t.fixture.catalogClicks, 1);
    assert.equal(t.timers.size, 0);
});

test('返回时路由发生变化即解除锁', async () => {
    const t = setup(); t.current.completed = true; t.fixture.items = [t.current];
    t.switchToNextSubVideoOrCourse(); t.context.location.href = 'https://pc.kmelearning.com/home/my/myTask';
    t.advance(500);
    assert.equal(t.state.isActionPending, false);
    assert.equal(t.state.isSwitching, false);
});

test('手动暂停取消同步重试并恢复原生可见性', async () => {
    const t = setup(); t.switchToNextSubVideoOrCourse();
    assert.equal(t.context.document.webkitVisibilityState, 'visible');
    t.pauseAutomation('已暂停'); t.current.completed = true; t.advance(20000);
    assert.equal(t.next.clicks, 0);
    assert.equal(t.context.document.hidden, true);
    assert.equal(t.context.document.visibilityState, 'hidden');
    assert.equal(t.context.document.webkitVisibilityState, 'hidden');
    assert.equal(t.timers.size, 0);
});

test('calculateCourseTotalProgress 正确计算总时长、已完成小节数及百分比', async () => {
    const t = setup();
    const item1 = { completed: true, className: '', innerText: '小节1\n00:10:00', querySelector() { return {}; } };
    const item2 = { completed: false, className: 'text-primary', innerText: '小节2\n00:20:00', querySelector() { return null; } };
    const fakeVideo = { currentTime: 300, duration: 1200 }; // 播了5分钟 (300秒)
    const result = t.calculateCourseTotalProgress([item1, item2], fakeVideo);
    assert.equal(result.completedCount, 1);
    assert.equal(result.totalCount, 2);
    assert.equal(result.totalSec, 1800); // 10m + 20m = 30m = 1800s
    assert.equal(result.completedSec, 900); // 600s + 300s = 900s
    assert.equal(result.percent, 50);
    assert.match(result.text, /1\/2 节 · 15:00 \/ 30:00 \(50%\)/);
});

test('全量小节学完且检测到考试时，自动跳过考试并记录handledCourses', async () => {
    const t = setup();
    t.current.completed = true;
    t.fixture.items = [t.current];
    // 注入考试检测条目
    t.fixture.examNode = { innerText: '课后考试', closest() { return null; } };
    const origQSA = t.context.document.querySelectorAll.bind(t.context.document);
    t.context.document.querySelectorAll = (sel) => {
        if (sel.includes('ant5-tabs-tab')) return [t.fixture.examNode];
        return origQSA(sel);
    };

    t.switchToNextSubVideoOrCourse();
    t.advance(500);

    const handled = t.getHandledCourses();
    assert.ok(handled.length > 0);
    assert.match(t.context.document.getElementById('jinpei-hud-status').innerText, /包含考试，已自动跳过/);
});

test('autoDismissDialogs 检测并跳过考试弹窗', async () => {
    const t = setup();
    let cancelClicked = 0;
    const mockDialog = {
        innerText: '恭喜您完成视频，是否进入结业考试？',
        offsetParent: {},
        closest() { return null; },
        querySelectorAll(sel) {
            if (sel.includes('button')) {
                return [
                    { innerText: '取消', offsetParent: {}, click() { cancelClicked++; } },
                    { innerText: '去考试', offsetParent: {}, click() {} }
                ];
            }
            return [];
        },
        querySelector() { return null; }
    };
    const origQSA = t.context.document.querySelectorAll.bind(t.context.document);
    t.context.document.querySelectorAll = (sel) => {
        if (sel.includes('modal')) return [mockDialog];
        return origQSA(sel);
    };

    t.autoDismissDialogs();
    assert.equal(cancelClicked, 1);
});

test('课程大目录中跳过已处理课程，防止未打勾导致死循环', async () => {
    const t = setup();
    t.fixture.video = null; // 在目录页
    let course1Clicks = 0;
    let course2Clicks = 0;
    const course1 = { innerText: '已学课程（含考试跳过）\n2学时', children: [], offsetParent: {}, click() { course1Clicks++; } };
    const course2 = { innerText: '未学课程2\n1学时', children: [], offsetParent: {}, click() { course2Clicks++; } };
    t.fixture.courses = [course1, course2];

    // 将 course1 加入 handled
    t.markCourseHandled('已学课程（含考试跳过）');

    await t.mainLoop();
    t.advance(1500);

    assert.equal(course1Clicks, 0, '已跳过的课程不应被再次点击');
    assert.equal(course2Clicks, 1, '应直接进入下一门未完成课程');
    assert.equal(t.storage.get('_kme_m_progress') || t.storage.get('jinpei_map_progress'), '1 / 2 门 (50%)');
});

test('mainLoop 兼容 /home/courseplay/ 独立课程播放路由', async () => {
    const t = setup();
    t.context.location.href = 'https://pc.kmelearning.com/jsncxyslhs/home/courseplay/2092436631901233152';
    t.current.completed = true;
    t.fixture.items = [t.current, t.next];
    t.advance(6000);
    await t.mainLoop();
    t.advance(500);
    // 应该识别为 study/courseplay 页面并推进视频跳转
    assert.equal(t.next.clicks, 1);
});

test('[P1] 不同地图中的同名课程不相互冲突，地图A处理后地图B同名未学课程正常进入', async () => {
    const t = setup();
    // 地图 100 中标记“合规培训”已处理
    t.markCourseHandled('100', '合规培训');
    assert.equal(t.isCourseHandled('100', '合规培训'), true);
    assert.equal(t.isCourseHandled('200', '合规培训'), false);

    // 切换到地图 200
    t.context.location.href = 'https://pc.kmelearning.com/home/training/study/200';
    t.fixture.video = null; // 目录页
    let map2CourseClicks = 0;
    const map2Course = { innerText: '合规培训\n2学时', children: [], offsetParent: {}, click() { map2CourseClicks++; } };
    t.fixture.courses = [map2Course];

    await t.mainLoop();
    t.advance(1500);

    assert.equal(map2CourseClicks, 1, '地图200中的同名课程不应被地图100误跳过');
});

test('[P2] 任务中心跳过包含考试已学完的地图，避免死循环重入', async () => {
    const t = setup();
    t.context.location.href = 'https://pc.kmelearning.com/home/my/myTask';
    let map1Clicks = 0;
    let map2Clicks = 0;
    const taskMap1 = {
        innerText: '2026年九月地图（含考试已跳过）\n进行中\n截止2026.10.01',
        offsetParent: {},
        click() { map1Clicks++; }
    };
    const taskMap2 = {
        innerText: '2026年十月地图\n进行中\n截止2026.11.01',
        offsetParent: {},
        click() { map2Clicks++; }
    };

    // 模拟 querySelectorAll 返回任务卡片
    t.context.document.querySelectorAll = (sel) => {
        if (sel.includes('.grid > div')) return [taskMap1, taskMap2];
        return [];
    };

    // 记录 taskMap1 为已处理
    t.markMapHandled('2026年九月地图（含考试已跳过）');

    await t.mainLoop();
    t.advance(1500);

    assert.equal(map1Clicks, 0, '已处理跳过的地图不应被再次点击重入');
    assert.equal(map2Clicks, 1, '应顺利进入下一个未处理地图');

    // 若 taskMap2 也处理完，再次执行主循环应平稳暂停自动化
    t.markMapHandled('2026年十月地图');
    t.state.isActionPending = false;
    await t.mainLoop();
    assert.equal(t.state.enabled, false);
    assert.match(t.context.document.getElementById('jinpei-hud-status').innerText, /已学完/);
});

test('[P3] getCourseItems 正确识别只有 0% 或仅有百分比的课程卡片', async () => {
    const t = setup();
    const cardWithZero = {
        innerText: '新员工合规通识\n0%',
        children: [],
        offsetParent: {}
    };
    const cardWithFifty = {
        innerText: '银行理财业务概览\n50%',
        children: [],
        offsetParent: {}
    };
    t.context.document.querySelectorAll = (sel) => {
        if (sel.includes('panelContent')) return [cardWithZero, cardWithFifty];
        return [];
    };

    const items = t.getCourseItems();
    assert.equal(items.length, 2, '包含 0% 和 50% 的卡片应全部被正确识别');
});

test('[防检测 1] 随机时间抖动：randomBetween 落在正确闭区间，开启 enableJitter 后定时产生波动', async () => {
    const t = setup();
    for (let i = 0; i < 50; i++) {
        const val = t.randomBetween(100, 200);
        assert.ok(val >= 100 && val <= 200, `val ${val} 应在 100 到 200 之间`);
    }

    t.CONFIG.enableJitter = true;
    const delays = [];
    for (let i = 0; i < 20; i++) {
        t.setManagedTimeout(() => {}, 1000);
        const latestTimer = [...t.timers.values()].pop();
        delays.push(latestTimer.at);
    }
    // 抖动模式下，每个 1000ms 定时器由于 ~15% 随机偏移，不应全部完全相同
    const uniqueDelays = new Set(delays);
    assert.ok(uniqueDelays.size > 1, '启用拟人时间抖动后，定时器触发时刻应产生离散波动');
    t.CONFIG.enableJitter = false;
});

test('[防检测 2] 拟人化点击：simulateHumanClick 派发完整鼠标事件链与自然范围坐标', async () => {
    const t = setup();
    const dispatchedEvents = [];
    let nativeClicked = 0;

    const mockButton = {
        getBoundingClientRect() {
            return { left: 100, top: 200, width: 80, height: 40 };
        },
        dispatchEvent(evt) {
            dispatchedEvents.push(evt);
            return true;
        },
        click() {
            nativeClicked++;
        }
    };

    // 注入全局 MouseEvent 构造支持
    t.context.MouseEvent = class MockMouseEvent {
        constructor(type, init = {}) {
            this.type = type;
            Object.assign(this, init);
        }
    };

    t.simulateHumanClick(mockButton);

    assert.equal(nativeClicked, 1, '应执行基础的 native click');
    const eventTypes = dispatchedEvents.map(e => e.type);
    assert.deepEqual(eventTypes, ['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click']);

    // 坐标在元素 bounding box 内部 (left: 100..180, top: 200..240)
    for (const evt of dispatchedEvents) {
        assert.ok(evt.clientX >= 100 && evt.clientX <= 180, `clientX ${evt.clientX} 应在元素水平区域内`);
        assert.ok(evt.clientY >= 200 && evt.clientY <= 240, `clientY ${evt.clientY} 应在元素垂直区域内`);
    }
});

test('[防检测 4] 会话存储脱敏：使用 _kme_* 前缀，兼容旧 jinpei_* 键名', async () => {
    const t = setup();
    // 1. 验证写入脱敏键名
    t.setStorageItem(t.STORAGE_KEYS.running, 'true');
    assert.equal(t.storage.get('_kme_running_state'), 'true');

    // 2. 验证优先读取脱敏键名
    assert.equal(t.getStorageItem(t.STORAGE_KEYS.running, 'jinpei_auto_running'), 'true');

    // 3. 验证向下兼容历史键名
    t.storage.delete('_kme_running_state');
    t.storage.set('jinpei_auto_running', 'legacy_true');
    assert.equal(t.getStorageItem(t.STORAGE_KEYS.running, 'jinpei_auto_running'), 'legacy_true');

    // 4. 验证 removeStorageItem 同时清除新旧键名
    t.setStorageItem(t.STORAGE_KEYS.running, 'true');
    t.removeStorageItem(t.STORAGE_KEYS.running, 'jinpei_auto_running');
    assert.equal(t.storage.has('_kme_running_state'), false);
    assert.equal(t.storage.has('jinpei_auto_running'), false);
});

test('[防检测 4] Shadow DOM 隔离：HUD 挂载至 _kme_tool_host 且内部 Shadow 封装', async () => {
    const t = setup();
    let attachedShadowRoot = null;
    const hostEl = {
        id: '_kme_tool_host',
        style: {},
        attachShadow(init) {
            assert.equal(init.mode, 'open');
            attachedShadowRoot = {
                children: [],
                appendChild(child) { this.children.push(child); },
                getElementById(id) { return this.children.find(c => c.id === id) || null; },
                querySelector() { return null; }
            };
            return attachedShadowRoot;
        }
    };

    t.context.document.body = {
        children: [],
        appendChild(child) { this.children.push(child); }
    };
    t.context.document.getElementById = (id) => {
        if (id === '_kme_tool_host') return null;
        if (id === 'jinpei-hud') return null;
        return { style: {}, innerText: '', addEventListener() {} };
    };
    t.context.document.createElement = (tag) => {
        if (tag === 'div') {
            return {
                id: '',
                style: {},
                children: [],
                attachShadow: hostEl.attachShadow,
                appendChild(c) { this.children.push(c); },
                addEventListener() {},
                getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 200 }; }
            };
        }
        if (tag === 'style') {
            return { id: '', innerHTML: '' };
        }
        return { style: {}, addEventListener() {} };
    };

    // 执行主循环触发 HUD 创建
    await t.mainLoop();

    assert.ok(attachedShadowRoot, '应成功为宿主 host 创建 attachShadow({ mode: "open" })');
    const hudInShadow = attachedShadowRoot.children.find(c => c.id === 'jinpei-hud');
    assert.ok(hudInShadow, 'HUD 面板应被安全封闭在 Shadow DOM 内部，避免外层 document.querySelectorAll 检索遍历');
});

test('[看门狗 1] 视频进度卡住 30 秒自动触发 location.reload()，且 reloadCount 正确累加', async () => {
    const t = setup();
    t.current.completed = false;
    t.fixture.video.currentTime = 10;

    // 首次检测初始化
    t.checkWatchdog(t.fixture.video, t.current, t.fixture.items);
    assert.equal(t.context.location.reloads, 0);

    // 时间推进 29 秒 (未达 30 秒阈值)
    t.advance(29000);
    t.checkWatchdog(t.fixture.video, t.current, t.fixture.items);
    assert.equal(t.context.location.reloads, 0, '未达 30 秒不应触发刷新');

    // 时间推进到 30 秒
    t.advance(1000);
    t.checkWatchdog(t.fixture.video, t.current, t.fixture.items);
    assert.equal(t.context.location.reloads, 1, '卡顿满 30 秒应自动刷新页面');

    const wd = t.getWatchdogState();
    assert.equal(wd.reloadCount, 1, '已刷新次数应记录为 1');
});

test('[看门狗 2] 连续卡死刷新达 5 次仍未恢复，自动标记跳过该小节并切换下一小节', async () => {
    const t = setup();
    t.current.completed = false;
    t.fixture.video.currentTime = 5;

    // 让下一小节拥有独立标题，避免和当前小节同名导致键名冲突
    t.next.innerText = '下一小节\n00:02:00';
    t.next.querySelector = (selector) => selector === '[title], .truncate' ? { innerText: '下一小节' } : (t.next.completed ? {} : null);

    // 模拟已经刷新了 5 次
    const subKey = '1::unknown::当前小节';
    t.setWatchdogState({
        subVideoKey: subKey,
        reloadCount: 5,
        consecutiveFails: 0
    });

    // 初始化 runtime 记录
    t.checkWatchdog(t.fixture.video, t.current, t.fixture.items);

    // 卡顿满 30 秒
    t.advance(30000);
    t.checkWatchdog(t.fixture.video, t.current, t.fixture.items);

    // 此时不再执行 location.reload()，而是判定该小节卡死
    const wd = t.getWatchdogState();
    assert.equal(wd.reloadCount, 0, '小节跳过后 reloadCount 应归零');
    assert.equal(wd.consecutiveFails, 1, '连续失败小节数应为 1');
    assert.ok(t.isSubVideoFailed(subKey), '当前小节应被记录至 failedVideos');

    // 推进 1 秒调度 switchToNextSubVideoOrCourse
    t.advance(1000);
    assert.equal(t.next.clicks, 1, '应自动点击并切换至下一未完成小节');
});

test('[看门狗 3] 连续 3 节课均加载失败，看门狗自动暂停学习并提示用户', async () => {
    const t = setup();
    t.current.completed = false;
    t.fixture.video.currentTime = 0;

    // 模拟前 2 节课已经失败，当前小节是第 3 节，且已刷新 5 次
    const subKey = '1::unknown::当前小节';
    t.setWatchdogState({
        subVideoKey: subKey,
        reloadCount: 5,
        consecutiveFails: 2
    });

    t.checkWatchdog(t.fixture.video, t.current, t.fixture.items);
    t.advance(30000);
    t.checkWatchdog(t.fixture.video, t.current, t.fixture.items);

    assert.equal(t.state.enabled, false, '达到连续 3 节失败上限应自动暂停');
    assert.match(t.context.document.getElementById('jinpei-hud-status').innerText, /连续 3 节课均无法正常加载播放/);
});

test('[看门狗 4] 视频正常稳定播放推进后，自动复位看门狗异常计数', async () => {
    const t = setup();
    t.current.completed = false;
    t.fixture.video.currentTime = 10;

    const subKey = '1::unknown::当前小节';
    t.setWatchdogState({
        subVideoKey: subKey,
        reloadCount: 2,
        consecutiveFails: 1
    });

    // 第一次进入
    t.checkWatchdog(t.fixture.video, t.current, t.fixture.items);

    // 视频正常播放了 4 秒 (10 -> 14)
    t.advance(4000);
    t.fixture.video.currentTime = 14;
    t.checkWatchdog(t.fixture.video, t.current, t.fixture.items);

    const wd = t.getWatchdogState();
    assert.equal(wd.reloadCount, 0, '视频正常播放后 reloadCount 应清零');
    assert.equal(wd.consecutiveFails, 0, '视频正常播放后 consecutiveFails 应清零');
});

test('[并发 1] 并发数读取与设置：默认并发数为 1，支持 1~6 范围约束与持久化', async () => {
    const t = setup();
    assert.equal(t.getConcurrencySetting(), 1, '默认并发数应为 1');
    assert.equal(t.CONFIG.defaultConcurrency, 1);
    assert.equal(t.CONFIG.maxConcurrency, 6);

    // 设置在有效范围内
    assert.equal(t.setConcurrencySetting(3), 3);
    assert.equal(t.getConcurrencySetting(), 3);
    assert.equal(t.localStorageMap.get(t.STORAGE_KEYS.concurrency), '3');
    assert.equal(t.state.concurrency, 3);

    // 下界钳位
    assert.equal(t.setConcurrencySetting(0), 1);
    assert.equal(t.getConcurrencySetting(), 1);

    // 上界钳位 (最大 6)
    assert.equal(t.setConcurrencySetting(9), 6);
    assert.equal(t.getConcurrencySetting(), 6);
});

test('[并发 2] 跨标签页心跳注册、过期清理与窗口退出释放', async () => {
    const t = setup();
    t.registerTabHeartbeat('c_101', '合规大课', 'map_99');
    let tabs = t.getActiveTabs();
    assert.ok(tabs[t.TAB_ID], '当前标签页应成功注册至活跃表');
    assert.equal(tabs[t.TAB_ID].courseKey, 'c_101');
    assert.equal(tabs[t.TAB_ID].courseTitle, '合规大课');
    assert.equal(tabs[t.TAB_ID].mapId, 'map_99');

    // 120 秒内活跃心跳有效
    t.advance(5000);
    tabs = t.getActiveTabs();
    assert.ok(tabs[t.TAB_ID], '5 秒内心跳依然有效');

    // 模拟超过 120 秒未续期（页面卡死或异常崩溃关闭），自动清理陈旧槽位
    t.advance(116000); // 121 秒未续期
    tabs = t.getActiveTabs();
    assert.equal(tabs[t.TAB_ID], undefined, '超过 120 秒未刷新心跳应被自动剔除');

    // 重新注册并手动 unregisterTab (模拟 beforeunload 退出)
    t.registerTabHeartbeat('c_101', '合规大课', 'map_99');
    assert.ok(t.getActiveTabs()[t.TAB_ID]);
    t.unregisterTab();
    assert.equal(t.getActiveTabs()[t.TAB_ID], undefined, 'unregisterTab 后应立即移除占位');
});

test('[并发 3] 课程槽位防冲突：其他活跃窗口占用的课程不会被重复分配', async () => {
    const otherTabId = 'tab_other_abc';
    const activeMap = {
        [otherTabId]: {
            courseKey: 'c_course1',
            courseTitle: '第一门必修课',
            mapId: '1',
            timestamp: 0,
        }
    };
    const t = setup([], [['_kme_active_tabs', JSON.stringify(activeMap)]]);

    // 检查冲突检测
    assert.equal(t.isCourseBusyByOtherTab('c_course1', '第一门必修课', '1'), true, '同地图同课程应判定为占用');
    assert.equal(t.isCourseBusyByOtherTab('c_course2', '第二门必修课', '1'), false, '未被占用的课程应返回 false');
    assert.equal(t.isCourseBusyByOtherTab('c_course1', '第一门必修课', 'map_diff'), false, '不同地图不冲突');

    // 槽位抢占
    t.setConcurrencySetting(2);
    assert.equal(await t.tryClaimCourseSlot('c_course1', '第一门必修课', '1'), false, '被占用的课程无法申领');
    assert.equal(await t.tryClaimCourseSlot('c_course2', '第二门必修课', '1'), true, '未被占用的课程成功申领');

    // 申领成功后应已记入当前标签的心跳
    assert.equal(t.getActiveTabs()[t.TAB_ID].courseKey, 'c_course2');
});

test('[并发 4] 目录调度与多窗口唤起：多并发下自动打开新窗口，全占用时候选中不误切', async () => {
    const c1 = { innerText: '课程一\n2学时', children: [], offsetParent: {}, clicks: 0, click() { this.clicks++; } };
    const c2 = { innerText: '课程二\n2学时', children: [], offsetParent: {}, clicks: 0, click() { this.clicks++; } };
    const c3 = { innerText: '课程三\n2学时', children: [], offsetParent: {}, clicks: 0, click() { this.clicks++; } };

    const t = setup();
    t.fixture.video = null; // 目录态
    t.fixture.courses = [c1, c2, c3];
    t.setConcurrencySetting(2); // 设为 2 路并发

    // Tab 1 运行目录调度
    await t.mainLoop();
    t.advance(1000);

    // Tab 1 进入 c1
    assert.equal(c1.clicks, 1, '应选择第一个可用大课');
    assert.equal(t.state.currentCourse, '课程一');
    // 因为设置了 2 路并发，且还有剩余课程，自动唤起了新窗口
    assert.equal(t.openedUrls.length, 1, '并发 > 1 且有余课时应调用 window.open 唤起新窗口');

    // 模拟 Tab 2：C1 和 C2 都已被两个窗口占用，只剩 C1/C2 在学
    const twoBusyTabs = {
        tab_1: { courseKey: '课程一', courseTitle: '课程一', mapId: '1', timestamp: 1000 },
        tab_2: { courseKey: '课程二', courseTitle: '课程二', mapId: '1', timestamp: 1000 },
    };
    const t2 = setup([], [['_kme_active_tabs', JSON.stringify(twoBusyTabs)]]);
    t2.fixture.video = null;
    t2.fixture.courses = [c1, c2]; // 只有两门课，且两门课都正在被 tab_1 和 tab_2 学习
    await t2.mainLoop();

    // t2 应原地等待候选中，不误点击，也不误跳出地图
    assert.equal(c1.clicks, 1, '不应重复点击已占用的课程');
    assert.equal(c2.clicks, 0);
    assert.match(t2.context.document.getElementById('jinpei-hud-status').innerText, /剩余课程正由其他窗口并发学习中/);
});

test('[并发 5] 并发子窗口学完全部课程后自动关闭释放资源', async () => {
    const c1 = { innerText: '已学课程一\n2学时', children: [], offsetParent: {} };
    const t = setup();
    t.markCourseHandled('1', '已学课程一');
    t.context.window.opener = {}; // 标识当前窗口为由主窗口打开的子窗口
    t.fixture.video = null;
    t.fixture.courses = [c1];

    await t.mainLoop();
    t.advance(2500);

    assert.equal(t.context.window.closed, true, '并发子窗口学完全部课程后应调用 window.close() 自动关闭');
});
