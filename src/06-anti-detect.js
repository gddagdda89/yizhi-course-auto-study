    // [防检测 1: 拟人随机数与时间抖动发生器 Human Jitter]
    function randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // [防检测 2: 拟人化真实坐标与鼠标事件链点击 Simulated Human Click]
    function simulateHumanClick(el) {
        if (!el) return;
        try {
            const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
            let x = 0, y = 0;
            if (rect && rect.width > 0 && rect.height > 0) {
                const rx = 0.25 + 0.5 * Math.random();
                const ry = 0.25 + 0.5 * Math.random();
                x = Math.round(rect.left + rect.width * rx);
                y = Math.round(rect.top + rect.height * ry);
            } else if (typeof window !== 'undefined') {
                x = Math.round((window.innerWidth || 1024) / 2 + (Math.random() * 40 - 20));
                y = Math.round((window.innerHeight || 768) / 2 + (Math.random() * 40 - 20));
            }

            const commonProps = {
                bubbles: true,
                cancelable: true,
                view: typeof window !== 'undefined' ? window : null,
                clientX: x,
                clientY: y,
                screenX: x + 10,
                screenY: y + 10,
            };

            if (typeof MouseEvent === 'function' && typeof el.dispatchEvent === 'function') {
                el.dispatchEvent(new MouseEvent('mouseover', commonProps));
                el.dispatchEvent(new MouseEvent('mousemove', commonProps));
                el.dispatchEvent(new MouseEvent('mousedown', { ...commonProps, buttons: 1, button: 0 }));
                el.dispatchEvent(new MouseEvent('mouseup', { ...commonProps, buttons: 0, button: 0 }));
                el.dispatchEvent(new MouseEvent('click', { ...commonProps, buttons: 0, button: 0 }));
                // 已派发一次 click，不能再调用 .click()；即使默认行为被取消也不重复点击。
                return;
            }
        } catch (_) {}

        if (typeof el.click === 'function') {
            el.click();
        }
    }

