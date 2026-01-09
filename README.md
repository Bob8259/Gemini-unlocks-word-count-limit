
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
源代码：
```
// ==UserScript==
// @name         Gemini 解除字数限制锁死 + 智能清空版
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  解决Gemini自拦截限制字数问题，支持纯回车清空
// @author       Human & Gemini AI
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
