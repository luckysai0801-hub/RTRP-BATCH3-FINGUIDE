/**
 * js/chat.js – FinBot AI Chatbot (Gemini Powered)
 */

// Initialize chat functionality
function initializeChatBot() {
    const toggle = document.getElementById('chatToggle');
    const bubble = document.getElementById('chatBubble');
    const closeBtn = document.getElementById('chatClose');
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSend');
    const messages = document.getElementById('chatMessages');

    if (!toggle) {
        console.error('Chat toggle button not found');
        return;
    }

    if (!bubble) {
        console.error('Chat bubble not found');
        return;
    }

    console.log('✅ Chat elements found, initializing...');

    let chatOpen = false;
    let conversationHistory = [];
    let isLoading = false;

    const quickSuggestions = [
        '💳 Best credit card for shopping?',
        '🏠 Home loan interest rates?',
        '📈 Fixed deposit returns?',
        '🤖 Personalized recommendations?',
        '💰 Compare credit cards',
        '🎯 Best cashback cards?',
    ];

    // Parse markdown
    const parseMD = (text) => {
        let html = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n\n/g, '<br><br>')
            .replace(/\n/g, '<br>');
        html = html.replace(/•\s(.*?)(<br>|$)/g, '<li>$1</li>');
        if (html.includes('<li>')) html = `<ul>${html}</ul>`.replace(/<br><ul>/g, '<ul>');
        return html;
    };

    // Get timestamp
    const getTimeString = () => {
        const now = new Date();
        return now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    // Add message
    const addMsg = (text, role = 'bot') => {
        const d = document.createElement('div');
        d.className = `msg ${role}`;

        const content = document.createElement('div');
        if (role === 'bot') {
            content.innerHTML = parseMD(text);
        } else {
            content.textContent = text;
        }
        d.appendChild(content);

        const time = document.createElement('span');
        time.className = 'msg-time';
        time.textContent = getTimeString();
        d.appendChild(time);

        messages.appendChild(d);
        messages.scrollTop = messages.scrollHeight;
    };

    // Show welcome
    const showWelcomeMessage = () => {
        messages.innerHTML = '';
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'chat-welcome';
        welcomeDiv.innerHTML = `
            <div class="welcome-header">
                <h3>👋 Hey there! I'm FinBot</h3>
                <p>Your AI financial advisor. Ask me anything about credit cards, loans, or FDs!</p>
            </div>
            <div class="quick-suggestions">
                <p style="font-size: .75rem; color: var(--text-light); margin-bottom: 10px;">Popular questions:</p>
                ${quickSuggestions.map((s) => `<button class="suggestion-btn" data-suggestion="${s}">${s}</button>`).join('')}
            </div>
        `;
        messages.appendChild(welcomeDiv);
        messages.scrollTop = messages.scrollHeight;

        // Add click handlers to suggestion buttons
        document.querySelectorAll('.suggestion-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                input.value = btn.dataset.suggestion;
                sendMsg();
            });
        });
    };

    // Send message
    const sendMsg = async () => {
        const msg = input.value.trim();
        if (!msg || isLoading) return;

        addMsg(msg, 'user');
        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;
        isLoading = true;

        const typing = document.createElement('div');
        typing.className = 'msg bot typing-indicator';
        typing.innerHTML = '<span>●</span><span>●</span><span>●</span>';
        messages.appendChild(typing);
        messages.scrollTop = messages.scrollHeight;

        try {
            const payload = { message: msg, history: conversationHistory };
            conversationHistory.push({ role: 'user', message: msg });

            const data = await FinAPI.post('/api/chat', payload);
            typing.remove();

            if (data.success) {
                addMsg(data.reply, 'bot');
                conversationHistory.push({ role: 'bot', message: data.reply });
            } else {
                addMsg('❌ Sorry, I had trouble connecting.', 'bot');
            }
        } catch (err) {
            console.error('Chat error:', err);
            typing.remove();
            addMsg('❌ Network error. Please try again.', 'bot');
        } finally {
            input.disabled = false;
            sendBtn.disabled = false;
            isLoading = false;
            input.focus();
        }
    };

    // Toggle chat
    toggle.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('Toggle clicked, chatOpen was:', chatOpen);
        
        chatOpen = !chatOpen;

        if (chatOpen) {
            console.log('Opening chat...');
            bubble.hidden = false;
            bubble.style.display = 'flex';
            bubble.style.opacity = '1';
            bubble.style.pointerEvents = 'auto';
            toggle.classList.add('chat-open');
            toggle.style.animation = 'none';
            setTimeout(() => input.focus(), 100);

            if (messages.children.length === 0) {
                showWelcomeMessage();
            }
        } else {
            console.log('Closing chat...');
            bubble.style.opacity = '0';
            bubble.style.pointerEvents = 'none';
            setTimeout(() => {
                if (!chatOpen) {
                    bubble.hidden = true;
                    bubble.style.display = 'none';
                }
            }, 200);
            toggle.classList.remove('chat-open');
            toggle.style.animation = 'bounce-pulse 2s ease-in-out infinite';
        }
    });

    // Close button
    closeBtn?.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        chatOpen = false;
        bubble.style.opacity = '0';
        bubble.style.pointerEvents = 'none';
        setTimeout(() => {
            if (!chatOpen) {
                bubble.hidden = true;
                bubble.style.display = 'none';
            }
        }, 200);
        toggle.classList.remove('chat-open');
        toggle.style.animation = 'bounce-pulse 2s ease-in-out infinite';
    });

    // Prevent bubble close on click
    bubble?.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Send button
    sendBtn?.addEventListener('click', sendMsg);

    // Enter to send
    input?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
            e.preventDefault();
            sendMsg();
        }
    });

    // Escape to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && chatOpen) {
            toggle.click();
        }
    });

    // Hide forever button
    const hideForeverBtn = document.createElement('button');
    hideForeverBtn.innerHTML = '🚫';
    hideForeverBtn.style.cssText = 'background:none; border:none; color:rgba(255,255,255,0.7); cursor:pointer; margin-left: auto; padding: 0 4px;';
    hideForeverBtn.title = 'Hide chatbot on all pages';
    hideForeverBtn.onclick = (e) => {
        e.stopPropagation();
        if (confirm("Hide the FinBot widget on all pages?")) {
            localStorage.setItem('fg_chat_hidden', 'true');
            toggle.style.display = 'none';
        }
    };
    document.querySelector('.chat-header')?.appendChild(hideForeverBtn);

    console.log('✅ ChatBot initialized successfully');
}

// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeChatBot);
} else {
    initializeChatBot();
}

// Also try after a short delay
setTimeout(initializeChatBot, 500);
