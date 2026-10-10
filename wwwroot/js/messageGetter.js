
//gets the user id from the uuid on the homepage
const userId = document.getElementById('uuid')?.dataset.uuid;
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
        // later: save to IndexedDB here
        message.text = decryptedText;
        await e2ee.saveToHistory(userId, message.conversationId, message);
        await deleteFetchedMessages(message.id)
        
        const form = document.getElementById('send-form');
        if (!form || form.dataset.conversationId !== message.conversationId) continue;   // not the open chat
        appendMessage(message.senderId, decryptedText);
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

function appendMessage(senderId, text){
    const box = document.querySelector('.messages')
    if (!box) return;

    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const all = box.querySelectorAll('p[data-sender-id]');
    const last = all[all.length - 1];

    if ((!last || last.dataset.senderId !== senderId)) {
        const name = document.createElement('h6');
        name.textContent = `${senderId}:`;
        box.appendChild(name);
    }

    const p = document.createElement('p');
    p.dataset.senderId = senderId;
    p.textContent = text;
    box.appendChild(p);

    if (nearBottom) scrollToBottom();
}

window.addEventListener('load', async () => {
    if(!userId) return;
    console.log(userId);
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
})

// Plus button in the conversation form -> create an encrypted group with the open chat's friend
document.addEventListener('click', async (e) => {
    const button = e.target.closest('#create-conversation');
    if (!button) return;

    const friendId = document.getElementById('create-conversation')?.dataset.conversationId;
    if (!userId || !friendId) return;

    button.disabled = true;              // no double clicks = no double groups
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

async function createGroupWith(memberIds) {
    const members = [];
    for (const memberId of memberIds) {
        const keyPackage = await getKeyPackage(memberId);
        if (!keyPackage) throw new Error(`${memberId} has no key package yet (never logged in?)`);
        members.push({ userId: memberId, keyPackage });
    }
    
    const conversationId = crypto.randomUUID();     
    const conversationName = "test"                                                 //HARDCODED FOR TESTING
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

document.querySelectorAll('.sidebar a[id]').forEach(link => {
    link.addEventListener('click', async (e) => {
        if(link.id !== 'friend') return;
        e.preventDefault();
        const res = await fetch(link.href);
        document.getElementById('message-area').innerHTML = await res.text();
        
        const conversationId = document.getElementById('send-form')?.dataset.conversationId;
        const messages = await e2ee.loadFromHistory(userId, conversationId);

        for (const message of messages) {
            appendMessage(message.senderId, message.text);
        }
        
        scrollToBottom();
    });
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
    appendMessage(userId, text);
    await e2ee.saveToHistory(userId, conversationId, {senderId: userId, text: text, time: Date.now()});
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
