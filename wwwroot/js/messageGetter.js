
//gets the user id from the uuid on the homepage
const userId = document.getElementById('uuid')?.dataset.uuid;
const userName = document.getElementById('uuid')?.dataset.username;
console.log(userId);
async function getWelcomes(){
    //downloads the group invite and waits for the data
    if(!userId) return;
    const res = await fetch(`/Dashboard/DownloadWelcome`)
    if(!res.ok) return;
    const data = await res.json();
    
    //goes through all the welcomes and deletes them from the server AFTER accepting them
    for (const welcome of data) {
        try {
            await e2ee.inviteAccept(userId, welcome.conversationId, welcome.data); 
            await deleteWelcome(welcome.id)
        }catch(err) {
            if(err.message === "Invite already accepted"){
                try {
                    await deleteWelcome(welcome.id)
                } catch (err){
                    console.error(err);
                }
            }
            console.error(err);
        }
    }
}

async function sendCommit (encodedCommit, groupEpoch, conversationId){
    const res = await fetch(`/Dashboard/SubmitCommit`,{
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({conversationId, epoch: groupEpoch, commit: encodedCommit}),
    })
    if(!res.ok) {
        throw new Error(`Couldn't commit group change: ${res.status}`);
    }
    return res.ok;
}

async function deleteWelcome(id) {
    const res = await fetch(`/Dashboard/DeleteWelcome?id=${id}`, {
        method: 'DELETE',
    });
    if(!res.ok) throw new Error("Could not delete Welcome");
}

let fetching = false;
let fetchAgain = false;

async function checkMailbox() {
    if (fetching) { fetchAgain = true; return; }   // busy -> leave a note and leave
    fetching = true;
    try {
        do {
            fetchAgain = false;
            await fetchPendingMessages();
        } while (fetchAgain);                      // a ping came in while working -> go again
    } finally {
        fetching = false;                          // finally = runs even if something threw
    }
}

async function fetchPendingMessages(){
    const res = await fetch(`/Dashboard/Mailbox`);
    if(!res.ok) return;
    
    const messages = await res.json();
    for (const message of messages) {
        let decryptedText;
        try {
            decryptedText = await e2ee.decryptMessage(message.text, userId, message.conversationId);
        } catch (err) {
            console.error('Could not decrypt:', err);
            continue
        }
        
        if (decryptedText === null) {   // group change, not a chat message
            await deleteFetchedMessages(message.id); 
            continue;
        }
        message.text = decryptedText;
        message.timestamp = new Date(message.timestamp).getTime();
        await e2ee.saveToHistory(userId, message.conversationId, message);
        await deleteFetchedMessages(message.id)
        
        const form = document.getElementById('send-form');
        if (!form || form.dataset.conversationId !== message.conversationId) {
            addUnread(message.conversationId)
            continue
        }  // not the open chat
        appendMessage(message.senderId, message.senderName ?? message.senderId, decryptedText, message.timestamp);
    }
}

async function deleteFetchedMessages(messageId){
    const res = await fetch(`/Dashboard/DeleteMessageFromDb?id=${messageId}`, {method: 'DELETE'});
    if(!res.ok) throw new Error("Could not delete Message from database");
}

async function getKeyPackage(id){
    const res = await fetch(`/Dashboard/DownloadKeyPackage?userId=${id}`);
    if(!res.ok) return null;
    
    return await res.json();
}

