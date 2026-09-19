function scrollToBottom() {
    const box = document.querySelector('.messages');
    if (box) box.scrollTop = box.scrollHeight;
}

document.querySelectorAll('.sidebar a').forEach(link => {
    link.addEventListener('click', async (e) => {
        e.preventDefault();
        const res = await fetch(link.href);
        document.getElementById('message-area').innerHTML = await res.text();
        scrollToBottom();
    });
});

document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'send-form') return;
    e.preventDefault();

    const text = document.getElementById('message-input').value;
    if (!text.trim()) return;                    // 1. don't even send empty messages

    const friendId = e.target.dataset.friendId;
    const res = await fetch(`/Dashboard/SendMessage?friendId=${friendId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `text=${encodeURIComponent(text)}`
    });
    if (!res.ok) return;                         // 2. never paste an error response into the page

    document.getElementById('message-area').innerHTML = await res.text();
    scrollToBottom();
    document.getElementById('message-input').focus();
});

document.addEventListener('input', (e) => {
    if (e.target.id !== 'message-input') return;
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
});

document.addEventListener('keydown', (e) => {
    if (e.target.id !== 'message-input') return;
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('send-form').requestSubmit();
    }
});

const connection = new signalR.HubConnectionBuilder()
    .withUrl('/chathub')
    .withAutomaticReconnect()
    .build();

connection.on('ReceiveMessage', (senderId, text) => {
    const form = document.getElementById('send-form');
    if (!form || form.dataset.friendId !== senderId) return;   // not the open chat

    const box = document.querySelector('.messages');
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;

    const all = box.querySelectorAll('p[data-sender-id]');
    const last = all[all.length - 1];

    if (!last || last.dataset.senderId !== senderId) {
        const name = document.createElement('p');
        name.textContent = `${senderId}:`;
        box.appendChild(name);
    }

    const p = document.createElement('p');
    p.dataset.senderId = senderId;
    p.textContent = text;
    box.appendChild(p);

    if (nearBottom) scrollToBottom();
});

connection.start().catch(console.error);