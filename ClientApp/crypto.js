// NEVER FORGET TO BUILD THIS FILE AFTER EDITS: npm run build


import {
    getCiphersuiteImpl,
    getCiphersuiteFromName,
    generateKeyPackage,
    createGroup,
    createCommit,
    joinGroup,
    createApplicationMessage,
    processPrivateMessage,
    encodeMlsMessage,
    decodeMlsMessage,
    defaultCapabilities,
    defaultLifetime,
    emptyPskIndex,
    zeroOutUint8Array, 
    encodeGroupState, 
    decodeGroupState, 
    defaultProposalTypes,
} from "ts-mls";

import { defaultClientConfig } from "ts-mls/clientConfig.js";

import { get, set, del, update } from "idb-keyval";


// Crypto only works on bytes (Uint8Array), never on strings.
const toBytes = (text) => new TextEncoder().encode(text);
const toText = (bytes) => new TextDecoder().decode(bytes);
const toBase64 = (bytes) => bytes.toBase64();
const fromBase64 = (text) => Uint8Array.fromBase64(text);

// Ciphersuite 1 in the ts-mls README: X25519 + AES-128-GCM + Ed25519.
// This one needs no extra npm packages.
const SUITE = "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519";

async function makeUser(userId, impl) {
    let user;
    const credential = { credentialType: "basic", identity: toBytes(userId) };
    
    const saved = await get(`user:${userId}`);
    
    if(saved !== undefined) {
        return saved;
    }
    
    // Returns { publicPackage, privatePackage }
    //   publicPackage  -> safe to upload to the server
    //   privatePackage -> must NEVER leave this browser
    
    user = await generateKeyPackage(credential, defaultCapabilities(), defaultLifetime, [], impl);
    await set(`user:${userId}`, user);
    
    return user;
}

const fakeServer = async () => true;

// ─── STEP 5: the demo – Alice AND Bob, both inside this one browser tab ─
async function demo(text = "Hello Bob!") {
    const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));

    const alice = await makeUser("alice", impl);
    const bob = await makeUser("bob", impl);
    
    // Alice starts a group with only herself in it
    let aliceGroup = await createGroup(toBytes("chat-1"), alice.publicPackage, alice.privatePackage, [], impl);

    // Alice adds Bob. (Real app: she downloads Bob's publicPackage from the server.)
    const addBob = { proposalType: "add", add: { keyPackage: bob.publicPackage } };
    const commit = await createCommit({ state: aliceGroup, cipherSuite: impl }, { extraProposals: [addBob] });
    aliceGroup = commit.newState;
    commit.consumed.forEach(zeroOutUint8Array); // wipe used secret keys

    // Bob joins with the Welcome. (Real app: it reaches him through the server.)
    let bobGroup = await joinGroup(commit.welcome, bob.publicPackage, bob.privatePackage, emptyPskIndex, impl, aliceGroup.ratchetTree);

    // ── Alice encrypts ──
    const sent = await createApplicationMessage(aliceGroup, toBytes(text), impl);
    aliceGroup = sent.newState;
    sent.consumed.forEach(zeroOutUint8Array);
    
    console.log("Encrypted message: ", sent.privateMessage);

    // Turn it into raw bytes: THIS is what your server would store and relay
    const wireBytes = encodeMlsMessage({
        privateMessage: sent.privateMessage,
        wireformat: "mls_private_message",
        version: "mls10",
    });
    console.log("What the server sees:", wireBytes);

    // ── Bob decrypts ──
    const decoded = decodeMlsMessage(wireBytes, 0)[0];
    const received = await processPrivateMessage(bobGroup, decoded.privateMessage, emptyPskIndex, impl);
    bobGroup = received.newState;
    if (received.kind === "newState") throw new Error("Expected a chat message, got a group change");
    received.consumed.forEach(zeroOutUint8Array);

    const plain = toText(received.message);
    console.log("What Bob reads:", plain);
    return plain;
}

// Deletes old test groups so the tests can run again
// (inviteAccept refuses to join a group it already has)
async function resetTestGroups(chat, users) {
    for (const user of users) {
        await del(`${user}:group:${chat}`);
    }
}

