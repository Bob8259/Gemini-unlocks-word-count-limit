
---

# Gemini 输入框增强脚本 (字数解除 + 智能回车)

这是一个基于 **Tampermonkey (油猴)** 开发的脚本，专门用于优化 Gemini 网页版的输入体验。它解决了原生输入框在大段文字粘贴时的截断问题，并优化了发送后的清空逻辑。[点击下载](https://greasyfork.org/zh-CN/scripts/561665/)

#### 声明：
#### 本项目仅供学习，请勿正式使用。如需上传长文本内容，请使用官方的上传文件功能。官方只是不支持输入框输入长内容，但是支持上传长内容txt文件。再次说明本项目仅供学习，请勿正式使用！！

## 🚀 主要功能

### 1. 彻底解除字数限制

* **原理**：通过拦截并重写底层 `Quill.js` 引擎的 `insertAt` 和 `deleteAt` 原型方法，阻止系统对超长文本执行自动截断。[点击下载](https://greasyfork.org/zh-CN/scripts/561665/)
* **特性**：
* 支持无限长度的文本输入与粘贴。
* 绕过前端 UI 层的字数校验。
* 保持后端 API 发送的完整性。



### 2. 智能回车 (Enter) 逻辑

* **纯 Enter**：发送消息后自动清空输入框内容。
* **组合键 (Shift/Ctrl + Enter)**：正常换行，不会触发清空。
* **自拦截优化**：脚本能自动识别“手动清空”与“系统截断”，确保清空操作不会被自身的防御逻辑拦截。

### 3. 安全与兼容性

* **TrustedHTML 兼容**：使用原生 API 操作，避开了浏览器对 `innerHTML` 的安全拦截。
* **无感运行**：脚本在页面加载时自动注入，无需手动干预。

---

## 🛠️ 安装与使用

1. 确保浏览器已安装 [Tampermonkey](https://www.tampermonkey.net/) 插件。
2. 点击插件图标，选择 **“添加新脚本”**。
3. 将脚本代码完整粘贴到编辑器中并保存（Ctrl + S）。
4. 刷新 `gemini.google.com` 页面即可生效。

## ⚠️ 注意事项

* **API 限制**：虽然脚本解除了前端 UI 的限制，但如果 Google 服务器后端对单次请求有硬性的长度限制（如超过数十万字），可能会导致请求报错（400 Bad Request）。
* **仅限个人调试**：本脚本仅用于个人研究与提升输入体验，请勿用于违反平台服务协议的行为。对于超长文本，建议以文件形式上传，而不要使用本插件。本插件仅供学习交流，请勿大量使用。
* **性能降低**: 本脚本会显著降低网页流畅度，请知悉。


---
若无法下载，可直接在油猴内添加本代码。

v1.3优化版，此版本由[liangyu19664](https://github.com/lianyu19664)提供优化，特此感谢
```
// ==UserScript==
// @name         Gemini 解除字数限制锁死 + 智能清空版 (v1.3 修复粘贴截断)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  解决Gemini自拦截限制字数问题，修复v2版本粘贴大段文本时被误判截断的Bug，回归v1稳健逻辑
// @author       Azikaban & Gemini AI & liangyu19664
// @match        *://gemini.google.com/*
// @grant        none
// @run-at       document-start
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/561665/Gemini%20%E8%A7%A3%E9%99%A4%E5%AD%97%E6%95%B0%E9%99%90%E5%88%B6%E9%94%81%E6%AD%BB%20%2B%20%E6%99%BA%E8%83%BD%E6%B8%85%E7%A9%BA%E7%89%88.user.js
// @updateURL https://update.greasyfork.org/scripts/561665/Gemini%20%E8%A7%A3%E9%99%A4%E5%AD%97%E6%95%B0%E9%99%90%E5%88%B6%E9%94%81%E6%AD%BB%20%2B%20%E6%99%BA%E8%83%BD%E6%B8%85%E7%A9%BA%E7%89%88.meta.js
// ==/UserScript==

/*
  ==========================================================================
  COLLABORATION STATEMENT:
  This script was co-authored by a human user and Gemini (AI). Please review the code before using it.
  ==========================================================================
  MIT License

  Copyright (c) 2024 Gemini Helper

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
*/

/*
  ==========================================================================
  UPDATE LOG v1.3:
  1. 修复核心 Bug：在 v1.2 中，粘贴(Paste)被视为"用户行为"，导致 Gemini 
     在粘贴长文本(>32k)后触发的自动截断被脚本误放行。
  2. 逻辑重构：引入 "显式删除意图" (Explicit Delete Intent)，只有物理按键
     (Backspace/Delete) 或 剪切(Cut) 才授权删除文末内容。
  3. 功能回归：重新引入 v1 版本的 "回车键智能清空" 状态机，确保在严格拦截
     模式下，用户依然可以通过回车清空编辑器。
  ==========================================================================
*/

(function() {
    'use strict';

    // --- 1. 状态管理 ---
    
    // 标记当前是否处于“手动清空”状态 (用于处理全选删除或回车清空)
    let isManualClearing = false;
    
    // 标记用户是否按下了删除键 (区分“系统自动截断”与“用户手动删除”)
    let isDeletingKey = false;
    let deleteKeyTimer = null;

    // --- 2. 事件监听 (修复核心) ---

    // 监听明确的删除按键 (Backspace, Delete)
    // 【关键修复】：这里移除了 'paste' 事件！
    // 解释：粘贴动作本身是“增加”内容。如果粘贴后紧接着发生了“删除”操作（deleteAt），
    // 那通常是 Gemini 系统在检测到字数超标后自动发起的截断，而非用户意图。
    // 因此，粘贴动作不应授权 deleteAt。
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' || e.key === 'Delete') {
            isDeletingKey = true;
            clearTimeout(deleteKeyTimer);
            // 给予 200ms 的操作窗口，按键后 200ms 内的删除请求被视为合法
            deleteKeyTimer = setTimeout(() => { isDeletingKey = false; }, 200);
        }
    }, true);
    
    // 兼容剪切操作 (Cut 确实是用户意图减少内容，所以允许)
    window.addEventListener('cut', () => {
        isDeletingKey = true;
        setTimeout(() => { isDeletingKey = false; }, 200);
    }, true);

    // --- 3. 辅助功能：智能清空监听 (源自 v1) ---
    // 解决问题：当脚本处于“严格拦截”模式时，用户想清空编辑器（通常通过全选+回车或不断回退）
    // 可能会被误判为“大规模删除”而被拦截。此逻辑专门放行“回车清空”。
    window.addEventListener('keydown', function(event) {
        const editor = document.querySelector('.ql-editor');
        if (!editor || !editor.contains(event.target)) return;

        // 检测纯回车键
        if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
            setTimeout(() => {
                const container = document.querySelector('.ql-container');
                if (container && container.__quill) {
                    // 标记意图：这是一次清空操作
                    isManualClearing = true; 
                    try {
                        container.__quill.setText('');
                    } finally {
                        setTimeout(() => { 
                            isManualClearing = false; 
                            // 修正：强制重置影子计数器，防止清空后计数器未归零导致后续计算偏差
                            if (container.__quill) container.__quill.__shadowLen = 0;
                        }, 50);
                    }
                }
            }, 100);
        }
    }, true);

    // --- 4. 核心劫持逻辑 ---
    const originalDefineProperty = Object.defineProperty;
    Object.defineProperty = function(obj, prop, descriptor) {

        // 只拦截 Quill 编辑器的核心方法 insertAt 和 deleteAt
        if (prop !== 'insertAt' && prop !== 'deleteAt') {
            return originalDefineProperty.apply(this, arguments);
        }

        // 辅助函数：安全初始化 shadowLen (保留 v1.2 的 O(1) 性能优化)
        const initShadowLen = (ctx) => {
            if (typeof ctx.__shadowLen !== 'number') {
                ctx.__shadowLen = (ctx.text && typeof ctx.text.length === 'number') ? ctx.text.length : 0;
            }
        };

        // 劫持 insertAt (插入)
        // 作用：实时维护 shadowLen 计数器，避免每次操作都读取 DOM (O(N) -> O(1))
        if (prop === 'insertAt' && descriptor.value) {
            const originalInsert = descriptor.value;
            descriptor.value = function(index, text, formatting) {
                initShadowLen(this);
                if (typeof text === 'string') {
                    this.__shadowLen += text.length;
                } else {
                    this.__shadowLen += 1; // 非文本对象（如图片）算作长度 1
                }
                return originalInsert.apply(this, arguments);
            };
        }

        // 劫持 deleteAt (删除) - 防御核心
        if (prop === 'deleteAt' && descriptor.value) {
            const originalDelete = descriptor.value;
            descriptor.value = function(index, length) {
                initShadowLen(this);
                const currentLen = this.__shadowLen;

                // --- 放行逻辑 (Allow List) ---

                // A. 处于“回车键清空”模式 (v1 逻辑)
                if (isManualClearing) {
                    this.__shadowLen = Math.max(0, currentLen - length);
                    return originalDelete.apply(this, arguments);
                }

                // B. 用户按下了删除键 (v2.1 核心修复：精确意图识别)
                // 只有 Backspace/Delete/Cut 触发的删除才被允许。
                // *重要*：粘贴操作触发的系统自动删除将被这里过滤掉。
                if (isDeletingKey) {
                    this.__shadowLen = Math.max(0, currentLen - length);
                    return originalDelete.apply(this, arguments);
                }

                // C. 清空/全选删除 (index=0)
                // 如果是从头开始删，通常是用户在清空
                if (index === 0) {
                    this.__shadowLen = Math.max(0, currentLen - length);
                    return originalDelete.apply(this, arguments);
                }

                // D. 中间编辑 (不涉及文末)
                // 如果删除范围没有触及文本末尾，说明这只是普通的编辑（如修改中间的错别字）
                // 只有触及末尾的删除才可能是“截断”
                if (index + length < currentLen) {
                    this.__shadowLen = Math.max(0, currentLen - length);
                    return originalDelete.apply(this, arguments);
                }

                // --- 拦截逻辑 (Block List) ---

                // 代码运行到这里，说明：
                // 1. 不是手动清空
                // 2. 用户没按删除键 (isDeletingKey = false) -> 这意味着可能是粘贴后触发的
                // 3. 涉及到了文末
                
                // 结论：这是 Gemini 发现字数超标后，自动调用的截断函数。
                console.warn(`🛡️ [v1.3] 已拦截 Gemini 自动截断 (Index: ${index}, Len: ${length})`);
                
                // 直接返回，不执行 originalDelete，从而保住文本
                return; 
            };
        }

        return originalDefineProperty.apply(this, arguments);
    };

    console.log("🚀 Gemini 字数限制解锁 (v1.3 修复粘贴截断版) 已注入");
})();
```

v1.0旧版源代码：
```
// ==UserScript==
// @name         Gemini 解除字数限制锁死 + 智能清空版
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  解决Gemini自拦截限制字数问题，支持纯回车清空
// @author       Azikaban & Gemini AI
// @match        *://gemini.google.com/*
// @grant        none
// @run-at       document-start
// @license      MIT
// ==/UserScript==

/*
  ==========================================================================
  COLLABORATION STATEMENT:
  This script was co-authored by a human user and Gemini (AI). Please review the code before using it.
  ==========================================================================
  MIT License

  Copyright (c) 2024 Gemini Helper

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
*/

(function() {
    'use strict';

    // 增加一个全局状态，标记当前是否处于“故意清空”状态
    let isManualClearing = false;

    const originalDefineProperty = Object.defineProperty;
    Object.defineProperty = function(obj, prop, descriptor) {
        if (prop === 'insertAt' && descriptor.value && typeof descriptor.value === 'function') {
            const originalInsert = descriptor.value;
            descriptor.value = function(pos, text, range) {
                if (typeof text === 'string') {
                    this.text = (this.text || "").slice(0, pos) + text + (this.text || "").slice(pos);
                }
                return originalInsert.apply(this, arguments);
            };
        }

        if (prop === 'deleteAt' && descriptor.value && typeof descriptor.value === 'function') {
            const originalDelete = descriptor.value;
            descriptor.value = function(t, e) {
                // 修改拦截逻辑：
                // 如果是手动清空状态 (isManualClearing 为 true)，或者是正常的单字删除 (e <= 1)，则放行
                if (isManualClearing || e <= 1) {
                    return originalDelete.apply(this, arguments);
                }

                // 否则，拦截系统自动截断
                if (e > 1 && (t + e) >= (this.text?.length || 0)) {
                    console.warn(`🛡️ 拦截了系统的自动截断动作`);
                    return;
                }
                return originalDelete.apply(this, arguments);
            };
        }
        return originalDefineProperty.apply(this, arguments);
    };

    window.addEventListener('keydown', function(event) {
        const editor = document.querySelector('.ql-editor');
        if (!editor || !editor.contains(event.target)) return;

        if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
            setTimeout(() => {
                const container = document.querySelector('.ql-container');
                if (container && container.__quill) {
                    console.log("🧹 正在执行合法的清空...");

                    // --- 开启通行证 ---
                    isManualClearing = true;

                    try {
                        container.__quill.setText('');
                    } finally {
                        // --- 动作完成后立即关闭通行证，恢复防御状态 ---
                        // 使用 setTimeout 确保在 Quill 内部异步逻辑执行完后再关闭
                        setTimeout(() => { isManualClearing = false; }, 50);
                    }
                }
            }, 150);
        }
    }, true);

    console.log("🛠️ 智能拦截模式已激活（已解决自拦截问题）");
})();
```
