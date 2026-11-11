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

connection.on('ConversationNameChange', async (conversationId, newName) => {
    const currentConversationId = document.querySelector(`.friend.active`)?.dataset.conversationId;
    if(!currentConversationId) return;
    if (currentConversationId === conversationId) {
        document.querySelector('.conversation-name').textContent = newName;
    }
    await refreshGroupsList()
})

connection.on('FriendListUpdate', async (receiver) => {
    await refreshFriends()
    await refreshFriendsList()
    if(receiver !== null && receiver[0] === userId){
        if(receiver[1] === null) return;
        playSound(receiver[1])
    }
})

connection.start().catch(console.error)