//all tests are written by claude, seems correct and works
async function testGroupFlow() {
    const chat = "test-chat";
    await resetTestGroups(chat, ["test-alice", "test-bob"]);

    // Bob's key package as bytes (pretend Alice downloaded it from the server)
    const bobKeyPackage = await getMyKeyPackage("test-bob");
    console.log("0. Bob's key package bytes:", bobKeyPackage.length);

    // 1. Alice creates the group with Bob in it
    const welcomeBytes = await groupCreation("test-alice", chat, [{ keyPackage: bobKeyPackage }], fakeServer);
    console.log("1. Welcome bytes:", welcomeBytes.length);

    // Pretend the Welcome went through the server as base64 and back
    const welcomeFromServer = welcomeBytes;

    // 2. Bob accepts
    await inviteAccept("test-bob", chat, welcomeFromServer);
    console.log("2. Both saved a group:",
        !!(await get(`test-alice:group:${chat}`)),
        !!(await get(`test-bob:group:${chat}`)));

    // 3. Alice -> Bob
    let sent = await encryptMessage("Hello Bob!", "test-alice", chat);
    console.log("3. Bob reads:", await decryptMessage(sent, "test-bob", chat));

    // 4. Bob -> Alice
    sent = await encryptMessage("hay Alice:)", "test-bob", chat);
    console.log("4. Alice reads:", await decryptMessage(sent, "test-alice", chat));
}
async function testInviteFlow() {
    const chat = "test-invite-chat";
    await resetTestGroups(chat, ["test-alice", "test-bob", "test-carol"]);

    // Bob's and Carol's key packages as bytes (pretend they came from the server)
    const bobKeyPackage = await getMyKeyPackage("test-bob");
    const carolKeyPackage = await getMyKeyPackage("test-carol");

    // 1. Alice creates the group with only Bob
    const welcomeForBob = await groupCreation("test-alice", chat, [{ keyPackage: bobKeyPackage }], fakeServer);
    await inviteAccept("test-bob", chat, welcomeForBob);
    console.log("1. Bob reads:", await decryptMessage(
        await encryptMessage("hi Bob", "test-alice", chat), "test-bob", chat));

    // 2. Alice invites Carol later
    const invite = await inviteUsersToGroup("test-alice", chat, [{ keyPackage: carolKeyPackage }], fakeServer);
    console.log("2. Invite made. Welcome bytes:", invite.welcome.length, "Commit bytes:", invite.commit.length);

    // 3. Bob (already in the group) processes the commit -> should be null (no text, just a group change)
    console.log("3. Bob processes commit, returns:", await decryptMessage(invite.commit, "test-bob", chat));

    // 4. Carol joins with her Welcome
    await inviteAccept("test-carol", chat, invite.welcome);
    console.log("4. Carol joined");

    // 5. Alice sends -> Bob AND Carol can read it
    const fromAlice = await encryptMessage("welcome Carol!", "test-alice", chat);
    console.log("5. Bob reads:", await decryptMessage(fromAlice, "test-bob", chat));
    console.log("   Carol reads:", await decryptMessage(fromAlice, "test-carol", chat));

    // 6. Carol replies -> Alice AND Bob can read it
    const fromCarol = await encryptMessage("thanks for the invite", "test-carol", chat);
    console.log("6. Alice reads:", await decryptMessage(fromCarol, "test-alice", chat));
    console.log("   Bob reads:", await decryptMessage(fromCarol, "test-bob", chat));
}
async function testRemoveFlow() {
    const chat = "test-remove-chat";
    await resetTestGroups(chat, ["test-alice", "test-bob", "test-carol"]);

    // Everything below already speaks base64, exactly like the real app
    const bobKeyPackage = await getMyKeyPackage("test-bob");
    const carolKeyPackage = await getMyKeyPackage("test-carol");

    // 1. Alice makes a group with Bob AND Carol, both join
    const welcome = await groupCreation("test-alice", chat, [{ keyPackage: bobKeyPackage }, { keyPackage: carolKeyPackage }], fakeServer);
    await inviteAccept("test-bob", chat, welcome);
    await inviteAccept("test-carol", chat, welcome);

    const hello = await encryptMessage("hi both", "test-alice", chat);
    console.log("1. Bob reads:", await decryptMessage(hello, "test-bob", chat));
    console.log("   Carol reads:", await decryptMessage(hello, "test-carol", chat));

    // 2. Alice kicks Carol
    const { commit } = await removeUsersFromGroup("test-alice", chat, ["test-carol"], fakeServer);
    console.log("2. Remove commit made, length:", commit.length);

    // 3. EVERYONE processes the commit, including Carol (that's how she finds out)
    console.log("3. Bob processes commit, returns:", await decryptMessage(commit, "test-bob", chat));
    console.log("   Carol processes commit, returns:", await decryptMessage(commit, "test-carol", chat));
    const carolState = await loadGroupState("test-carol", chat);
    console.log("   Carol's state says:", carolState.groupActiveState.kind, "(should be removedFromGroup)");

    // 4. New message after the kick: Bob can read it, Carol can't
    const secret = await encryptMessage("carol is gone", "test-alice", chat);
    console.log("4. Bob reads:", await decryptMessage(secret, "test-bob", chat));
    try {
        console.log("   Carol reads:", await decryptMessage(secret, "test-carol", chat), "<- BAD, she shouldn't");
    } catch (err) {
        console.log("   Carol can't read it (good):", err.message);
    }

    // 5. Carol can't send anymore either
    try {
        await encryptMessage("let me back in", "test-carol", chat);
        console.log("5. Carol sent a message <- BAD");
    } catch (err) {
        console.log("5. Carol can't send (good):", err.message);
    }

    // 6. The error checks in removeUsersFromGroup
    for (const [who, label] of [["test-alice", "yourself"], ["test-carol", "someone already gone"]]) {
        try {
            await removeUsersFromGroup("test-alice", chat, [who], fakeServer);
            console.log(`6. Removing ${label} worked <- BAD`);
        } catch (err) {
            console.log(`6. Removing ${label} throws (good):`, err.message);
        }
    }
}

