

const userId = document.getElementById('uuid')?.dataset.uuid;
console.log(userId);
async function getWelcomes(){
    
    if(!userId) return;

    const res = await fetch(`/Dashboard/DownloadWelcome`)
    
    if(!res.ok) return;
    
    const data = await res.json();
    
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
    
    const messages = await res.json();                  //REMEMBER THIS IS NOT THE ONLY ONE
    const conversationId = "test"                 //THIS NEEDS TO NOT BE HARDCODED
                                                        //CHANGE WHEN CONVERSATION ID IS ADDED TO MESSAGES
    
    for (const message of messages) {
        let decryptedText;
        try {
            decryptedText = await e2ee.decryptMessage(message.text, userId, conversationId);
        } catch (err) {
            console.error('Could not decrypt:', err);
            continue
        }
        
        if (decryptedText === null) continue;   // group change, not a chat message
        // later: save to IndexedDB here
        message.text = decryptedText;
        await e2ee.saveToHistory(userId, conversationId, message);
        await deleteFetchedMessages(message.id)
        
        const form = document.getElementById('send-form');
        if (!form || form.dataset.friendId !== message.senderId) continue;   // not the open chat
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
    const button = e.target.closest('#create-group-btn');
    if (!button) return;

    const friendId = document.getElementById('send-form')?.dataset.friendId;
    if (!userId || !friendId) return;

    button.disabled = true;              // no double clicks = no double groups
    try {
        const conversationId = await createGroupWith([friendId]);
        console.log('Group created:', conversationId);
    } catch (err) {
        console.error('Could not create group:', err);
    } finally {
        button.disabled = false;
    }
});

async function createGroupWith(memberIds) {
    // 1. Every member needs a key package on the server, otherwise stop
    const members = [];
    for (const memberId of memberIds) {
        const keyPackage = await getKeyPackage(memberId);
        if (!keyPackage) throw new Error(`${memberId} has no key package yet (never logged in?)`);
        members.push({ userId: memberId, keyPackage });
    }

    // 2. Create the group in this browser (also saves our own group state in IndexedDB)
    const conversationId = "test" //crypto.randomUUID();                                            //MÅ BYTTES TIL CONVERSATION ID HER
    const welcome = await e2ee.groupCreation(userId, conversationId, members, sendCommit);

    // 3. Put the same Welcome in every member's mailbox on the server
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
        
        const conversationId = "test";      //NEEDS TO BE CHANGED WHEN DATABASE IS UPDATED TO CONTAIN THE CONVOID
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

    const friendId = e.target.dataset.friendId;
    const conversationId = "test";
    const encryptedText = await e2ee.encryptMessage(text, userId, "test");
    
    
    const res = await fetch(`/Dashboard/SendMessage?friendId=${friendId}&conversationId=${conversationId}`, {
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
});

connection.start().catch(console.error)