function appendMessage(senderId, senderName, text, dateTime){
    const box = document.querySelector('.messages')
    if (!box) return;

    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const all = box.querySelectorAll('p[data-sender-id]');
    const last = all[all.length - 1];
    
    const allTimestamps = box.querySelectorAll('p[data-date-time]');
    const lastTimestamp = allTimestamps[allTimestamps.length - 1];

    
    if ((!last || last.dataset.senderId !== senderId) || (dateTime > (Number(lastTimestamp.dataset.dateTime) + 300000))) {
        const name = document.createElement('h6');
        const time = new Date(dateTime)
        const currentTime = new Date(Date.now());
        
        if((time.getDate() === currentTime.getDate() - 1) && (time.getMonth() === currentTime.getMonth()) && (time.getFullYear() === currentTime.getFullYear())){
            name.textContent = `${senderName} \u2022 ${time.toLocaleString([], { day: '2-digit', month: 'long', year: 'numeric' })}`;
        } else {
            name.textContent = `${senderName} \u2022 ${time.toLocaleString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
        name.dataset.senderId = senderId;
        
        box.appendChild(name);
    }

    const p = document.createElement('p');
    p.dataset.senderId = senderId;
    p.dataset.dateTime = dateTime;
    p.textContent = text;
    box.appendChild(p);

    if (nearBottom) scrollToBottom();
}

//loadhandler runs when the homepage is loaded
window.addEventListener('DOMContentLoaded', async () => {
    if(!userId) return;
    console.log(userId);
    document.querySelectorAll('.unread').forEach(b => showUnread(b.dataset.conversationId));
    await getWelcomes();
    await checkMailbox();
    
    const res = await fetch('/Dashboard/UploadKeyPackage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyPackage: await e2ee.getMyKeyPackage(userId) })
    })
    if (!res.ok) {
        console.error('Key Package failed to upload: ', res.status);
    }
    const openId = sessionStorage.getItem('openConversation');
    if(openId !== null){
        document.querySelector(`.sidebar a.friend[data-conversation-id="${openId}"]`)?.click();
    }
})

document.addEventListener('click', async (e) => {
    const button = e.target.closest('#create-conversation');
    if (!button) return;

    const friendId = document.getElementById('create-conversation')?.dataset.conversationId;
    if (!userId || !friendId) return;

    button.disabled = true;
    try {
        const conversationId = await createGroupWith([friendId]);
        console.log('Group created:', conversationId);
        location.reload();
    } catch (err) {
        console.error('Could not create group:', err);
    } finally {
        button.disabled = false;
    }
});

async function createGroupWith(memberIds, conversationName) {
    const members = [];
    for (const memberId of memberIds) {
        const keyPackage = await getKeyPackage(memberId);
        if (!keyPackage) throw new Error(`${memberId} has no key package yet (never logged in?)`);
        members.push({ userId: memberId, keyPackage });
    }
    
    const conversationId = crypto.randomUUID();
    const conversationCreation = await fetch('/Dashboard/ConversationCreation', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ conversationId, conversationName }),
    });
    if (!conversationCreation.ok) throw new Error(`Failed to create conversation: ${conversationCreation.status}`);
    const welcome = await e2ee.groupCreation(userId, conversationId, members, async () => true);
    
    
    for (const member of members) {
        const res = await fetch('/Dashboard/UploadGroupInvite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ receiverId: member.userId, conversationId, welcome }),
        });
        if (!res.ok) throw new Error(`Invite upload failed for ${member.userId}: ${res.status}`);
    }

    return conversationId;
}

function scrollToBottom() {
    const box = document.querySelector('.messages');
    if (box) box.scrollTop = box.scrollHeight;
}

document.querySelectorAll('.sidebar a.friend').forEach(link => {
    link.addEventListener('click', async (e) => {
        e.preventDefault();
        document.querySelectorAll('.sidebar a.active').forEach(a => a.classList.remove('active'));
        link.classList.add('active');
        clearUnread(link.dataset.conversationId);
        sessionStorage.setItem('openConversation', link.dataset.conversationId)
        const res = await fetch(link.href);
        document.getElementById('message-area').innerHTML = await res.text();
        
        const conversationId = document.getElementById('send-form')?.dataset.conversationId;
        const messages = await e2ee.loadFromHistory(userId, conversationId);

        for (const message of messages) {
            appendMessage(message.senderId, message.senderName ?? message.senderId, message.text, message.timestamp);
        }
        
        scrollToBottom();
    });
});

const groupDialog = document.getElementById('group-dialog');
document.getElementById('open-group-creator')?.addEventListener('click', () => groupDialog.showModal());
document.getElementById('group-cancel')?.addEventListener('click', () => groupDialog.close());

document.getElementById('group-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.groupName.value.trim();
    const memberIds = [...form.querySelectorAll('input[name="member"]:checked')].map(c => c.value);
    if (!name || memberIds.length === 0) return;

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
        const conversationId = await createGroupWith(memberIds, name);
        sessionStorage.setItem('openConversation', conversationId);   // opens the new group after reload
        location.reload();
    } catch (err) {
        console.error('Could not create group:', err);
    } finally {
        submit.disabled = false;
    }
});

document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'send-form') return;
    e.preventDefault();

    const text = document.getElementById('message-input').value.trim();
    if (!text) return;                    // 1. don't even send empty messages
    
    const conversationId = e.target.dataset.conversationId;
    const encryptedText = await e2ee.encryptMessage(text, userId, conversationId);
    
    
    const res = await fetch(`/Dashboard/SendMessage?conversationId=${conversationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `text=${encodeURIComponent(encryptedText)}`
    });
    if (!res.ok) return;                         // 2. never paste an error response into the page
    
    const timestamp = Date.now();
    appendMessage(userId, userName, text, timestamp);
    await e2ee.saveToHistory(userId, conversationId, {senderId: userId, senderName: userName, text: text, timestamp: timestamp});
    //document.getElementById('message-area').innerHTML = await res.text();
    scrollToBottom();
    const input = document.getElementById('message-input');
    input.value = '';
    input.style.height = '';      // setting .value doesn't fire 'input', so reset the auto-grow height by hand
    input.focus();
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

function unreadKey(conversationId) { return `unread:${userId}:${conversationId}`; }

function showUnread(conversationId) {
    const badge = document.querySelector(`.unread[data-conversation-id="${conversationId}"]`);
    if (!badge) return;
    const count = Number(localStorage.getItem(unreadKey(conversationId)) ?? 0);
    badge.textContent = count;
    badge.hidden = count === 0;
}

function addUnread(conversationId) {
    const count = Number(localStorage.getItem(unreadKey(conversationId)) ?? 0) + 1;
    localStorage.setItem(unreadKey(conversationId), count);
    showUnread(conversationId);
}

function clearUnread(conversationId) {
    localStorage.removeItem(unreadKey(conversationId));
    showUnread(conversationId);
}

const connection = new signalR.HubConnectionBuilder()
    .withUrl('/chathub')
    .withAutomaticReconnect()
    .build();

connection.on('ReceiveMessage', async () => {
    console.log("checking mailbox");
    await checkMailbox();
    console.log("mailbox checked");
});

connection.on('ReceiveGroupInvite', async () => {
    await getWelcomes();
    console.log("Welcome received");
    location.reload();
});

connection.start().catch(console.error)