function withGroupLock(userId, conversationId, fn) {
    return navigator.locks.request(`mls:${userId}:${conversationId}`, fn);
}

async function loadGroupState(userId, conversationId) {
    const encodedGroupState = await get(`${userId}:group:${conversationId}`);
    if(encodedGroupState === undefined) {
        throw new Error(`No such group state in DB for user: ${userId} and conversationId: ${conversationId}`);
    }
    const groupState = decodeGroupState(encodedGroupState, 0)[0]
    return {...groupState, clientConfig: defaultClientConfig };
}

async function saveGroupState(userId, conversationId, groupState) {
    await set(`${userId}:group:${conversationId}`, encodeGroupState(groupState));
}

async function encryptMessage(message, userId, conversationId) {
    return withGroupLock(userId, conversationId, async () => {
        let groupState = await loadGroupState(userId, conversationId);
        const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));

        const encryptedMessage = await createApplicationMessage(groupState, toBytes(message), impl);
        groupState = encryptedMessage.newState;
        encryptedMessage.consumed.forEach(zeroOutUint8Array);

        await saveGroupState(userId, conversationId, groupState);

        const messageBytes = encodeMlsMessage({
            privateMessage: encryptedMessage.privateMessage,
            wireformat: "mls_private_message",
            version: "mls10",
        })

        return toBase64(messageBytes);
    })
}

async function decryptMessage(message, userId, conversationId) {
    return withGroupLock(userId, conversationId, async () => {
        const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));

        const decoded = decodeMlsMessage(fromBase64(message), 0)[0];
        if (decoded.wireformat !== "mls_private_message") {
            throw new Error("Not a private message");
        }
        let groupState = await loadGroupState(userId, conversationId);
        const decryptedMessage = await processPrivateMessage(groupState, decoded.privateMessage, emptyPskIndex, impl);

        groupState = decryptedMessage.newState;
        decryptedMessage.consumed.forEach(zeroOutUint8Array);

        await saveGroupState(userId, conversationId, groupState);

        if (decryptedMessage.kind === "applicationMessage") {
            return toText(decryptedMessage.message);
        } else {
            return null;
        }
    });
}

//creating the group, this would be for any conversation
async function groupCreation(userId, conversationId, groupMembers, sendCommit) {
    const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));
    
    const user = await makeUser(userId, impl);
    let userGroup = await createGroup(toBytes(conversationId), user.publicPackage, user.privatePackage, [], impl);
    await saveGroupState(userId, conversationId, userGroup);
    
    try {
        const result = await inviteUsersToGroup(userId, conversationId, groupMembers, sendCommit);
        return result.welcome;
    } catch (err) {
        await del(`${userId}:group:${conversationId}`)
        throw err;
    }
}

//lets the user into the group after they download the welcome after group creation(should be automatic)
async function inviteAccept(userId, conversationId, welcome) {
    return withGroupLock(userId, conversationId, async () => {
        const checkGroupStatus = await get(`${userId}:group:${conversationId}`);
        if(checkGroupStatus !== undefined) {
            throw new Error("Invite already accepted");
        }
    
        const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));
        const decodedWelcome = decodeMlsMessage(fromBase64(welcome), 0)[0]
        if (decodedWelcome.wireformat !== "mls_welcome") {
            throw new Error("Expected a welcome");
        }

        const user = await makeUser(userId, impl);
        let acceptInvite = await joinGroup(decodedWelcome.welcome, user.publicPackage, user.privatePackage, emptyPskIndex, impl);

        await saveGroupState(userId, conversationId, acceptInvite);
    });
}

