
//gets the user id from the uuid on the homepage
const userId = document.getElementById('uuid')?.dataset.uuid;
const userName = document.getElementById('uuid')?.dataset.username;
const csrfToken = document.querySelector('input[name="__RequestVerificationToken"]')?.value;

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

//sends commits to the server(remove and invite to group(groupstate/epoch changes)) 
async function sendCommit (encodedCommit, groupEpoch, conversationId){
    const res = await fetch(`/Dashboard/SubmitCommit`,{
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'RequestVerificationToken': csrfToken},
        body: JSON.stringify({conversationId, epoch: groupEpoch, commit: encodedCommit}),
    })
    if(!res.ok) {
        throw new Error(`Couldn't commit group change: ${res.status}`);
    }
    return res.ok;
}

//deletes the group invite after it has been fetched
async function deleteWelcome(id) {
    const res = await fetch(`/Dashboard/DeleteWelcome?id=${id}`, {
        method: 'DELETE',
        headers: { 'RequestVerificationToken': csrfToken},
    });
    if(!res.ok) throw new Error("Could not delete Welcome");
}

let fetching = false;
let fetchAgain = false;

async function checkMailbox() {
    if (fetching) { fetchAgain = true; return; }   
    fetching = true;
    try {
        do {
            fetchAgain = false;
            await fetchPendingMessages();
        } while (fetchAgain);
    } finally {
        fetching = false;
    }
}

//gets messages to the user from the server and adds them to the open chat or adds a notification on the conversation button if not open
async function fetchPendingMessages(){
    const res = await fetch(`/Dashboard/Mailbox`);
    if(!res.ok) return;
    
    const messages = await res.json();
    const historyIds = new Map();
    
    for (const message of messages) {
        if(!historyIds.has(message.conversationId)){
            const history = await e2ee.loadFromHistory(userId, message.conversationId);
            historyIds.set(message.conversationId, new Set(history.map(entry => entry.id)));
        }
        
        if(historyIds.get(message.conversationId).has(message.id)){
            try{
                await deleteFetchedMessages(message.id);
            } catch(err){
                console.error(`failed to delete:${message.id}, Reason: ${err}`);
            }
            continue;
        }
        
        let decryptedText;
        try {
            decryptedText = await e2ee.decryptMessage(message.text, userId, message.conversationId);
        } catch (err) {
            if(err.message === 'Future epoch') continue;
            console.error('Could not decrypt:', err);
            try{
                await deleteFetchedMessages(message.id);
            } catch(err){
                console.error(`failed to delete:${message.id}, Reason: ${err}`);
            }
            
            continue
        }
        
        if (decryptedText === null) {   // group change, not a chat message
            try{
                await deleteFetchedMessages(message.id);
            } catch(err){
                console.error(`failed to delete:${message.id}, Reason: ${err}`);
            }
            continue;
        }
        message.text = decryptedText;
        message.timestamp = new Date(message.timestamp).getTime();
        await e2ee.saveToHistory(userId, message.conversationId, message);
        try{
            await deleteFetchedMessages(message.id);
        } catch(err){
            console.error(`failed to delete fetched message:${message.id}, Reason: ${err}`);
        }
        
        const form = document.getElementById('send-form');
        if (!form || form.dataset.conversationId !== message.conversationId) {
            addUnread(message.conversationId)
            continue
        }  // not the open chat
        appendMessage(message.senderId, message.senderName ?? message.senderId, decryptedText, message.timestamp);
    }
}

//deletes the message after it has been downloaded
async function deleteFetchedMessages(messageId){
    const res = await fetch(`/Dashboard/DeleteMessageFromDb?id=${messageId}`, {
        method: 'DELETE', 
        headers: { 'RequestVerificationToken': csrfToken },
    });
    if(!res.ok) throw new Error("Could not delete Message from database");
}

//get the public key package of a user, for group invitations
async function getKeyPackage(id){
    const res = await fetch(`/Dashboard/DownloadKeyPackage?userId=${id}`);
    if(!res.ok) return null;
    
    return await res.json();
}

