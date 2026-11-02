    // ==========================================
    // 1. 悬浮 HUD 状态面板（现代浅色高透光磨砂玻璃态设计 + 可拖拽 + 折叠）
    // ==========================================
    // ==========================================
    // 1. 悬浮 HUD 状态面板（现代浅色高透光磨砂玻璃态设计 + Shadow DOM 隔离 + 可拖拽 + 折叠）
    // ==========================================
    function ensureHUDStyles(targetRoot) {
        const root = targetRoot || document.head || document.body;
        if (!root) return;
        if (root.querySelector && root.querySelector('#jinpei-hud-styles')) return;
        const style = document.createElement('style');
        style.id = 'jinpei-hud-styles';
        style.innerHTML = `
            @keyframes jinpei-pulse {
                0% { transform: scale(0.92); opacity: 0.7; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
                70% { transform: scale(1.08); opacity: 1; box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
                100% { transform: scale(0.92); opacity: 0.7; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
            }
            @keyframes jinpei-amber-pulse {
                0% { transform: scale(0.92); opacity: 0.7; box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.6); }
                70% { transform: scale(1.08); opacity: 1; box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); }
                100% { transform: scale(0.92); opacity: 0.7; box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
            }
            .jinpei-glass, .jinpei-glass * {
                box-sizing: border-box !important;
            }
            .jinpei-glass {
                position: fixed;
                z-index: 999999;
                /* 浅色高通透 Apple 风格毛玻璃 */
                background: rgba(255, 255, 255, 0.42) !important;
                backdrop-filter: blur(16px) saturate(180%) !important;
                -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
                border: 1px solid rgba(255, 255, 255, 0.55) !important;
                border-radius: 18px !important;
                box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.6) inset, 0 2px 4px rgba(0, 0, 0, 0.04) !important;
                color: #1e293b !important;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
                user-select: none;
                overflow: hidden;
                white-space: nowrap !important;
                transition: box-shadow 0.3s ease, border-color 0.3s ease, width 0.25s ease;
            }
            .jinpei-glass:hover {
                background: rgba(255, 255, 255, 0.58) !important;
                border-color: rgba(255, 255, 255, 0.7) !important;
                box-shadow: 0 24px 48px -10px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.8) inset !important;
            }
            /* 折叠/最小化状态：紧凑单个海螺悬浮图标，隐藏标题 */
            .jinpei-glass.jinpei-collapsed {
                border-radius: 50% !important;
                width: 42px !important;
                height: 42px !important;
                min-width: 42px !important;
                max-width: 42px !important;
                cursor: pointer !important;
                overflow: visible !important;
                box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.14), 0 0 0 1px rgba(255, 255, 255, 0.75) inset !important;
                transition: transform 0.2s ease, box-shadow 0.25s ease, border-color 0.25s ease, width 0.25s ease, height 0.25s ease, border-radius 0.25s ease !important;
            }
            .jinpei-glass.jinpei-collapsed:hover {
                transform: scale(1.08);
                box-shadow: 0 12px 28px -4px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.9) inset !important;
            }
            .jinpei-glass.jinpei-collapsed #jinpei-hud-top-bar,
            .jinpei-glass.jinpei-collapsed #jinpei-hud-title-text,
            .jinpei-glass.jinpei-collapsed #jinpei-hud-version,
            .jinpei-glass.jinpei-collapsed #jinpei-hud-update-badge,
            .jinpei-glass.jinpei-collapsed #jinpei-hud-header-right,
            .jinpei-glass.jinpei-collapsed #jinpei-hud-body {
                display: none !important;
            }
            .jinpei-glass.jinpei-collapsed #jinpei-hud-header {
                width: 42px !important;
                height: 42px !important;
                padding: 0 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                border-bottom: none !important;
                position: relative !important;
                cursor: pointer !important;
            }
            .jinpei-glass.jinpei-collapsed #jinpei-hud-header-left {
                width: 100% !important;
                height: 100% !important;
                justify-content: center !important;
                align-items: center !important;
                gap: 0 !important;
            }
            .jinpei-glass.jinpei-collapsed #jinpei-hud-icon {
                font-size: 21px !important;
                display: inline-block !important;
                line-height: 1 !important;
            }
            .jinpei-glass.jinpei-collapsed #jinpei-hud-dot {
                position: absolute !important;
                top: 7px !important;
                right: 7px !important;
                width: 7px !important;
                height: 7px !important;
                box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.95) !important;
                z-index: 2 !important;
            }
            .jinpei-info-box {
                background: rgba(255, 255, 255, 0.18);
                border: 1px solid rgba(255, 255, 255, 0.55);
                border-radius: 12px;
                padding: 10px 12px;
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02) inset;
            }
            .jinpei-btn-action {
                cursor: pointer;
                border: none;
                outline: none;
                border-radius: 9px;
                font-weight: 600;
                font-size: 13px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .jinpei-btn-action:hover {
                filter: brightness(1.08);
                transform: translateY(-1px);
            }
            .jinpei-btn-action:active {
                transform: translateY(1px);
                filter: brightness(0.96);
            }
            .jinpei-icon-btn {
                background: rgba(0, 0, 0, 0.04);
                border: 1px solid rgba(0, 0, 0, 0.06);
                color: #64748b;
                width: 24px;
                height: 24px;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 13px;
                line-height: 1;
                transition: all 0.2s ease;
            }
            .jinpei-icon-btn:hover {
                background: rgba(0, 0, 0, 0.08);
                color: #0f172a;
                border-color: rgba(0, 0, 0, 0.12);
            }
        `;
        root.appendChild(style);
    }
