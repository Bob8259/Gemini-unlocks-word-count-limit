// ==UserScript==
// @name         Gemini 解除字数限制锁死 + 智能清空版 (v1.3 修复粘贴截断)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  解决Gemini自拦截限制字数问题，修复v2版本粘贴大段文本时被误判截断的Bug，回归v1稳健逻辑
// @author       Azikaban & Gemini AI
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