//puts messages in the open conversation, builds it from scratch or just adds the newest message to the bottom
function appendMessage(senderId, senderName, text, dateTime){
    const box = document.querySelector('.messages')
    if (!box) return;

    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const all = box.querySelectorAll('.message-text[data-sender-id]');
    const last = all[all.length - 1];
    
    const allTimestamps = box.querySelectorAll('.message-text[data-date-time]');
    const lastTimestamp = allTimestamps[allTimestamps.length - 1];
    
    let lastMessageTime = null;
    if (lastTimestamp !== undefined){
        lastMessageTime = new Date(Number(lastTimestamp.dataset.dateTime));
    }
    const time = new Date(dateTime)
    const currentTime = new Date(Date.now());

    if (lastMessageTime === null || lastMessageTime.toDateString() !== time.toDateString()) {
        const dates = document.createElement('div');
        dates.classList.add('date');
        let datesSeparator = document.createElement('div');
        datesSeparator.classList.add('date-separator');
        
        dates.appendChild(datesSeparator);
        if(time.toDateString() !== currentTime.toDateString()){
            dates.append(`${time.toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric' })}`);
        } else {
            dates.append("Today");
        }
        dates.appendChild(datesSeparator.cloneNode(true));

        box.appendChild(dates);
    }
    
    
    if ((!last || last.dataset.senderId !== senderId) || (dateTime > (Number(lastTimestamp.dataset.dateTime) + 300000))) {
        const name = document.createElement('h6');
        //\u2022 dot
        name.textContent = `${senderName} \u2022 ${time.toLocaleString([], { hour: '2-digit', minute: '2-digit' })}`;
        name.dataset.senderId = senderId;
        if(senderId === userId) name.classList.add('self');
            
        box.appendChild(name);
    }

    const p = document.createElement('div');
    p.classList.add('message-text');
    p.dataset.senderId = senderId;
    p.dataset.dateTime = dateTime;
    if(senderId === userId) p.classList.add('self');
    
    if (window.markdown) p.innerHTML = window.markdown.renderMessage(text);
    else p.textContent = text;
    
    box.appendChild(p);

    if (nearBottom) scrollToBottom();
}

//loadhandler runs when the homepage is loaded/ runs necessary checks against database
window.addEventListener('DOMContentLoaded', async () => {
    if(!userId) return;
    console.log(userId);
    document.querySelectorAll('.unread').forEach(b => showUnread(b.dataset.conversationId));
    await getWelcomes();
    await checkMailbox();
    
    const res = await fetch('/Dashboard/UploadKeyPackage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'RequestVerificationToken': csrfToken },
        body: JSON.stringify({ keyPackage: await e2ee.getMyKeyPackage(userId) })
    })
    if (!res.ok) {
        console.error('Key Package failed to upload: ', res.status);
    }
    const openId = sessionStorage.getItem('openConversation');
    if(openId !== null && document.getElementById('message-area')){
        document.querySelector(`.sidebar a.friend[data-conversation-id="${openId}"]`)?.click();
    }
})

document.addEventListener('click', async (e) => {
    const button = e.target.closest('.start-dm');
    if (!button) return;

    const friendId = button.dataset.friendId;
    if (!userId || !friendId) return;

    button.disabled = true;
    try {
        const conversationId = await createGroupWith([friendId], 'DM', true);
        sessionStorage.setItem('openConversation', conversationId); // opens the new DM after reload
        if (!document.getElementById('message-area')) {
            location.href = '/Dashboard/Homepage';
        } else{
            await refreshFriendsList();
        }
        
    } catch (err) {
        console.error('Could not start DM:', err);
        button.disabled = false;
    }
});

