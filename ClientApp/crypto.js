// NEVER FORGET TO BUILD THIS FILE AFTER EDITS: npm run build
// (the git hook builds on commit, but to TEST in the browser you have to build yourself)

// ─── STEP 1: bring in the functions we need from ts-mls ───────────────
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
    zeroOutUint8Array, encodeGroupState, decodeGroupState,
} from "ts-mls";

import { defaultClientConfig } from "ts-mls/clientConfig.js";

import { get, set, del } from "idb-keyval";

// ─── STEP 2: helpers to turn text into bytes and back ─────────────────
// Crypto only works on bytes (Uint8Array), never on strings.
const toBytes = (text) => new TextEncoder().encode(text);
const toText = (bytes) => new TextDecoder().decode(bytes);
const toBase64 = (bytes) => bytes.toBase64();
const fromBase64 = (text) => Uint8Array.fromBase64(text);


// ─── STEP 3: which crypto algorithms to use ───────────────────────────
// Ciphersuite 1 in the ts-mls README: X25519 + AES-128-GCM + Ed25519.
// This one needs no extra npm packages.
const SUITE = "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519";

// ─── STEP 4: a "user" = a name + a key package ────────────────────────
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

async function testGroupFlow() {
    const chat = "test-chat";
    await resetTestGroups(chat, ["test-alice", "test-bob"]);

    // Bob's key package as bytes (pretend Alice downloaded it from the server)
    const bobKeyPackage = await getMyKeyPackage("test-bob");
    console.log("0. Bob's key package bytes:", bobKeyPackage.length);

    // 1. Alice creates the group with Bob in it
    const welcomeBytes = await groupCreation("test-alice", chat, [{ keyPackage: bobKeyPackage }]);
    console.log("1. Welcome bytes:", welcomeBytes.length);

    // Pretend the Welcome went through the server as base64 and back
    const welcomeFromServer = fromBase64(toBase64(welcomeBytes));

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
    const welcomeForBob = await groupCreation("test-alice", chat, [{ keyPackage: bobKeyPackage }]);
    await inviteAccept("test-bob", chat, welcomeForBob);
    console.log("1. Bob reads:", await decryptMessage(
        await encryptMessage("hi Bob", "test-alice", chat), "test-bob", chat));

    // 2. Alice invites Carol later
    const invite = await inviteUsersToGroup("test-alice", chat, [{ keyPackage: carolKeyPackage }]);
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
    
    return messageBytes;
}

async function decryptMessage(message, userId, conversationId) {
    const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));
    
    const decoded = decodeMlsMessage(message, 0)[0];
    if(decoded.wireformat !== "mls_private_message") {
        throw new Error("Not a private message");
    }
    let groupState = await loadGroupState(userId, conversationId);
    const decryptedMessage = await processPrivateMessage(groupState, decoded.privateMessage, emptyPskIndex, impl);
    
    groupState = decryptedMessage.newState;
    decryptedMessage.consumed.forEach(zeroOutUint8Array);

    await saveGroupState(userId, conversationId, groupState);
    
    if(decryptedMessage.kind === "applicationMessage") {
        return toText(decryptedMessage.message);
    } else {
        return null;
    }
}

//creating the group, this would be for any conversation
async function groupCreation(userId, conversationId, groupMembers) {
    const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));
    
    const user = await makeUser(userId, impl);
    let userGroup = await createGroup(toBytes(conversationId), user.publicPackage, user.privatePackage, [], impl);
    await saveGroupState(userId, conversationId, userGroup);
    const result = await inviteUsersToGroup(userId, conversationId, groupMembers);
    
    
    return result.welcome;
}

//lets the user into the group after they download the welcome after group creation(should be automatic)
async function inviteAccept(userId, conversationId, welcome) {
    const checkGroupStatus = await get(`${userId}:group:${conversationId}`);
    if(checkGroupStatus !== undefined) {
        throw new Error("Invite already accepted");
    }
    
    const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));
    const decodedWelcome = decodeMlsMessage(welcome, 0)[0]
    if (decodedWelcome.wireformat !== "mls_welcome") {
        throw new Error("Expected a welcome");
    }
    
    const user = await makeUser(userId, impl);
    let acceptInvite = await joinGroup(decodedWelcome.welcome, user.publicPackage, user.privatePackage, emptyPskIndex, impl);

    await saveGroupState(userId, conversationId, acceptInvite);
}

//adding new users to the group
async function inviteUsersToGroup(userId, conversationId, newMembers) {
    if(newMembers.length === 0) {
        throw new Error("Not inviting anyone");
    }
    
    let groupState = await loadGroupState(userId, conversationId);
    const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));
    
    let addNewMembers = [];
    for (const member of newMembers) {
        const decodedMemberPackage = decodeMlsMessage(member.keyPackage, 0)[0];
        if (decodedMemberPackage.wireformat === "mls_key_package" ) {
            const addMember = { proposalType: "add", add: {keyPackage: decodedMemberPackage.keyPackage}};
            addNewMembers.push(addMember);    
        } else {
            throw new Error("Member does not have keyPackage");
        }
    }
    
    const commit = await createCommit({state: groupState, cipherSuite: impl}, { extraProposals: addNewMembers, ratchetTreeExtension: true });
    groupState = commit.newState;
    commit.consumed.forEach(zeroOutUint8Array);
    await saveGroupState(userId, conversationId, groupState);
    
    const welcome = commit.welcome;
    const encodedCommit = encodeMlsMessage(commit.commit);
    const encodedWelcome = encodeMlsMessage({welcome, wireformat: "mls_welcome", version: "mls10"})
    
    return { welcome: encodedWelcome, commit: encodedCommit };
}

async function getMyKeyPackage(userId){
    let keyPackage = await get(`user:${userId}`);
    if(keyPackage === undefined) {
        const impl = await getCiphersuiteImpl(getCiphersuiteFromName(SUITE));
        keyPackage = await makeUser(userId, impl);
    }
    return encodeMlsMessage({ keyPackage: keyPackage.publicPackage, wireformat: "mls_key_package", version: "mls10" });
}

// ─── STEP 6: make it reachable from outside this module ───────────────
window.e2ee = {
    encryptMessage,
    decryptMessage,
    groupCreation,
    inviteUsersToGroup,
    inviteAccept,
    getMyKeyPackage,
    // tests, remove later
    testGroupFlow,
    testInviteFlow,
};
console.log("e2ee loaded. Try in the console:  await e2ee.testGroupFlow()");