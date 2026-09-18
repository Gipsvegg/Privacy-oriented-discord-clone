document.querySelectorAll('.sidebar a').forEach(link => {
    link.addEventListener('click', async (e) => {
        e.preventDefault();
        const res = await fetch(link.href);
        document.getElementById('message-area').innerHTML = await res.text();
    });
});

document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'send-form') return;
    e.preventDefault();

    const text = document.getElementById('message-input').value;
    const res = await fetch(`/Dashboard/SendMessage?friendId=2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `text=${encodeURIComponent(text)}`
    });
    document.getElementById('message-area').innerHTML = await res.text();
    document.getElementById('message-input').focus();
});

const input = document.getElementById('message-input');

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