async function createGroupWith(memberIds, conversationName, isDirect = false) {
    const members = [];
    for (const memberId of memberIds) {
        const keyPackage = await getKeyPackage(memberId);
        if (!keyPackage) throw new Error(`${memberId} has no key package yet (never logged in?)`);
        members.push({ userId: memberId, keyPackage });
    }
    
    const conversationId = crypto.randomUUID();
    const conversationCreation = await fetch('/Dashboard/ConversationCreation', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'RequestVerificationToken': csrfToken},
        body: JSON.stringify({ conversationId, conversationName, isDirect }),
    });
    if (!conversationCreation.ok) throw new Error(`Failed to create conversation: ${conversationCreation.status}`);
    const welcome = await e2ee.groupCreation(userId, conversationId, members, async () => true);
    
    for (const member of members) {
        const res = await fetch('/Dashboard/UploadGroupInvite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'RequestVerificationToken': csrfToken },
            body: JSON.stringify({ receiverId: member.userId, conversationId, welcome }),
        });
        if (!res.ok) throw new Error(`Invite upload failed for ${member.userId}: ${res.status}`);
    }

    return conversationId;
}

async function inviteToGroup(memberIds, conversationId) {
    const members = [];
    for (const memberId of memberIds) {
        const keyPackage = await getKeyPackage(memberId);
        if (!keyPackage) throw new Error(`${memberId} has no key package yet (never logged in?)`);
        members.push({ userId: memberId, keyPackage });
    }
    
    const invitePackage = await e2ee.inviteUsersToGroup(userId, conversationId, members, sendCommit);
    if (invitePackage == null) return;
    
    for (const member of members) {
        const res = await fetch('/Dashboard/UploadGroupInvite', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'RequestVerificationToken': csrfToken},
            body: JSON.stringify({ receiverId: member.userId, conversationId, welcome: invitePackage.welcome }),
        })
        if (!res.ok) throw new Error(`Invite upload failed for ${member.userId}: ${res.status}`);
    }
}

async function removeFromGroup(memberId, conversationId) {
    
    try {
        await e2ee.removeUsersFromGroup(userId, conversationId, [memberId], sendCommit);
    } catch (err){
        if(err.message !== "User not in group") throw err;
        console.warn(err.message);
    }
    
    const res = await fetch('/Dashboard/RemoveFromGroup', {
        method: 'DELETE',
        headers: {'Content-Type': 'application/json', 'RequestVerificationToken': csrfToken},
        body: JSON.stringify({memberId: memberId, conversationId: conversationId}),
    })
    if (!res.ok) throw new Error(`Failed to remove ${memberId} from server`);
    
    return true
}

//checks the locally stored members against what the server has
async function checkGroupHealth(conversationId, serverMembers) {
    let localMembers;
    try {
        localMembers = await e2ee.getGroupMembersFromGroupState(userId, conversationId);    
    } catch {
        return { trolledMembers: [], leavingMembers: [] };
    }

    const trolledMembers = serverMembers.filter(id => id !== userId && !localMembers.includes(id));
    const leavingMembers = localMembers.filter(id => id !== userId && !serverMembers.includes(id));
    
    return {trolledMembers, leavingMembers};
}

function scrollToBottom() {
    const box = document.querySelector('.messages');
    if (box) box.scrollTop = box.scrollHeight;
}

//uses the check to add warnings or remove the user(s)
async function rosterCheck(conversationId) {
    const serverMembers = [...document.querySelectorAll('#message-area [data-member-id]')].map(m => m.dataset.memberId)
    if(serverMembers.length > 0){
        const health = await checkGroupHealth(conversationId, serverMembers);
        try {
            if (health.leavingMembers.length > 0) {
                await e2ee.removeUsersFromGroup(userId, conversationId, health.leavingMembers, sendCommit);
            }
        } catch (err) {
            console.warn(err);
        }
        for (const memberId of health.trolledMembers) {
            const memberElement = document.querySelector(`#message-area [data-member-id="${memberId}"]`);
            memberElement?.classList.add('cant-read');
            if(memberElement) memberElement.title = "CAN'T READ MESSAGES IN THE GROUP CHAT";
        }
    }
}

async function refreshMemberList(conversationId){
    const res = await fetch(`/Dashboard/ConversationMemberList?id=${encodeURIComponent(conversationId)}`)
    if (!res.ok) return;
    const currentConversationId = document.getElementById('send-form')?.dataset.conversationId;
    if(currentConversationId !== conversationId) return;
    document.getElementById('member-panel').innerHTML = await res.text();
    await rosterCheck(conversationId);
}