//adding new users to the group
async function inviteUsersToGroup(userId, conversationId, newMembers, sendCommit) {
    if(newMembers.length === 0) {
        throw new Error("Not inviting anyone");
    }
    return withGroupLock(userId, conversationId, async () => {
        let groupState = await loadGroupState(userId, conversationId);
        const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));

        let addNewMembers = [];
        for (const member of newMembers) {
            const decodedMemberPackage = decodeMlsMessage(fromBase64(member.keyPackage), 0)[0];
            if (decodedMemberPackage.wireformat === "mls_key_package") {
                const addMember = {proposalType: "add", add: {keyPackage: decodedMemberPackage.keyPackage}};
                addNewMembers.push(addMember);
            } else {
                throw new Error("Member does not have keyPackage");
            }
        }

        
        const oldEpoch = Number(groupState.groupContext.epoch);
        const commit = await createCommit({state: groupState, cipherSuite: impl}, {
            extraProposals: addNewMembers,
            ratchetTreeExtension: true
        });
        
        groupState = commit.newState;
        commit.consumed.forEach(zeroOutUint8Array);
        

        const welcome = commit.welcome;
        const encodedCommit = toBase64(encodeMlsMessage(commit.commit));
        const encodedWelcome = toBase64(encodeMlsMessage({welcome, wireformat: "mls_welcome", version: "mls10"}))

        const ok = await sendCommit(encodedCommit, oldEpoch, conversationId);
        if(!ok){
            throw new Error("Commit rejected")
        }

        await saveGroupState(userId, conversationId, groupState);

        return {welcome: encodedWelcome, commit: encodedCommit};
    });
}




//removing another member of the group
async function removeUsersFromGroup(userId, conversationId, members, sendCommit) {
    return withGroupLock(userId, conversationId, async () => {
        let groupState = await loadGroupState(userId, conversationId);
        const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));

        let removedMembers = [];
        for (let memberId of members) {
            if (memberId === userId) {
                throw new Error("CAN'T REMOVE YOURSELF")
            }
            let leafIndex;
            const tree = groupState.ratchetTree;
            for (let i = 0; i < tree.length; i++) {

                const node = tree[i];
                if (node?.nodeType === "leaf" && toText(node.leaf.credential.identity) === memberId) {
                    leafIndex = i / 2;
                    break;
                }
            }
            if (leafIndex === undefined) {
                throw new Error("User not in group")
            }
            const removeUserProposal = {proposalType: "remove", remove: {removed: leafIndex},}
            removedMembers.push(removeUserProposal);

        }
        const removeUserCommit = await createCommit({
            state: groupState,
            cipherSuite: impl
        }, {extraProposals: removedMembers});
        
        const oldEpoch = Number(groupState.groupContext.epoch);
        groupState = removeUserCommit.newState;
        removeUserCommit.consumed.forEach(zeroOutUint8Array);
        
        const encodedCommit = toBase64(encodeMlsMessage(removeUserCommit.commit))

        const ok = await sendCommit(encodedCommit, oldEpoch, conversationId);
        if(!ok){
            throw new Error("Commit rejected")
        }

        await saveGroupState(userId, conversationId, groupState);
        
        return {commit: encodedCommit};
    });
}

async function getMyKeyPackage(userId){
    let keyPackage = await get(`user:${userId}`);
    if(keyPackage === undefined) {
        const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));
        keyPackage = await makeUser(userId, impl);
    }
    return toBase64(encodeMlsMessage({ keyPackage: keyPackage.publicPackage, wireformat: "mls_key_package", version: "mls10" }));
}

async function saveToHistory(userId, conversationId, entry) {
    await update(`${userId}:history:${conversationId}`, (oldValue) => {
        let history;
        if(oldValue == null) {
            history = []
        } else{
            history = oldValue
        }
        history.push({id: entry.id, senderId: entry.senderId, text: entry.text, time: Date.now()});
        return history;
    });
}

async function loadFromHistory(userId, conversationId) {
    return (await get(`${userId}:history:${conversationId}`) ?? []);
}

// ─── STEP 6: make it reachable from outside this module ───────────────
window.e2ee = {
    encryptMessage,
    decryptMessage,
    groupCreation,
    inviteUsersToGroup,
    inviteAccept,
    getMyKeyPackage,
    saveToHistory,
    loadFromHistory,
    removeUsersFromGroup,
    // tests, remove later
    testGroupFlow,
    testInviteFlow,
    testRemoveFlow,
};
console.log("e2ee loaded. Try in the console:  await e2ee.testGroupFlow()");