async function refreshGroupsList(){
    const groupsList = document.getElementById('groups-list')
    if(!groupsList) return;
    
    const res = await fetch(`/Dashboard/GroupsList`)
    if (!res.ok || res.redirected) return;
    groupsList.innerHTML = await res.text();
    const openId = sessionStorage.getItem('openConversation');
    if(openId !== null && document.getElementById('message-area')){
        document.querySelector(`.sidebar a.friend[data-conversation-id="${openId}"]`)?.classList.add('active')
    }
}

async function refreshFriendsList(){
    const friendsList = document.getElementById('friends-list')
    if(!friendsList) return;
    
    const res = await fetch(`/Dashboard/FriendsList`)
    if (!res.ok || res.redirected) return;
    friendsList.innerHTML = await res.text();
    const openId = sessionStorage.getItem('openConversation');
    if(openId !== null && document.getElementById('message-area')){
        document.querySelector(`.sidebar a.friend[data-conversation-id="${openId}"]`)?.classList.add('active')
    }
}

document.addEventListener('click', async (e) => {
    const link = e.target.closest('.sidebar a.friend');
    if(link === null) return;
    e.preventDefault();
    if (!document.getElementById('message-area')) {
        sessionStorage.setItem('openConversation', link.dataset.conversationId);
        location.href = '/Dashboard/Homepage';
        return;
    }
    document.querySelectorAll('.sidebar a.active').forEach(a => a.classList.remove('active'));
    link.classList.add('active');
    clearUnread(link.dataset.conversationId);
    sessionStorage.setItem('openConversation', link.dataset.conversationId)
    const res = await fetch(link.href);
    if(!res.ok) return;
    document.getElementById('message-area').innerHTML = await res.text();
    
    const conversationId = document.getElementById('send-form')?.dataset.conversationId;
    const messages = await e2ee.loadFromHistory(userId, conversationId);
    for (const message of messages) {
        appendMessage(message.senderId, message.senderName ?? message.senderId, message.text, message.timestamp);
    }
    scrollToBottom();
    
    await rosterCheck(conversationId);
});

//conversation information window js
document.addEventListener('click', async (e) => {
    const button = e.target.closest('.kill-button');
    if (button == null) return;
    e.preventDefault();
    
    const conversationId = document.querySelector(`.friend.active`).dataset.conversationId;
    const memberId = e.target.closest('.dropdown').querySelector('.member-control').dataset.memberId;
    try {
        await removeFromGroup(memberId, conversationId);
        await refreshMemberList(conversationId);
    }catch(err) {
        console.error(err);
    }
})

//button for adding friend from dropdown menu in conversation window
document.addEventListener('click', async (e) => {
    const button = e.target.closest('.add-friend');
    if (button == null) return;
    e.preventDefault();
    
    const memberName = e.target.closest('.dropdown').querySelector('.member-control').textContent.trim();
    const conversationId = document.querySelector(`.friend.active`).dataset.conversationId;
    
    const res = await fetch(`/Dashboard/SendFriendRequest?username=${encodeURIComponent(memberName)}`, {
        method: 'POST',
        headers: { 'RequestVerificationToken': csrfToken }
    })
    if (!res.ok) return;
    await refreshMemberList(conversationId);
})

const groupDialog = document.getElementById('group-dialog');
document.addEventListener('click', e => {
    if(e.target.closest('#open-group-creator')) {
        groupDialog.showModal();
    }
    else if(e.target.closest('#open-group-invitor')) {
        document.getElementById('add-to-group-dialog')?.showModal();
    }
    else if(e.target.closest('#group-cancel')) {
        e.target.closest('dialog')?.close();
    }
})

document.addEventListener('click', async e => {
    if (!e.target.closest('#open-group-leaver')) return;
    e.preventDefault();

    const button = e.target.closest('#open-group-leaver')
    const conversationId = button.dataset.conversationId;
    
    const res = await fetch(`/Dashboard/LeaveGroup?conversationId=${conversationId}`, {
        method: 'DELETE',
        headers: {'RequestVerificationToken': csrfToken},
    })
    if (!res.ok) return;
    try {
        await e2ee.deleteGroupState(userId, conversationId);
        sessionStorage.removeItem('openConversation');
    } catch (err) {
        console.error(err);
    }
    await refreshGroupsList();
    document.getElementById('message-area').innerHTML = '';
})

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
        await refreshGroupsList();
        document.querySelector(`.sidebar a.friend[data-conversation-id="${conversationId}"]`)?.click();
    } catch (err) {
        console.error('Could not create group:', err);
    } finally {
        e.target.closest('dialog')?.close();
        submit.disabled = false;
    }
});

document.addEventListener('input', e => {
    if(e.target.id !== 'friend-search') return;
    
    const query = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#add-to-group-form [data-name]').forEach(possibleMembers => {
        possibleMembers.hidden = !possibleMembers.dataset.name.includes(query);
    })
})

document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'add-to-group-form') return;
    e.preventDefault();
    const form = e.target;
    const newMemberIds = [...form.querySelectorAll('input[name="member"]:checked')].map(c => c.value);
    if (newMemberIds.length === 0) return;

    const submit = form.querySelector('button[type="submit"]');
    const conversationId = document.getElementById('send-form')?.dataset.conversationId;
    if (!conversationId) return;
    
    submit.disabled = true;
    try {
        await inviteToGroup(newMemberIds, conversationId);
    } catch (err) {
        console.error('Could not invite group:', err);
    } finally {
        submit.disabled = false;
    }
    
})

function closeMemberMenus() {
    document.querySelectorAll('.member-control.show').forEach(b =>
        bootstrap.Dropdown.getInstance(b)?.hide()
    );
}

document.addEventListener('click', e => {
    closeMemberMenus();
    const button = e.target.closest('.member-control');
    if (!button) return;
    e.preventDefault();
    bootstrap.Dropdown.getOrCreateInstance(button).show();
})
//end



document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'send-form') return;
    e.preventDefault();

    const text = document.getElementById('message-input').value.trim();
    if (!text) return;
    
    const conversationId = e.target.dataset.conversationId;
    const encryptedText = await e2ee.encryptMessage(text, userId, conversationId);
    
    
    const res = await fetch(`/Dashboard/SendMessage?conversationId=${conversationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'RequestVerificationToken': csrfToken },
        body: `text=${encodeURIComponent(encryptedText)}`
    });
    if (!res.ok) return;
    
    const timestamp = Date.now();
    appendMessage(userId, userName, text, timestamp);
    await e2ee.saveToHistory(userId, conversationId, {senderId: userId, senderName: userName, text: text, timestamp: timestamp});
    
    scrollToBottom();
    const input = document.getElementById('message-input');
    input.value = '';
    input.style.height = '';
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

connection.on('ReceiveGroupInvite', async (conversationId) => {
    await getWelcomes();
    console.log("Welcome received");
    await refreshGroupsList();
    await refreshFriendsList();
    document.querySelectorAll('.unread').forEach(b => showUnread(b.dataset.conversationId));
})

connection.on('RemoveFromGroup', async (conversationId) => {
    const openId = sessionStorage.getItem('openConversation');
    if (openId === conversationId) {
        document.getElementById('message-area').innerHTML = '';
        sessionStorage.removeItem('openConversation');
    }
    await refreshGroupsList();
    document.querySelectorAll('.unread').forEach(b => showUnread(b.dataset.conversationId));
})

connection.on('MembersChanged', async (conversationId) => {
    await refreshMemberList(conversationId);
})

connection.on('MemberLeftGroup', async (memberId, conversationId) => {
    try {
        await e2ee.removeUsersFromGroup(userId, conversationId, [memberId], sendCommit)
    } catch (err) {
        console.warn('Someone else removed them:', err.message);
    }
    await refreshMemberList(conversationId);
})

connection.start().catch(console.error)
